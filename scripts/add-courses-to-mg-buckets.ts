import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function addCoursesToMGBuckets() {
  console.log('=== Adding Courses to MG_ Buckets ===\n');

  // Find all MG_ positions (position_name starts with MG_)
  const mgPositions = await sql`
    SELECT position_id, position_name FROM positions
    WHERE position_name LIKE 'MG_%'
  `;
  console.log(`Found ${mgPositions.length} MG_ buckets\n`);

  let totalAdded = 0;

  for (const mg of mgPositions) {
    // Find the employee for this MG_ bucket
    const employees = await sql`
      SELECT ep.employee_id, e.employee_name
      FROM employee_positions ep
      JOIN employees e ON ep.employee_id = e.employee_id
      WHERE ep.position_id = ${mg.position_id}
    `;

    if (employees.length === 0) continue;

    const employeeId = employees[0].employee_id;

    // Find all courses this employee has training for
    const trainingCourses = await sql`
      SELECT DISTINCT et.course_id
      FROM employee_training et
      WHERE et.employee_id = ${employeeId}
    `;

    // Find which courses are NOT in this MG_ position yet
    const existingCourses = await sql`
      SELECT course_id FROM position_courses WHERE position_id = ${mg.position_id}
    `;
    const existingSet = new Set(existingCourses.map(c => c.course_id));

    const toAdd = trainingCourses.filter(t => !existingSet.has(t.course_id));

    if (toAdd.length > 0) {
      console.log(`${mg.position_name}: Adding ${toAdd.length} courses`);

      for (const course of toAdd) {
        await sql`
          INSERT INTO position_courses (position_id, course_id)
          VALUES (${mg.position_id}, ${course.course_id})
          ON CONFLICT (position_id, course_id) DO NOTHING
        `;
        totalAdded++;
      }
    }
  }

  console.log(`\n=== Done! Added ${totalAdded} position_courses entries ===`);
}

addCoursesToMGBuckets().catch(console.error);
