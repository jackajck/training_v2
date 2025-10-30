import { sql } from '@/lib/db';

async function runMigration() {
  try {
    console.log('Adding notes column to employee_training table...');

    await sql`
      ALTER TABLE employee_training
      ADD COLUMN IF NOT EXISTS notes TEXT
    `;

    console.log('✅ Notes column added successfully!');
  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

runMigration();
