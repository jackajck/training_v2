import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function check() {
  // All QOP courses in external_training
  console.log('=== All QOP courses in external_training ===\n');
  const allQOP = await sql`
    SELECT DISTINCT requirement, course_id, COUNT(*) as emp_count
    FROM external_training
    WHERE requirement LIKE 'SPPIVT QOP%'
    GROUP BY requirement, course_id
    ORDER BY requirement
  `;

  let missingCount = 0;
  let foundCount = 0;

  for (const row of allQOP) {
    // Try to match by course_id first
    const byId = await sql`SELECT course_id, course_name FROM courses WHERE course_id = ${row.course_id}`;
    if (byId.length > 0) {
      foundCount++;
      console.log(`✓ ${row.requirement} -> Found by ID: ${byId[0].course_id}`);
    } else {
      missingCount++;
      console.log(`✗ ${row.requirement} (ext ID: ${row.course_id}, ${row.emp_count} employees) -> NOT IN courses table`);
    }
  }

  console.log(`\nTotal: ${foundCount} found, ${missingCount} missing`);

  // All QCP courses in external_training
  console.log('\n=== All QCP courses in external_training ===\n');
  const allQCP = await sql`
    SELECT DISTINCT requirement, course_id, COUNT(*) as emp_count
    FROM external_training
    WHERE requirement LIKE 'SPPIVT QCP%'
    GROUP BY requirement, course_id
    ORDER BY requirement
  `;

  missingCount = 0;
  foundCount = 0;

  for (const row of allQCP) {
    const byId = await sql`SELECT course_id, course_name FROM courses WHERE course_id = ${row.course_id}`;
    if (byId.length > 0) {
      foundCount++;
      console.log(`✓ ${row.requirement} -> Found by ID: ${byId[0].course_id}`);
    } else {
      missingCount++;
      console.log(`✗ ${row.requirement} (ext ID: ${row.course_id}, ${row.emp_count} employees) -> NOT IN courses table`);
    }
  }

  console.log(`\nTotal: ${foundCount} found, ${missingCount} missing`);

  // Summary of all non-T courses
  console.log('\n=== Summary: Non-T-code courses in external_training ===\n');
  const nonT = await sql`
    SELECT requirement, course_id, COUNT(DISTINCT associate_name) as emp_count
    FROM external_training
    WHERE requirement NOT LIKE '%T___[_ ]%'
      AND requirement NOT LIKE '%T____[_ ]%'
    GROUP BY requirement, course_id
    ORDER BY emp_count DESC
    LIMIT 50
  `;

  let totalMissing = 0;
  let totalFound = 0;
  for (const row of nonT) {
    const byId = await sql`SELECT course_id FROM courses WHERE course_id = ${row.course_id}`;
    if (byId.length === 0) {
      totalMissing++;
      console.log(`✗ ${row.requirement} (${row.emp_count} employees)`);
    } else {
      totalFound++;
    }
  }
  console.log(`\nShowing top 50 by employee count. ${totalFound} found, ${totalMissing} missing.`);
}

check();
