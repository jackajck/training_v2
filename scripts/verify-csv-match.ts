import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function csvCompareCheck() {
  console.log('=== CSV Compare Readiness Check ===\n');

  // For each employee, check if all their external_training courses are in their positions
  const result = await sql`
    WITH employee_external_courses AS (
      -- All course IDs from external_training for each employee
      SELECT
        e.employee_id,
        e.employee_name,
        et.course_id,
        et.requirement
      FROM employees e
      JOIN external_training et ON LOWER(REPLACE(e.employee_name, ' ', '')) = LOWER(REPLACE(et.associate_name, ' ', ''))
      WHERE et.course_id IS NOT NULL
    ),
    employee_position_courses AS (
      -- All courses in positions for each employee
      SELECT
        ep.employee_id,
        pc.course_id
      FROM employee_positions ep
      JOIN position_courses pc ON ep.position_id = pc.position_id
    )
    SELECT
      eec.employee_id,
      eec.employee_name,
      COUNT(DISTINCT eec.course_id) as external_courses,
      COUNT(DISTINCT CASE WHEN epc.course_id IS NOT NULL THEN eec.course_id END) as matched_courses
    FROM employee_external_courses eec
    LEFT JOIN employee_position_courses epc ON eec.employee_id = epc.employee_id AND eec.course_id = epc.course_id
    GROUP BY eec.employee_id, eec.employee_name
    HAVING COUNT(DISTINCT eec.course_id) != COUNT(DISTINCT CASE WHEN epc.course_id IS NOT NULL THEN eec.course_id END)
    LIMIT 10
  `;

  if (result.length === 0) {
    console.log('SUCCESS: All employees have all their external_training courses in their positions!');
  } else {
    console.log('Found employees with missing courses:');
    for (const r of result) {
      console.log(`  ${r.employee_name}: ${r.matched_courses}/${r.external_courses} courses matched`);
    }
  }

  // Also count total
  const totals = await sql`
    WITH employee_external_courses AS (
      SELECT
        e.employee_id,
        et.course_id
      FROM employees e
      JOIN external_training et ON LOWER(REPLACE(e.employee_name, ' ', '')) = LOWER(REPLACE(et.associate_name, ' ', ''))
      WHERE et.course_id IS NOT NULL
    ),
    employee_position_courses AS (
      SELECT
        ep.employee_id,
        pc.course_id
      FROM employee_positions ep
      JOIN position_courses pc ON ep.position_id = pc.position_id
    )
    SELECT
      COUNT(DISTINCT eec.course_id || '-' || eec.employee_id) as total_external,
      COUNT(DISTINCT CASE WHEN epc.course_id IS NOT NULL THEN eec.course_id || '-' || eec.employee_id END) as total_matched
    FROM employee_external_courses eec
    LEFT JOIN employee_position_courses epc ON eec.employee_id = epc.employee_id AND eec.course_id = epc.course_id
  `;

  console.log(`\nTotal external_training employee-course combos: ${totals[0].total_external}`);
  console.log(`Total matched in positions: ${totals[0].total_matched}`);
  console.log(`Match rate: ${(parseInt(totals[0].total_matched) / parseInt(totals[0].total_external) * 100).toFixed(2)}%`);
}

csvCompareCheck().catch(console.error);
