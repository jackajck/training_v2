/**
 * Create external_training table to store training records from external CSV
 * This replaces the need to read from course_compare.csv file
 *
 * Run: npx tsx scripts/create-external-training-table.ts
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log('Creating external_training table...\n');

  // Create the table
  await sql`
    CREATE TABLE IF NOT EXISTS external_training (
      id SERIAL PRIMARY KEY,
      associate_name VARCHAR(255) NOT NULL,
      requirement TEXT NOT NULL,
      course_id VARCHAR(50),
      status VARCHAR(100),
      expire_date VARCHAR(50),
      expiration_date DATE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('✓ Created external_training table');

  // Create indexes for fast lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_external_training_associate
    ON external_training(LOWER(associate_name))
  `;
  console.log('✓ Created index on associate_name');

  await sql`
    CREATE INDEX IF NOT EXISTS idx_external_training_course_id
    ON external_training(course_id)
  `;
  console.log('✓ Created index on course_id');

  console.log('\n✓ Table created successfully!');
  console.log('\nNext step: Run import-external-training.ts to load CSV data');
}

main().catch(console.error);
