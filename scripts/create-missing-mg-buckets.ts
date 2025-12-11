import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function createMissingMGBuckets() {
  console.log('=== Creating Missing MG_ Buckets ===\n');

  // Find employees who have external_training courses but no MG_ bucket
  const employeesNeedingBuckets = await sql`
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

  console.log(`Found ${employeesNeedingBuckets.length} employees needing MG_ buckets\n`);

  // Get the max position_id to generate new ones
  const maxPositionResult = await sql`SELECT MAX(CAST(position_id AS INTEGER)) as max_id FROM positions WHERE position_id ~ '^[0-9]+$'`;
  let nextPositionId = (maxPositionResult[0].max_id || 777000) + 1;

  console.log(`Starting position_id at: ${nextPositionId}\n`);

  let bucketsCreated = 0;
  let coursesAdded = 0;

  for (const emp of employeesNeedingBuckets) {
    // Create position name from employee name (remove spaces and special chars)
    const positionName = 'MG_' + emp.employee_name.replace(/[^a-zA-Z]/g, '');

    // Check if position with this name already exists
    const existing = await sql`SELECT position_id FROM positions WHERE position_name = ${positionName}`;
    let positionId: string;

    if (existing.length > 0) {
      positionId = existing[0].position_id;
      console.log(`  Position ${positionName} already exists with ID ${positionId}`);
    } else {
      // Create the MG_ position
      positionId = nextPositionId.toString();
      await sql`
        INSERT INTO positions (position_id, position_name, is_active)
        VALUES (${positionId}, ${positionName}, true)
      `;
      nextPositionId++;
      bucketsCreated++;
    }

    // Link employee to this position
    const linkExists = await sql`
      SELECT 1 FROM employee_positions WHERE employee_id = ${emp.employee_id} AND position_id = ${positionId}
    `;
    if (linkExists.length === 0) {
      await sql`
        INSERT INTO employee_positions (employee_id, position_id)
        VALUES (${emp.employee_id}, ${positionId})
      `;
    }

    // Find this employee's other positions (non-MG_)
    const otherPositions = await sql`
      SELECT ep.position_id
      FROM employee_positions ep
      JOIN positions p ON ep.position_id = p.position_id
      WHERE ep.employee_id = ${emp.employee_id}
      AND p.position_name NOT LIKE 'MG_%'
    `;

    // Get courses from their other positions
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
    const externalCourses = await sql`
      SELECT DISTINCT et.course_id
      FROM external_training et
      WHERE LOWER(REPLACE(et.associate_name, ' ', '')) = LOWER(REPLACE(${emp.employee_name}, ' ', ''))
      AND et.course_id IS NOT NULL
    `;

    // Add courses to MG_ bucket
    for (const ext of externalCourses) {
      if (!existingSet.has(ext.course_id)) {
        // Verify course exists
        const courseExists = await sql`SELECT course_id FROM courses WHERE course_id = ${ext.course_id}`;
        if (courseExists.length > 0) {
          await sql`
            INSERT INTO position_courses (position_id, course_id)
            VALUES (${positionId}, ${ext.course_id})
            ON CONFLICT (position_id, course_id) DO NOTHING
          `;
          coursesAdded++;
        }
      }
    }
  }

  console.log(`\n=== Done! ===`);
  console.log(`Created ${bucketsCreated} new MG_ buckets`);
  console.log(`Added ${coursesAdded} position_courses entries`);
}

createMissingMGBuckets().catch(console.error);
