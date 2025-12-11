import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function createMissing() {
  console.log('=== Creating Missing Training Records ===\n');

  // Find external_training records where:
  // 1. The course exists in our courses table
  // 2. The employee exists
  // 3. But there's no employee_training record
  const missing = await sql`
    SELECT
      et.associate_name,
      et.course_id,
      et.requirement,
      et.expire_date,
      e.employee_id
    FROM external_training et
    JOIN employees e ON LOWER(REPLACE(e.employee_name, ' ', '')) = LOWER(REPLACE(et.associate_name, ' ', ''))
    JOIN courses c ON et.course_id = c.course_id
    LEFT JOIN employee_training etr ON e.employee_id = etr.employee_id AND et.course_id = etr.course_id
    WHERE et.course_id IS NOT NULL
    AND etr.training_id IS NULL
  `;

  console.log(`Found ${missing.length} missing training records to create\n`);

  let created = 0;
  for (const m of missing) {
    // Parse expiration date
    let expirationDate: Date | null = null;
    if (m.expire_date && m.expire_date !== 'n/a') {
      const parts = m.expire_date.split('/');
      if (parts.length === 3) {
        expirationDate = new Date(`${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`);
      }
    }

    await sql`
      INSERT INTO employee_training (employee_id, course_id, completion_date, expiration_date)
      VALUES (${m.employee_id}, ${m.course_id}, ${expirationDate}, ${expirationDate})
    `;
    created++;
  }

  console.log(`Created ${created} training records`);

  // Verify
  const stillMissing = await sql`
    SELECT COUNT(*) as count
    FROM external_training et
    JOIN employees e ON LOWER(REPLACE(e.employee_name, ' ', '')) = LOWER(REPLACE(et.associate_name, ' ', ''))
    JOIN courses c ON et.course_id = c.course_id
    LEFT JOIN employee_training etr ON e.employee_id = etr.employee_id AND et.course_id = etr.course_id
    WHERE et.course_id IS NOT NULL
    AND etr.training_id IS NULL
  `;

  console.log(`Still missing: ${stillMissing[0].count}`);
}

createMissing().catch(console.error);
