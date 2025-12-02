/**
 * Script to create course_groups table and populate it with T-code groupings
 *
 * This allows the system to treat multiple courses with the same T-code as equivalent.
 * For example, T717 has 3 different course IDs - if an employee has ANY of them,
 * they satisfy the T717 requirement.
 *
 * Run with: npx tsx scripts/create-course-groups.ts
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function createCourseGroups() {
  console.log('=== Creating Course Groups ===\n');

  // Step 1: Create the course_groups table
  console.log('1. Creating course_groups table...');
  await sql`
    CREATE TABLE IF NOT EXISTS course_groups (
      group_id SERIAL PRIMARY KEY,
      group_code VARCHAR(20) NOT NULL UNIQUE,
      group_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('   ✓ course_groups table created\n');

  // Step 2: Create the course_group_members junction table
  console.log('2. Creating course_group_members table...');
  await sql`
    CREATE TABLE IF NOT EXISTS course_group_members (
      group_id INTEGER REFERENCES course_groups(group_id) ON DELETE CASCADE,
      course_id VARCHAR(50) REFERENCES courses(course_id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, course_id)
    )
  `;
  console.log('   ✓ course_group_members table created\n');

  // Step 3: Extract T-codes from existing courses
  console.log('3. Extracting T-codes from courses...');
  const courses = await sql`SELECT course_id, course_name FROM courses ORDER BY course_name`;

  const groups: Record<string, { ids: string[], name: string }> = {};

  courses.forEach((course: any) => {
    // Match T-codes like T717, T704A, T704B
    const match = course.course_name.match(/\b(T\d+[A-Z]?)\b/);
    if (match) {
      const tcode = match[1];
      if (!groups[tcode]) {
        // Use the first course name as the group name (strip the variant suffix)
        const baseName = course.course_name
          .replace(/\s*-\s*(PARENT|Initial|Recertification|IL|OL|OJT).*$/i, '')
          .replace(/\s*\((IL|OL|OJT|IL OL|IL OJT|OL OJT)\).*$/i, '')
          .trim();
        groups[tcode] = { ids: [], name: baseName };
      }
      groups[tcode].ids.push(course.course_id);
    }
  });

  // Filter to only groups with multiple courses
  const multiGroups = Object.entries(groups).filter(([_, v]) => v.ids.length > 1);
  console.log(`   Found ${multiGroups.length} T-codes with multiple courses\n`);

  // Step 4: Insert groups
  console.log('4. Inserting course groups...');
  let insertedGroups = 0;
  let insertedMembers = 0;

  for (const [code, data] of multiGroups) {
    try {
      // Check if group already exists
      const existing = await sql`SELECT group_id FROM course_groups WHERE group_code = ${code}`;

      let groupId: number;

      if (existing.length > 0) {
        groupId = existing[0].group_id;
        console.log(`   - ${code}: already exists (${data.ids.length} courses)`);
      } else {
        // Insert new group
        const result = await sql`
          INSERT INTO course_groups (group_code, group_name)
          VALUES (${code}, ${data.name})
          RETURNING group_id
        `;
        groupId = result[0].group_id;
        insertedGroups++;
        console.log(`   + ${code}: created (${data.ids.length} courses)`);
      }

      // Insert group members
      for (const courseId of data.ids) {
        try {
          await sql`
            INSERT INTO course_group_members (group_id, course_id)
            VALUES (${groupId}, ${courseId})
            ON CONFLICT (group_id, course_id) DO NOTHING
          `;
          insertedMembers++;
        } catch (e) {
          // Course might not exist in courses table
          console.log(`     ! Skipped course_id ${courseId} (may not exist)`);
        }
      }
    } catch (e) {
      console.error(`   ! Error with ${code}:`, e);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Groups created: ${insertedGroups}`);
  console.log(`Total group members linked: ${insertedMembers}`);

  // Step 5: Verify T717 specifically
  console.log('\n=== Verifying T717 Group ===');
  const t717 = await sql`
    SELECT cg.group_code, cg.group_name, cgm.course_id, c.course_name
    FROM course_groups cg
    JOIN course_group_members cgm ON cg.group_id = cgm.group_id
    JOIN courses c ON cgm.course_id = c.course_id
    WHERE cg.group_code = 'T717'
  `;
  console.log(JSON.stringify(t717, null, 2));
}

createCourseGroups()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
