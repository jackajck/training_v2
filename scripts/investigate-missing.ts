import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function investigate() {
  // Check the 0-match employees
  const zeroMatch = ['Calderone,Jon', 'David,Stanley', 'Payne,Silvana'];

  for (const name of zeroMatch) {
    console.log(`\n=== ${name} ===`);

    // Check if employee exists
    const employee = await sql`SELECT employee_id, employee_name FROM employees WHERE employee_name = ${name}`;
    if (employee.length === 0) {
      console.log('  Employee not found in employees table');

      // Check external_training
      const extName = await sql`SELECT DISTINCT associate_name FROM external_training WHERE associate_name ILIKE ${name.replace(',', '%')}`;
      console.log('  External training names:', extName.map(e => e.associate_name).join(', '));
      continue;
    }

    console.log(`  Employee ID: ${employee[0].employee_id}`);

    // Check positions
    const positions = await sql`
      SELECT ep.position_id, p.position_name
      FROM employee_positions ep
      JOIN positions p ON ep.position_id = p.position_id
      WHERE ep.employee_id = ${employee[0].employee_id}
    `;
    console.log(`  Positions: ${positions.map(p => p.position_name).join(', ')}`);

    // Check if has MG_ bucket
    const mgBucket = positions.find(p => p.position_name.startsWith('MG_'));
    if (!mgBucket) {
      console.log('  NO MG_ bucket!');
    }

    // Check courses in positions
    const positionCourses = await sql`
      SELECT COUNT(*) as count FROM position_courses pc
      JOIN employee_positions ep ON pc.position_id = ep.position_id
      WHERE ep.employee_id = ${employee[0].employee_id}
    `;
    console.log(`  Courses in their positions: ${positionCourses[0].count}`);

    // Check external training courses
    const extCourses = await sql`
      SELECT COUNT(DISTINCT course_id) as count FROM external_training
      WHERE LOWER(REPLACE(associate_name, ' ', '')) = LOWER(REPLACE(${name}, ' ', ''))
      AND course_id IS NOT NULL
    `;
    console.log(`  External training courses: ${extCourses[0].count}`);
  }

  // Also check employees with partial matches
  console.log('\n\n=== Checking partial match employees ===');

  const partialMatch = ['Potter Jr,David W', 'Simmons,Christin'];
  for (const name of partialMatch) {
    console.log(`\n=== ${name} ===`);

    const employee = await sql`SELECT employee_id, employee_name FROM employees WHERE employee_name = ${name}`;
    if (employee.length === 0) {
      console.log('  Employee not found');
      continue;
    }

    // Find missing courses
    const missing = await sql`
      SELECT et.course_id, et.requirement
      FROM external_training et
      WHERE LOWER(REPLACE(et.associate_name, ' ', '')) = LOWER(REPLACE(${name}, ' ', ''))
      AND et.course_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM position_courses pc
        JOIN employee_positions ep ON pc.position_id = ep.position_id
        WHERE ep.employee_id = ${employee[0].employee_id}
        AND pc.course_id = et.course_id
      )
    `;

    console.log(`  Missing courses: ${missing.length}`);
    for (const m of missing) {
      // Check if course exists
      const courseExists = await sql`SELECT course_id, course_name FROM courses WHERE course_id = ${m.course_id}`;
      console.log(`    ${m.course_id}: ${m.requirement} - ${courseExists.length > 0 ? 'EXISTS' : 'MISSING FROM COURSES TABLE'}`);
    }
  }
}

investigate().catch(console.error);
