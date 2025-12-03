/**
 * Analyze "Not Found" cases to see:
 * 1. Do these courses have other IDs in the same T-code group that employees HAVE completed?
 * 2. Are these courses even required by any positions in our database?
 *
 * Run with: npx tsx scripts/analyze-not-found-groups.ts
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
  console.log('=== Analyzing "Not Found" - Group & Position Coverage ===\n');

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
  const courseNames = new Map<string, string>();
  courses.forEach((c: any) => {
    courseSet.add(c.course_id);
    courseNames.set(c.course_id, c.course_name);
  });

  // Load training records
  const training = await sql`SELECT DISTINCT employee_id, course_id FROM employee_training`;
  const trainingSet = new Set<string>();
  training.forEach((t: any) => {
    trainingSet.add(`${t.employee_id}-${t.course_id}`);
  });

  // Load course groups with all members
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
    SELECT DISTINCT pc.course_id, p.position_name
    FROM position_courses pc
    JOIN positions p ON pc.position_id = p.position_id
    WHERE p.is_active = true
  `;
  const courseToPositions = new Map<string, Set<string>>();
  positionCourses.forEach((pc: any) => {
    if (!courseToPositions.has(pc.course_id)) {
      courseToPositions.set(pc.course_id, new Set());
    }
    courseToPositions.get(pc.course_id)!.add(pc.position_name);
  });

  // Find "Not Found" cases and analyze them
  const notFoundAnalysis = new Map<string, {
    courseName: string;
    count: number;
    inGroup: boolean;
    groupCode: string | null;
    otherCoursesInGroup: string[];
    hasPositionRequirement: boolean;
    positions: string[];
    employeesWhoHaveOtherGroupCourse: number;
  }>();

  for (const row of rows) {
    const employeeId = employeeMap.get(row.associate.toLowerCase());
    if (!employeeId) continue;
    if (!row.courseId) continue;
    if (!courseSet.has(row.courseId)) continue;

    // Check exact match
    if (trainingSet.has(`${employeeId}-${row.courseId}`)) continue;

    // Check group match
    const groupInfo = courseToGroup.get(row.courseId);
    if (groupInfo) {
      const groupCourses = groupToCourses.get(groupInfo.groupId);
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

    // This is a "not found" case - analyze it
    if (!notFoundAnalysis.has(row.courseId)) {
      const groupData = courseToGroup.get(row.courseId);
      const otherCourses: string[] = [];

      if (groupData) {
        const groupCourses = groupToCourses.get(groupData.groupId);
        if (groupCourses) {
          for (const gc of groupCourses) {
            if (gc !== row.courseId) {
              otherCourses.push(`${gc} (${courseNames.get(gc)?.substring(0, 40) || 'Unknown'}...)`);
            }
          }
        }
      }

      const positions = courseToPositions.get(row.courseId);

      notFoundAnalysis.set(row.courseId, {
        courseName: row.requirement,
        count: 0,
        inGroup: !!groupData,
        groupCode: groupData?.groupCode || null,
        otherCoursesInGroup: otherCourses,
        hasPositionRequirement: !!positions && positions.size > 0,
        positions: positions ? Array.from(positions) : [],
        employeesWhoHaveOtherGroupCourse: 0
      });
    }

    notFoundAnalysis.get(row.courseId)!.count++;
  }

  // Now count how many employees have OTHER courses in the same group
  for (const [courseId, analysis] of notFoundAnalysis) {
    if (!analysis.inGroup) continue;

    const groupInfo = courseToGroup.get(courseId);
    if (!groupInfo) continue;

    const groupCourses = groupToCourses.get(groupInfo.groupId);
    if (!groupCourses) continue;

    // For each "not found" instance of this course, check if employee has any other group course
    let employeesWithOther = 0;
    for (const row of rows) {
      if (row.courseId !== courseId) continue;
      const employeeId = employeeMap.get(row.associate.toLowerCase());
      if (!employeeId) continue;

      for (const gc of groupCourses) {
        if (gc !== courseId && trainingSet.has(`${employeeId}-${gc}`)) {
          employeesWithOther++;
          break;
        }
      }
    }
    analysis.employeesWhoHaveOtherGroupCourse = employeesWithOther;
  }

  // Summary stats
  let inGroupCount = 0;
  let notInGroupCount = 0;
  let hasPositionReqCount = 0;
  let noPositionReqCount = 0;
  let couldBeResolvedByGroup = 0;

  for (const [, analysis] of notFoundAnalysis) {
    if (analysis.inGroup) {
      inGroupCount += analysis.count;
      if (analysis.employeesWhoHaveOtherGroupCourse > 0) {
        couldBeResolvedByGroup += analysis.employeesWhoHaveOtherGroupCourse;
      }
    } else {
      notInGroupCount += analysis.count;
    }

    if (analysis.hasPositionRequirement) {
      hasPositionReqCount += analysis.count;
    } else {
      noPositionReqCount += analysis.count;
    }
  }

  console.log('=== SUMMARY ===\n');
  console.log(`Total "Not Found" records: ${inGroupCount + notInGroupCount}`);
  console.log(`Unique courses: ${notFoundAnalysis.size}\n`);

  console.log('--- By Group Membership ---');
  console.log(`In a T-code group: ${inGroupCount} records`);
  console.log(`NOT in any group: ${notInGroupCount} records\n`);

  console.log('--- By Position Requirement ---');
  console.log(`Required by a position: ${hasPositionReqCount} records`);
  console.log(`NOT required by any position (rogue): ${noPositionReqCount} records\n`);

  console.log('--- Potential Group Resolution ---');
  console.log(`Employees who have another course in same group: ${couldBeResolvedByGroup}`);
  console.log(`(These SHOULD have been resolved - may indicate a bug)\n`);

  // Detailed breakdown
  console.log('\n=== COURSES IN GROUPS (but still Not Found) ===\n');
  const inGroupCourses = [...notFoundAnalysis.entries()]
    .filter(([, a]) => a.inGroup)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [courseId, analysis] of inGroupCourses.slice(0, 20)) {
    console.log(`Course ${courseId} (${analysis.groupCode}) - ${analysis.count} not found`);
    console.log(`  Name: ${analysis.courseName.substring(0, 60)}...`);
    console.log(`  Position required: ${analysis.hasPositionRequirement ? 'YES - ' + analysis.positions.slice(0, 3).join(', ') : 'NO'}`);
    console.log(`  Other courses in group: ${analysis.otherCoursesInGroup.length}`);
    if (analysis.otherCoursesInGroup.length > 0) {
      analysis.otherCoursesInGroup.slice(0, 3).forEach(c => console.log(`    - ${c}`));
    }
    console.log(`  Employees with other group course: ${analysis.employeesWhoHaveOtherGroupCourse}`);
    console.log('');
  }

  console.log('\n=== COURSES NOT IN ANY GROUP ===\n');
  const notInGroupCourses = [...notFoundAnalysis.entries()]
    .filter(([, a]) => !a.inGroup)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [courseId, analysis] of notInGroupCourses.slice(0, 20)) {
    console.log(`Course ${courseId} - ${analysis.count} not found`);
    console.log(`  Name: ${analysis.courseName.substring(0, 60)}...`);
    console.log(`  Position required: ${analysis.hasPositionRequirement ? 'YES - ' + analysis.positions.slice(0, 3).join(', ') : 'NO (rogue)'}`);
    console.log('');
  }

  console.log('\n=== ROGUE COURSES (not in group AND not required by any position) ===\n');
  const rogueCourses = [...notFoundAnalysis.entries()]
    .filter(([, a]) => !a.inGroup && !a.hasPositionRequirement)
    .sort((a, b) => b[1].count - a[1].count);

  console.log(`Total rogue courses: ${rogueCourses.length}`);
  console.log(`Total rogue records: ${rogueCourses.reduce((sum, [, a]) => sum + a.count, 0)}\n`);

  for (const [courseId, analysis] of rogueCourses) {
    console.log(`  ${courseId}: ${analysis.courseName.substring(0, 50)}... (${analysis.count} records)`);
  }
}

analyze()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
