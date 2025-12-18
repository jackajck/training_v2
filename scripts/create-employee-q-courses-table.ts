import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function createTable() {
  console.log('Creating employee_q_courses table...');

  await sql`
    CREATE TABLE IF NOT EXISTS employee_q_courses (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      course_id VARCHAR(20) NOT NULL,
      is_needed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(employee_id, course_id)
    )
  `;

  console.log('Table created successfully!');

  // Add index for faster lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_employee_q_courses_employee_id
    ON employee_q_courses(employee_id)
  `;

  console.log('Index created successfully!');

  // Verify table
  const result = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'employee_q_courses'
    ORDER BY ordinal_position
  `;

  console.log('\nTable structure:');
  console.table(result);
}

createTable().catch(console.error);
