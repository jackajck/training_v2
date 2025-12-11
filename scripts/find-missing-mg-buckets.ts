import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function findMissing() {
  // Find employees who have external_training courses but no MG_ bucket
  const missing = await sql`
    WITH employees_with_external AS (
      SELECT DISTINCT e.employee_id, e.employee_name
      FROM employees e
      JOIN external_training et ON LOWER(REPLACE(e.employee_name, ' ', '')) = LOWER(REPLACE(et.associate_name, ' ', ''))
      WHERE et.course_id IS NOT NULL
    ),
    employees_with_mg AS (
      SELECT DISTINCT ep.employee_id
      FROM employee_positions ep
      JOIN positions p ON ep.position_id = p.position_id
      WHERE p.position_name LIKE 'MG_%'
    )
    SELECT ewe.employee_id, ewe.employee_name
    FROM employees_with_external ewe
    LEFT JOIN employees_with_mg ewm ON ewe.employee_id = ewm.employee_id
    WHERE ewm.employee_id IS NULL
  `;

  console.log(`Found ${missing.length} employees with external_training but NO MG_ bucket:`);
  for (const emp of missing.slice(0, 20)) {
    // Check their positions
    const positions = await sql`
      SELECT p.position_name
      FROM employee_positions ep
      JOIN positions p ON ep.position_id = p.position_id
      WHERE ep.employee_id = ${emp.employee_id}
    `;
    console.log(`  ${emp.employee_name}: ${positions.map(p => p.position_name).join(', ')}`);
  }

  if (missing.length > 20) {
    console.log(`  ... and ${missing.length - 20} more`);
  }

  // Check how many external_training courses these employees have that aren't in their positions
  const unmatched = await sql`
    WITH employees_without_mg AS (
      SELECT DISTINCT e.employee_id, e.employee_name
      FROM employees e
      JOIN external_training et ON LOWER(REPLACE(e.employee_name, ' ', '')) = LOWER(REPLACE(et.associate_name, ' ', ''))
      WHERE et.course_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM employee_positions ep
        JOIN positions p ON ep.position_id = p.position_id
        WHERE ep.employee_id = e.employee_id
        AND p.position_name LIKE 'MG_%'
      )
    ),
    employee_external_courses AS (
      SELECT e.employee_id, et.course_id
      FROM employees_without_mg e
      JOIN external_training et ON LOWER(REPLACE(e.employee_name, ' ', '')) = LOWER(REPLACE(et.associate_name, ' ', ''))
      WHERE et.course_id IS NOT NULL
    ),
    employee_position_courses AS (
      SELECT ep.employee_id, pc.course_id
      FROM employee_positions ep
      JOIN position_courses pc ON ep.position_id = pc.position_id
    )
    SELECT COUNT(*) as missing_count
    FROM employee_external_courses eec
    LEFT JOIN employee_position_courses epc ON eec.employee_id = epc.employee_id AND eec.course_id = epc.course_id
    WHERE epc.course_id IS NULL
  `;

  console.log(`\nTotal unmatched courses for employees without MG_ buckets: ${unmatched[0].missing_count}`);
}

findMissing().catch(console.error);
