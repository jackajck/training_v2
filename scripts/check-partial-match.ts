import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function check() {
  // Potter Jr,David W - check course 13521
  console.log('=== Potter Jr,David W - Course 13521 ===');

  const potter = await sql`SELECT employee_id FROM employees WHERE employee_name = 'Potter Jr,David W'`;
  const potterId = potter[0].employee_id;

  // Check their positions
  const potterPositions = await sql`
    SELECT ep.position_id, p.position_name
    FROM employee_positions ep
    JOIN positions p ON ep.position_id = p.position_id
    WHERE ep.employee_id = ${potterId}
  `;
  console.log('Positions:', potterPositions.map(p => `${p.position_id} (${p.position_name})`).join(', '));

  // For course 13521, check all positions that have it
  const course13521Positions = await sql`
    SELECT pc.position_id, p.position_name
    FROM position_courses pc
    JOIN positions p ON pc.position_id = p.position_id
    WHERE pc.course_id = '13521'
  `;
  console.log('\nPositions that have course 13521:', course13521Positions.length);

  // Check employee_training for this course
  const potterTraining = await sql`
    SELECT * FROM employee_training
    WHERE employee_id = ${potterId}
    AND course_id = '13521'
  `;
  console.log('Training record exists:', potterTraining.length > 0);

  // Check external_training
  const potterExternal = await sql`
    SELECT * FROM external_training
    WHERE course_id = '13521'
    AND LOWER(REPLACE(associate_name, ' ', '')) = LOWER(REPLACE('Potter Jr,David W', ' ', ''))
  `;
  console.log('External training record exists:', potterExternal.length > 0);

  // Check if course is in any of their positions
  const positionIds = potterPositions.map(p => p.position_id);
  const inPositions = await sql`
    SELECT pc.position_id, p.position_name
    FROM position_courses pc
    JOIN positions p ON pc.position_id = p.position_id
    WHERE pc.course_id = '13521'
    AND pc.position_id = ANY(${positionIds})
  `;
  console.log('Course 13521 is in their positions:', inPositions.map(p => p.position_name).join(', ') || 'NONE');

  // So the course is NOT in their positions but IS in external_training
  // Need to understand why the fix-mg-buckets script didn't add it

  // Check their MG_ bucket
  const mgPosition = potterPositions.find(p => p.position_name.startsWith('MG_'));
  if (mgPosition) {
    console.log('\nMG_ bucket:', mgPosition.position_name);
    const mgCourses = await sql`
      SELECT pc.course_id FROM position_courses
      WHERE position_id = ${mgPosition.position_id}
    `;
    console.log('Courses in MG_ bucket:', mgCourses.length);
    console.log('Course 13521 in MG_ bucket:', mgCourses.some(c => c.course_id === '13521'));
  }

  // Issue: why wasn't course 13521 added to Potter's MG_ bucket?
  // The logic was: add courses from external_training that aren't in their other (non-MG_) positions
  // Let's check if 13521 is in any of Potter's NON-MG_ positions
  const nonMgPositions = potterPositions.filter(p => !p.position_name.startsWith('MG_')).map(p => p.position_id);
  if (nonMgPositions.length > 0) {
    const inNonMg = await sql`
      SELECT pc.position_id, p.position_name
      FROM position_courses pc
      JOIN positions p ON pc.position_id = p.position_id
      WHERE pc.course_id = '13521'
      AND pc.position_id = ANY(${nonMgPositions})
    `;
    console.log('\nCourse 13521 in NON-MG_ positions:', inNonMg.map(p => p.position_name).join(', ') || 'NONE');
  }
}

check().catch(console.error);
