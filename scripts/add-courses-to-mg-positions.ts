import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function addCoursesToMGPositions() {
  console.log('=== Adding Courses to MG_ Positions ===\n');

  // Find all employee training records where the employee has an MG_ position
  // and the course is not already in that MG_ position
  const toAdd = await sql`
    SELECT DISTINCT ep.position_id, et.course_id, c.course_name
    FROM employee_training et
    JOIN employee_positions ep ON et.employee_id = ep.employee_id
    JOIN courses c ON et.course_id = c.course_id
    LEFT JOIN position_courses pc ON ep.position_id = pc.position_id AND et.course_id = pc.course_id
    WHERE ep.position_id LIKE 'MG_%'
    AND pc.position_id IS NULL
    ORDER BY ep.position_id, c.course_name
  `;

  console.log(`Found ${toAdd.length} course-position combinations to add\n`);

  // Group by position for logging
  const byPosition = new Map<string, string[]>();
  for (const row of toAdd) {
    if (!byPosition.has(row.position_id)) {
      byPosition.set(row.position_id, []);
    }
    byPosition.get(row.position_id)!.push(`${row.course_id}: ${row.course_name}`);
  }

  console.log(`Positions to update: ${byPosition.size}\n`);

  // Insert all missing position_courses
  let added = 0;
  for (const row of toAdd) {
    await sql`
      INSERT INTO position_courses (position_id, course_id)
      VALUES (${row.position_id}, ${row.course_id})
      ON CONFLICT (position_id, course_id) DO NOTHING
    `;
    added++;
  }

  console.log(`Added ${added} position_courses entries`);

  // Show summary by position
  console.log('\n=== Summary by Position ===');
  for (const [position, courses] of Array.from(byPosition.entries()).slice(0, 10)) {
    console.log(`\n${position}: ${courses.length} courses`);
  }
  if (byPosition.size > 10) {
    console.log(`\n... and ${byPosition.size - 10} more positions`);
  }

  console.log('\n=== Done ===');
}

addCoursesToMGPositions().catch(console.error);
