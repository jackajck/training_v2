/**
 * Add missing courses from course_compare.csv to the database
 * and assign them to appropriate T-code groups
 *
 * Run with:
 *   npx tsx scripts/add-missing-courses.ts --preview   # See what would be added
 *   npx tsx scripts/add-missing-courses.ts --import    # Actually add them
 */

import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

const sql = neon(process.env.DATABASE_URL!);

interface MissingCourse {
  courseId: string;
  courseName: string;
  tCode: string | null;
  count: number;
}

function parseCSV(content: string): { courseId: string; requirement: string }[] {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/);
  const rows: { courseId: string; requirement: string }[] = [];

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

    if (idMatch) {
      rows.push({
        courseId: idMatch[1],
        requirement
      });
    }
  }

  return rows;
}

function extractTCode(courseName: string): string | null {
  // Match T-codes like T717, T719, T142, T586, etc.
  // Also match things like T684A, T692C, T533A, etc.
  const match = courseName.match(/\b(T\d+[A-Z]?)\b/i);
  return match ? match[1].toUpperCase() : null;
}

async function addMissingCourses(preview: boolean) {
  console.log(preview ? '=== PREVIEW MODE ===' : '=== IMPORT MODE ===');
  console.log('');

  // Read CSV
  const csvPath = path.join(process.cwd(), 'course_compare.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);
  console.log(`Parsed ${rows.length} rows from CSV\n`);

  // Get existing courses
  const existingCourses = await sql`SELECT course_id FROM courses`;
  const existingSet = new Set<string>();
  existingCourses.forEach((c: any) => existingSet.add(c.course_id));
  console.log(`Existing courses in DB: ${existingSet.size}`);

  // Get existing course groups
  const existingGroups = await sql`SELECT group_id, group_code FROM course_groups`;
  const groupMap = new Map<string, number>();
  existingGroups.forEach((g: any) => groupMap.set(g.group_code, g.group_id));
  console.log(`Existing course groups: ${groupMap.size}\n`);

  // Find missing courses
  const missingCourses = new Map<string, MissingCourse>();

  for (const row of rows) {
    if (existingSet.has(row.courseId)) continue;

    if (!missingCourses.has(row.courseId)) {
      // Extract course name from requirement string
      // Format: "SPPIVT T717 Machines and Machine Guarding - Recertification (OL)(14351)"
      let courseName = row.requirement;
      // Remove the course ID at the end
      courseName = courseName.replace(/\(\d+\)\s*$/, '').trim();
      // Remove trailing (OL) or (IL) if present
      courseName = courseName.replace(/\((OL|IL)\)\s*$/, '').trim();

      const tCode = extractTCode(courseName);

      missingCourses.set(row.courseId, {
        courseId: row.courseId,
        courseName,
        tCode,
        count: 0
      });
    }
    missingCourses.get(row.courseId)!.count++;
  }

  console.log(`Found ${missingCourses.size} missing courses\n`);

  // Categorize by T-code
  const byTCode = new Map<string, MissingCourse[]>();
  const noTCode: MissingCourse[] = [];

  for (const course of missingCourses.values()) {
    if (course.tCode) {
      if (!byTCode.has(course.tCode)) {
        byTCode.set(course.tCode, []);
      }
      byTCode.get(course.tCode)!.push(course);
    } else {
      noTCode.push(course);
    }
  }

  // Show what we found
  console.log('=== Missing Courses by T-Code ===\n');

  const sortedTCodes = [...byTCode.keys()].sort();
  for (const tCode of sortedTCodes) {
    const courses = byTCode.get(tCode)!;
    const hasGroup = groupMap.has(tCode);
    console.log(`${tCode} (${hasGroup ? 'group exists' : 'NO GROUP - will create'}):`);
    for (const c of courses) {
      console.log(`  ${c.courseId}: ${c.courseName.substring(0, 60)}... (${c.count} records)`);
    }
    console.log('');
  }

  if (noTCode.length > 0) {
    console.log('=== Courses with no T-Code (will not be grouped) ===\n');
    for (const c of noTCode) {
      console.log(`  ${c.courseId}: ${c.courseName.substring(0, 60)}... (${c.count} records)`);
    }
    console.log('');
  }

  // Now do the actual import if not preview
  if (!preview) {
    console.log('=== Adding courses to database ===\n');

    let coursesAdded = 0;
    let groupsCreated = 0;
    let groupMembersAdded = 0;

    // Add all missing courses to courses table
    for (const course of missingCourses.values()) {
      await sql`
        INSERT INTO courses (course_id, course_name, duration_months, is_active)
        VALUES (${course.courseId}, ${course.courseName}, 12, true)
        ON CONFLICT (course_id) DO NOTHING
      `;
      coursesAdded++;
    }
    console.log(`Added ${coursesAdded} courses to courses table`);

    // Create any missing groups and add courses to groups
    for (const [tCode, courses] of byTCode) {
      let groupId = groupMap.get(tCode);

      // Create group if it doesn't exist
      if (!groupId) {
        const result = await sql`
          INSERT INTO course_groups (group_code, group_name, is_enabled)
          VALUES (${tCode}, ${tCode + ' Group'}, true)
          RETURNING group_id
        `;
        groupId = result[0].group_id as number;
        groupMap.set(tCode, groupId);
        groupsCreated++;
        console.log(`Created new group: ${tCode}`);
      }

      // Add courses to the group
      for (const course of courses) {
        await sql`
          INSERT INTO course_group_members (group_id, course_id)
          VALUES (${groupId}, ${course.courseId})
          ON CONFLICT DO NOTHING
        `;
        groupMembersAdded++;
      }
    }

    console.log(`\nCreated ${groupsCreated} new groups`);
    console.log(`Added ${groupMembersAdded} course-group memberships`);
  }

  // Summary
  console.log('\n=== SUMMARY ===\n');
  console.log(`Total missing courses: ${missingCourses.size}`);
  console.log(`  With T-code (will be grouped): ${missingCourses.size - noTCode.length}`);
  console.log(`  Without T-code (standalone): ${noTCode.length}`);

  const existingGroupCount = [...byTCode.keys()].filter(t => groupMap.has(t)).length;
  const newGroupCount = [...byTCode.keys()].filter(t => !groupMap.has(t)).length;
  console.log(`\nT-code groups:`);
  console.log(`  Existing groups to add to: ${existingGroupCount}`);
  console.log(`  New groups to create: ${newGroupCount}`);

  if (preview) {
    console.log('\n=== Run with --import to apply these changes ===');
  } else {
    console.log('\n=== IMPORT COMPLETE ===');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const preview = args.includes('--preview');
  const doImport = args.includes('--import');

  if (!preview && !doImport) {
    console.log('Usage:');
    console.log('  npx tsx scripts/add-missing-courses.ts --preview   # See what would be added');
    console.log('  npx tsx scripts/add-missing-courses.ts --import    # Actually add them');
    process.exit(1);
  }

  await addMissingCourses(preview);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
