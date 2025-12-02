/**
 * Analyze "Not Found" cases from course compare
 *
 * Run with: npx tsx scripts/analyze-not-found.ts
 */

import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

const sql = neon(process.env.DATABASE_URL!);

interface CSVRow {
  requirement: string;
  associate: string;
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
      courseId: idMatch ? idMatch[1] : null
    });
  }

  return rows;
}

async function analyze() {
  console.log('=== Analyzing "Not Found" Cases ===\n');

  // Read CSV
  const csvPath = path.join(process.cwd(), 'course_compare.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);

  // Load employees
  const employees = await sql`SELECT employee_id, employee_name FROM employees`;
  const employeeMap = new Map<string, number>();
  employees.forEach((e: any) => {
    employeeMap.set(e.employee_name.toLowerCase(), e.employee_id);
  });

  // Load courses
  const courses = await sql`SELECT course_id, course_name FROM courses`;
  const courseSet = new Set<string>();
  courses.forEach((c: any) => {
    courseSet.add(c.course_id);
  });

  // Load training records
  const training = await sql`SELECT DISTINCT employee_id, course_id FROM employee_training`;
  const trainingSet = new Set<string>();
  training.forEach((t: any) => {
    trainingSet.add(`${t.employee_id}-${t.course_id}`);
  });

  // Load course groups
  const courseGroups = await sql`
    SELECT cg.group_id, cgm.course_id
    FROM course_groups cg
    JOIN course_group_members cgm ON cg.group_id = cgm.group_id
    WHERE cg.is_enabled = true
  `;
  const courseToGroup = new Map<string, number>();
  const groupToCourses = new Map<number, Set<string>>();
  courseGroups.forEach((cg: any) => {
    courseToGroup.set(cg.course_id, cg.group_id);
    if (!groupToCourses.has(cg.group_id)) {
      groupToCourses.set(cg.group_id, new Set());
    }
    groupToCourses.get(cg.group_id)!.add(cg.course_id);
  });

  // Analyze not found cases
  const notFoundReasons: Record<string, { count: number; examples: string[] }> = {
    'Course not in DB': { count: 0, examples: [] },
    'Employee has no training for this course': { count: 0, examples: [] },
    'No course ID in requirement': { count: 0, examples: [] }
  };

  const missingCourses = new Map<string, { name: string; count: number }>();

  for (const row of rows) {
    const employeeId = employeeMap.get(row.associate.toLowerCase());
    if (!employeeId) continue; // Skip employee not found (different category)

    if (!row.courseId) {
      notFoundReasons['No course ID in requirement'].count++;
      if (notFoundReasons['No course ID in requirement'].examples.length < 5) {
        notFoundReasons['No course ID in requirement'].examples.push(row.requirement);
      }
      continue;
    }

    // Check if course exists in our DB
    if (!courseSet.has(row.courseId)) {
      notFoundReasons['Course not in DB'].count++;

      // Track which courses are missing
      if (!missingCourses.has(row.courseId)) {
        missingCourses.set(row.courseId, { name: row.requirement, count: 0 });
      }
      missingCourses.get(row.courseId)!.count++;
      continue;
    }

    // Course exists - check if employee has it (exact or group match)
    const exactKey = `${employeeId}-${row.courseId}`;
    if (trainingSet.has(exactKey)) {
      continue; // Has exact match - not a "not found"
    }

    // Check group match
    const groupId = courseToGroup.get(row.courseId);
    if (groupId) {
      const groupCourses = groupToCourses.get(groupId);
      if (groupCourses) {
        let hasGroupMatch = false;
        for (const gc of groupCourses) {
          if (trainingSet.has(`${employeeId}-${gc}`)) {
            hasGroupMatch = true;
            break;
          }
        }
        if (hasGroupMatch) continue; // Has group match - not a "not found"
      }
    }

    // Truly not found - employee doesn't have this course
    notFoundReasons['Employee has no training for this course'].count++;
    if (notFoundReasons['Employee has no training for this course'].examples.length < 5) {
      notFoundReasons['Employee has no training for this course'].examples.push(
        `${row.associate}: ${row.requirement}`
      );
    }
  }

  // Print results
  console.log('=== Breakdown of "Not Found" Cases ===\n');

  for (const [reason, data] of Object.entries(notFoundReasons)) {
    console.log(`${reason}: ${data.count}`);
    if (data.examples.length > 0) {
      console.log('  Examples:');
      data.examples.forEach(ex => console.log(`    - ${ex.substring(0, 80)}...`));
    }
    console.log('');
  }

  // Show missing courses
  if (missingCourses.size > 0) {
    console.log('\n=== Courses in CSV but NOT in our Database ===\n');

    // Sort by count descending
    const sorted = [...missingCourses.entries()].sort((a, b) => b[1].count - a[1].count);

    console.log(`Total unique missing courses: ${sorted.length}\n`);
    console.log('Top 20 by frequency:');
    sorted.slice(0, 20).forEach(([courseId, data]) => {
      // Extract just the course name part
      const nameMatch = data.name.match(/SPPIVT\s+(.+?)\s*\(/);
      const shortName = nameMatch ? nameMatch[1] : data.name.substring(0, 50);
      console.log(`  ${courseId}: ${shortName} (${data.count} records)`);
    });

    console.log('\nAll missing course IDs:');
    console.log(sorted.map(([id]) => id).join(', '));
  }
}

analyze()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
