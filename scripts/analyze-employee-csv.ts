/**
 * Analyze a specific employee's CSV records vs our database
 *
 * Run with: npx tsx scripts/analyze-employee-csv.ts "Burke,John R"
 */

import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

const sql = neon(process.env.DATABASE_URL!);

interface CSVRow {
  requirement: string;
  associate: string;
  status: string;
  expireDate: string;
  courseId: string | null;
}

function parseCSV(content: string): CSVRow[] {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/);
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const matches = line.match(/(?:^|,)("(?:[^"]*(?:""[^"]*)*)"|[^,]*)/g);
    if (!matches || matches.length < 4) continue;

    const fields = matches.map(m => {
      let val = m.startsWith(',') ? m.slice(1) : m;
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      return val.trim();
    });

    const requirement = fields[0];
    const idMatch = requirement.match(/\((\d+)\)\s*$/);

    rows.push({
      requirement,
      associate: fields[1],
      status: fields[2],
      expireDate: fields[3],
      courseId: idMatch ? idMatch[1] : null
    });
  }

  return rows;
}

function extractTCode(courseName: string): string | null {
  const match = courseName.match(/\b(T\d+[A-Z]?)\b/i);
  return match ? match[1].toUpperCase() : null;
}

async function analyzeEmployee(employeeName: string) {
  console.log(`\n=== Analyzing: ${employeeName} ===\n`);

  // Read CSV
  const csvPath = path.join(process.cwd(), 'course_compare.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const allRows = parseCSV(content);

  // Filter for this employee (case-insensitive partial match)
  const searchLower = employeeName.toLowerCase();
  const employeeRows = allRows.filter(r => r.associate.toLowerCase().includes(searchLower));

  if (employeeRows.length === 0) {
    console.log(`No records found in CSV for "${employeeName}"`);
    console.log('\nTry one of these names:');
    const uniqueNames = [...new Set(allRows.map(r => r.associate))].filter(n =>
      n.toLowerCase().includes('burke')
    );
    uniqueNames.forEach(n => console.log(`  - ${n}`));
    return;
  }

  const exactName = employeeRows[0].associate;
  console.log(`Found ${employeeRows.length} records in CSV for: ${exactName}\n`);

  // Find employee in our DB
  const dbEmployee = await sql`
    SELECT employee_id, employee_name, is_active
    FROM employees
    WHERE LOWER(employee_name) = LOWER(${exactName})
  `;

  if (dbEmployee.length === 0) {
    console.log(`⚠️  Employee NOT FOUND in our database!`);
    console.log('\nCSV Records:');
    employeeRows.forEach(r => {
      console.log(`  ${r.courseId || 'N/A'}: ${r.requirement.substring(0, 60)}...`);
    });
    return;
  }

  const employee = dbEmployee[0];
  console.log(`Database: ${employee.employee_name} (ID: ${employee.employee_id}, Active: ${employee.is_active})\n`);

  // Get employee's training from our DB
  const dbTraining = await sql`
    SELECT et.course_id, c.course_name, et.expiration_date
    FROM employee_training et
    JOIN courses c ON et.course_id = c.course_id
    WHERE et.employee_id = ${employee.employee_id}
  `;

  const dbTrainingSet = new Set<string>();
  const dbTrainingMap = new Map<string, { name: string; expiration: string | null }>();
  dbTraining.forEach((t: any) => {
    dbTrainingSet.add(t.course_id);
    dbTrainingMap.set(t.course_id, {
      name: t.course_name,
      expiration: t.expiration_date
    });
  });

  console.log(`Training records in our DB: ${dbTraining.length}`);
  console.log(`Training records in CSV: ${employeeRows.length}\n`);

  // Load course groups
  const courseGroups = await sql`
    SELECT cg.group_id, cg.group_code, cgm.course_id
    FROM course_groups cg
    JOIN course_group_members cgm ON cg.group_id = cgm.group_id
    WHERE cg.is_enabled = true
  `;
  const courseToGroup = new Map<string, { groupId: number; groupCode: string }>();
  const groupToCourses = new Map<number, Set<string>>();
  courseGroups.forEach((cg: any) => {
    courseToGroup.set(cg.course_id, { groupId: cg.group_id, groupCode: cg.group_code });
    if (!groupToCourses.has(cg.group_id)) {
      groupToCourses.set(cg.group_id, new Set());
    }
    groupToCourses.get(cg.group_id)!.add(cg.course_id);
  });

  // Load position requirements
  const positionCourses = await sql`
    SELECT DISTINCT pc.course_id
    FROM position_courses pc
    JOIN positions p ON pc.position_id = p.position_id
    WHERE p.is_active = true
  `;
  const requiredCourses = new Set<string>();
  positionCourses.forEach((pc: any) => requiredCourses.add(pc.course_id));

  // Load courses table
  const courses = await sql`SELECT course_id FROM courses`;
  const courseSet = new Set<string>();
  courses.forEach((c: any) => courseSet.add(c.course_id));

  // Analyze each CSV row
  const exactMatches: any[] = [];
  const groupMatches: any[] = [];
  const notFound: any[] = [];
  const courseNotInDb: any[] = [];

  for (const row of employeeRows) {
    if (!row.courseId) {
      notFound.push({ ...row, reason: 'No course ID in requirement' });
      continue;
    }

    if (!courseSet.has(row.courseId)) {
      courseNotInDb.push(row);
      continue;
    }

    // Check exact match
    if (dbTrainingSet.has(row.courseId)) {
      const dbInfo = dbTrainingMap.get(row.courseId);
      exactMatches.push({ ...row, dbExpiration: dbInfo?.expiration });
      continue;
    }

    // Check group match
    const groupInfo = courseToGroup.get(row.courseId);
    if (groupInfo) {
      const groupCourses = groupToCourses.get(groupInfo.groupId);
      if (groupCourses) {
        let matchedCourse: string | null = null;
        for (const gc of groupCourses) {
          if (dbTrainingSet.has(gc)) {
            matchedCourse = gc;
            break;
          }
        }
        if (matchedCourse) {
          const dbInfo = dbTrainingMap.get(matchedCourse);
          groupMatches.push({
            ...row,
            groupCode: groupInfo.groupCode,
            matchedCourseId: matchedCourse,
            dbExpiration: dbInfo?.expiration
          });
          continue;
        }
      }
    }

    // Not found
    const tCode = extractTCode(row.requirement);
    const isRequired = requiredCourses.has(row.courseId);
    notFound.push({
      ...row,
      tCode,
      inGroup: !!groupInfo,
      groupCode: groupInfo?.groupCode || null,
      isRequiredByPosition: isRequired,
      reason: 'No training record'
    });
  }

  // Print results
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n✅ Exact Match: ${exactMatches.length}`);
  console.log(`🟣 Group Match: ${groupMatches.length}`);
  console.log(`❌ Not Found: ${notFound.length}`);
  console.log(`⚠️  Course Not in DB: ${courseNotInDb.length}\n`);

  if (exactMatches.length > 0) {
    console.log('='.repeat(80));
    console.log('EXACT MATCHES');
    console.log('='.repeat(80));
    exactMatches.forEach(m => {
      const tCode = extractTCode(m.requirement) || 'N/A';
      const isRequired = requiredCourses.has(m.courseId);
      console.log(`\n  ${m.courseId} (${tCode}) ${isRequired ? '📋 REQUIRED' : '🔸 Not required'}`);
      console.log(`    CSV: ${m.requirement.substring(0, 55)}...`);
      console.log(`    CSV Exp: ${m.expireDate} | DB Exp: ${m.dbExpiration || 'N/A'}`);
    });
  }

  if (groupMatches.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('GROUP MATCHES');
    console.log('='.repeat(80));
    groupMatches.forEach(m => {
      const isRequired = requiredCourses.has(m.courseId);
      console.log(`\n  ${m.courseId} → ${m.matchedCourseId} (${m.groupCode}) ${isRequired ? '📋 REQUIRED' : '🔸 Not required'}`);
      console.log(`    CSV: ${m.requirement.substring(0, 55)}...`);
      console.log(`    Matched via group ${m.groupCode}`);
      console.log(`    CSV Exp: ${m.expireDate} | DB Exp: ${m.dbExpiration || 'N/A'}`);
    });
  }

  if (notFound.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('NOT FOUND (CSV has it, we don\'t)');
    console.log('='.repeat(80));

    const requiredNotFound = notFound.filter(n => n.isRequiredByPosition);
    const rogueNotFound = notFound.filter(n => !n.isRequiredByPosition);

    if (requiredNotFound.length > 0) {
      console.log(`\n⚠️  REQUIRED BY POSITION (${requiredNotFound.length}):`);
      requiredNotFound.forEach(n => {
        console.log(`\n  ${n.courseId} (${n.tCode || 'N/A'}) 📋 REQUIRED`);
        console.log(`    ${n.requirement.substring(0, 60)}...`);
        console.log(`    CSV Status: ${n.status} | CSV Exp: ${n.expireDate}`);
        console.log(`    In group: ${n.inGroup ? n.groupCode : 'No'}`);
      });
    }

    if (rogueNotFound.length > 0) {
      console.log(`\n🔸 NOT REQUIRED BY ANY POSITION - "Rogue" (${rogueNotFound.length}):`);
      rogueNotFound.forEach(n => {
        console.log(`\n  ${n.courseId} (${n.tCode || 'N/A'})`);
        console.log(`    ${n.requirement.substring(0, 60)}...`);
        console.log(`    CSV Status: ${n.status} | CSV Exp: ${n.expireDate}`);
      });
    }
  }

  if (courseNotInDb.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('COURSE NOT IN OUR DATABASE');
    console.log('='.repeat(80));
    courseNotInDb.forEach(c => {
      const tCode = extractTCode(c.requirement) || 'N/A';
      console.log(`\n  ${c.courseId} (${tCode})`);
      console.log(`    ${c.requirement.substring(0, 60)}...`);
    });
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('FINAL ANALYSIS');
  console.log('='.repeat(80));

  const totalRequired = exactMatches.filter(m => requiredCourses.has(m.courseId)).length +
                        groupMatches.filter(m => requiredCourses.has(m.courseId)).length;
  const missingRequired = notFound.filter(n => n.isRequiredByPosition).length;
  const rogueCount = notFound.filter(n => !n.isRequiredByPosition).length;

  console.log(`\nFor ${exactName}:`);
  console.log(`  Total CSV records: ${employeeRows.length}`);
  console.log(`  Matched (exact + group): ${exactMatches.length + groupMatches.length}`);
  console.log(`  Position-required courses matched: ${totalRequired}`);
  console.log(`  Position-required courses MISSING: ${missingRequired}`);
  console.log(`  Rogue courses (not required, not in DB): ${rogueCount + courseNotInDb.length}`);
}

const employeeName = process.argv[2];
if (!employeeName) {
  console.log('Usage: npx tsx scripts/analyze-employee-csv.ts "LastName,FirstName"');
  console.log('Example: npx tsx scripts/analyze-employee-csv.ts "Burke,John R"');
  process.exit(1);
}

analyzeEmployee(employeeName)
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
