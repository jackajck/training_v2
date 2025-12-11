import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function check() {
  console.log('=== Checking Reid Lumbra ===\n');

  // Find employee
  const emp = await sql`SELECT employee_id, employee_name FROM employees WHERE employee_name ILIKE '%Lumbra%Reid%' OR employee_name ILIKE '%Reid%Lumbra%'`;
  console.log('Employee:', emp);

  if (emp.length === 0) return;
  const employeeId = emp[0].employee_id;

  // Check the 3 "Not Found" courses
  const courseIds = ['14297', '14598', '13653'];

  for (const courseId of courseIds) {
    console.log(`\n=== Course ${courseId} ===`);

    // Check if course exists
    const course = await sql`SELECT * FROM courses WHERE course_id = ${courseId}`;
    console.log('Course exists:', course.length > 0 ? `Yes - ${course[0].course_name}` : 'NO');

    // Check employee_training
    const training = await sql`SELECT * FROM employee_training WHERE employee_id = ${employeeId} AND course_id = ${courseId}`;
    console.log('Training record:', training.length > 0 ? 'Yes' : 'NO');

    // Check external_training
    const external = await sql`
      SELECT * FROM external_training
      WHERE course_id = ${courseId}
      AND LOWER(REPLACE(associate_name, ' ', '')) = LOWER(REPLACE(${emp[0].employee_name}, ' ', ''))
    `;
    console.log('External training:', external.length > 0 ? `Yes - expires ${external[0].expire_date}` : 'NO');

    // Check if course is in any of their positions
    const positions = await sql`
      SELECT ep.position_id, p.position_name
      FROM employee_positions ep
      JOIN positions p ON ep.position_id = p.position_id
      WHERE ep.employee_id = ${employeeId}
    `;

    const inPositions = await sql`
      SELECT pc.position_id, p.position_name
      FROM position_courses pc
      JOIN positions p ON pc.position_id = p.position_id
      JOIN employee_positions ep ON pc.position_id = ep.position_id
      WHERE ep.employee_id = ${employeeId}
      AND pc.course_id = ${courseId}
    `;
    console.log('In positions:', inPositions.length > 0 ? inPositions.map(p => p.position_name).join(', ') : 'NONE');
  }

  // List all their positions
  console.log('\n=== All Positions ===');
  const allPositions = await sql`
    SELECT p.position_id, p.position_name
    FROM employee_positions ep
    JOIN positions p ON ep.position_id = p.position_id
    WHERE ep.employee_id = ${employeeId}
    ORDER BY p.position_name
  `;
  for (const p of allPositions) {
    console.log(`  ${p.position_id}: ${p.position_name}`);
  }

  // Check MG_ bucket
  const mgBucket = allPositions.find(p => p.position_name.startsWith('MG_'));
  if (mgBucket) {
    console.log('\n=== MG_ Bucket Contents ===');
    const mgCourses = await sql`
      SELECT pc.course_id, c.course_name
      FROM position_courses pc
      JOIN courses c ON pc.course_id = c.course_id
      WHERE pc.position_id = ${mgBucket.position_id}
      ORDER BY c.course_name
    `;
    console.log(`${mgBucket.position_name} has ${mgCourses.length} courses`);
    for (const c of mgCourses) {
      console.log(`  ${c.course_id}: ${c.course_name}`);
    }
  }
}

check().catch(console.error);
