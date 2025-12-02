/**
 * Detailed analysis of "Not Found" cases
 *
 * Run with: npx tsx scripts/analyze-not-found-details.ts
 */

import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

const sql = neon(process.env.DATABASE_URL!);

interface CSVRow {
  requirement: string;
  associate: string;
  courseId: string | null;
  status: string;
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
      courseId: idMatch ? idMatch[1] : null
    });
  }

  return rows;
}

function extractTCode(courseName: string): string | null {
  const match = courseName.match(/\b(T\d+[A-Z]?)\b/i);
  return match ? match[1].toUpperCase() : null;
}

async function analyze() {
  console.log('=== Detailed Analysis of "Not Found" Cases ===\n');

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
  const courses = await sql`SELECT course_id FROM courses`;
  const courseSet = new Set<string>();
  courses.forEach((c: any) => courseSet.add(c.course_id));

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

  // Find not found cases
  const notFoundByCourse = new Map<string, { name: string; tCode: string | null; count: number; employees: string[] }>();
  const notFoundByEmployee = new Map<string, { courses: string[]; count: number }>();

  for (const row of rows) {
    const employeeId = employeeMap.get(row.associate.toLowerCase());
    if (!employeeId) continue;
    if (!row.courseId) continue;
    if (!courseSet.has(row.courseId)) continue;

    // Check exact match
    if (trainingSet.has(`${employeeId}-${row.courseId}`)) continue;

    // Check group match
    const groupId = courseToGroup.get(row.courseId);
    if (groupId) {
      const groupCourses = groupToCourses.get(groupId);
      if (groupCourses) {
        let hasMatch = false;
        for (const gc of groupCourses) {
          if (trainingSet.has(`${employeeId}-${gc}`)) {
            hasMatch = true;
            break;
          }
        }
        if (hasMatch) continue;
      }
    }

    // This is a "not found" case
    const tCode = extractTCode(row.requirement);

    if (!notFoundByCourse.has(row.courseId)) {
      notFoundByCourse.set(row.courseId, {
        name: row.requirement,
        tCode,
        count: 0,
        employees: []
      });
    }
    const courseData = notFoundByCourse.get(row.courseId)!;
    courseData.count++;
    if (courseData.employees.length < 5) {
      courseData.employees.push(row.associate);
    }

    if (!notFoundByEmployee.has(row.associate)) {
      notFoundByEmployee.set(row.associate, { courses: [], count: 0 });
    }
    const empData = notFoundByEmployee.get(row.associate)!;
    empData.count++;
    if (empData.courses.length < 10) {
      empData.courses.push(row.courseId);
    }
  }

  // Analysis 1: By Course
  console.log('=== Not Found by Course (Top 30) ===\n');
  const sortedCourses = [...notFoundByCourse.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log('Course ID | T-Code | Count | Course Name');
  console.log('-'.repeat(80));
  sortedCourses.slice(0, 30).forEach(([courseId, data]) => {
    const shortName = data.name.substring(0, 50);
    console.log(`${courseId.padEnd(10)} | ${(data.tCode || 'N/A').padEnd(6)} | ${String(data.count).padEnd(5)} | ${shortName}...`);
  });

  // Analysis 2: By Employee
  console.log('\n\n=== Employees with Most Missing Courses (Top 20) ===\n');
  const sortedEmployees = [...notFoundByEmployee.entries()].sort((a, b) => b[1].count - a[1].count);

  sortedEmployees.slice(0, 20).forEach(([employee, data]) => {
    console.log(`${employee}: ${data.count} missing courses`);
    console.log(`  Course IDs: ${data.courses.join(', ')}${data.count > 10 ? '...' : ''}`);
  });

  // Analysis 3: By T-Code
  console.log('\n\n=== Not Found by T-Code ===\n');
  const byTCode = new Map<string, number>();
  for (const [, data] of notFoundByCourse) {
    const tCode = data.tCode || 'No T-Code';
    byTCode.set(tCode, (byTCode.get(tCode) || 0) + data.count);
  }

  const sortedTCodes = [...byTCode.entries()].sort((a, b) => b[1] - a[1]);
  sortedTCodes.forEach(([tCode, count]) => {
    console.log(`${tCode.padEnd(10)}: ${count} records`);
  });

  // Summary
  console.log('\n\n=== Summary ===\n');
  console.log(`Total "Not Found" records: ${[...notFoundByCourse.values()].reduce((sum, d) => sum + d.count, 0)}`);
  console.log(`Unique courses: ${notFoundByCourse.size}`);
  console.log(`Unique employees: ${notFoundByEmployee.size}`);
}

analyze()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
