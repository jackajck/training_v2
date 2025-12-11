import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function fixMGBuckets() {
  console.log('=== Fixing MG_ Buckets ===\n');

  // Step 1: Clear all position_courses for MG_ positions
  console.log('Step 1: Clearing existing MG_ position_courses...');
  const mgPositions = await sql`
    SELECT position_id, position_name FROM positions
    WHERE position_name LIKE 'MG_%'
  `;
  console.log(`Found ${mgPositions.length} MG_ buckets`);

  const deleted = await sql`
    DELETE FROM position_courses
    WHERE position_id IN (
      SELECT position_id FROM positions WHERE position_name LIKE 'MG_%'
    )
    RETURNING position_id
  `;
  console.log(`Deleted ${deleted.length} position_courses entries\n`);

  // Step 2: For each MG_ position, find the employee and add ONLY courses from external_training
  // that aren't already in their other positions
  console.log('Step 2: Re-populating MG_ buckets with external_training courses...\n');

  let totalAdded = 0;
  let processed = 0;

  for (const mg of mgPositions) {
    processed++;
    if (processed % 100 === 0) {
      console.log(`  Processing ${processed}/${mgPositions.length}...`);
    }

    // Find the employee assigned to this MG_ position
    const employees = await sql`
      SELECT ep.employee_id, e.employee_name
      FROM employee_positions ep
      JOIN employees e ON ep.employee_id = e.employee_id
      WHERE ep.position_id = ${mg.position_id}
    `;

    if (employees.length === 0) continue;

    const employee = employees[0];

    // Find this employee's OTHER positions (non-MG_)
    const otherPositions = await sql`
      SELECT ep.position_id
      FROM employee_positions ep
      JOIN positions p ON ep.position_id = p.position_id
      WHERE ep.employee_id = ${employee.employee_id}
      AND p.position_name NOT LIKE 'MG_%'
    `;

    // Get all courses from their other positions
    let existingCourses: string[] = [];
    if (otherPositions.length > 0) {
      const positionIds = otherPositions.map(p => p.position_id);
      const existing = await sql`
        SELECT DISTINCT course_id FROM position_courses
        WHERE position_id = ANY(${positionIds})
      `;
      existingCourses = existing.map(c => c.course_id);
    }
    const existingSet = new Set(existingCourses);

    // Find courses from external_training for this employee that aren't in existing positions
    // Match by employee name (how the original migration worked)
    const externalCourses = await sql`
      SELECT DISTINCT et.course_id
      FROM external_training et
      WHERE LOWER(REPLACE(et.associate_name, ' ', '')) = LOWER(REPLACE(${employee.employee_name}, ' ', ''))
      AND et.course_id IS NOT NULL
    `;

    // Only add courses that:
    // 1. Are from external_training for this employee
    // 2. Aren't already in their other positions
    // 3. Exist in our courses table
    const toAdd: string[] = [];
    for (const ext of externalCourses) {
      if (!existingSet.has(ext.course_id)) {
        // Verify course exists
        const courseExists = await sql`SELECT course_id FROM courses WHERE course_id = ${ext.course_id}`;
        if (courseExists.length > 0) {
          toAdd.push(ext.course_id);
        }
      }
    }

    // Add to MG_ bucket
    for (const courseId of toAdd) {
      await sql`
        INSERT INTO position_courses (position_id, course_id)
        VALUES (${mg.position_id}, ${courseId})
        ON CONFLICT (position_id, course_id) DO NOTHING
      `;
      totalAdded++;
    }
  }

  console.log(`\n=== Done! ===`);
  console.log(`Processed ${mgPositions.length} MG_ buckets`);
  console.log(`Added ${totalAdded} position_courses entries`);
}

fixMGBuckets().catch(console.error);
