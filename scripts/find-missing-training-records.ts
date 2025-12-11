import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function find() {
  console.log('=== Finding Missing Training Records ===\n');

  // Find external_training records where:
  // 1. The course is in the employee's MG_ position
  // 2. But there's no employee_training record
  const missing = await sql`
    WITH employee_mg_courses AS (
      SELECT
        ep.employee_id,
        e.employee_name,
        pc.course_id,
        p.position_name
      FROM employee_positions ep
      JOIN positions p ON ep.position_id = p.position_id
      JOIN position_courses pc ON ep.position_id = pc.position_id
      JOIN employees e ON ep.employee_id = e.employee_id
      WHERE p.position_name LIKE 'MG_%'
    )
    SELECT
      et.associate_name,
      et.course_id,
      et.requirement,
      et.expire_date,
      emc.employee_id,
      emc.position_name
    FROM external_training et
    JOIN employees e ON LOWER(REPLACE(e.employee_name, ' ', '')) = LOWER(REPLACE(et.associate_name, ' ', ''))
    JOIN employee_mg_courses emc ON e.employee_id = emc.employee_id AND et.course_id = emc.course_id
    LEFT JOIN employee_training etr ON emc.employee_id = etr.employee_id AND et.course_id = etr.course_id
    WHERE et.course_id IS NOT NULL
    AND etr.training_id IS NULL
  `;

  console.log(`Found ${missing.length} external_training records with no employee_training record\n`);

  // Group by employee
  const byEmployee = new Map<string, any[]>();
  for (const m of missing) {
    if (!byEmployee.has(m.associate_name)) {
      byEmployee.set(m.associate_name, []);
    }
    byEmployee.get(m.associate_name)!.push(m);
  }

  console.log(`Affects ${byEmployee.size} employees\n`);

  // Show first 10
  let count = 0;
  for (const [name, records] of byEmployee) {
    if (count++ >= 10) break;
    console.log(`${name}: ${records.length} missing training records`);
    for (const r of records.slice(0, 3)) {
      console.log(`  ${r.course_id}: ${r.requirement} (expires ${r.expire_date || 'n/a'})`);
    }
    if (records.length > 3) {
      console.log(`  ... and ${records.length - 3} more`);
    }
  }

  if (byEmployee.size > 10) {
    console.log(`\n... and ${byEmployee.size - 10} more employees`);
  }
}

find().catch(console.error);
