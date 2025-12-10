import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function createAnomaliesTable() {
  console.log('Creating anomalies table...');

  // Create anomalies table
  await sql`
    CREATE TABLE IF NOT EXISTS anomalies (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  console.log('✓ anomalies table created');

  // Create anomaly_comments table
  await sql`
    CREATE TABLE IF NOT EXISTS anomaly_comments (
      id SERIAL PRIMARY KEY,
      anomaly_id INTEGER REFERENCES anomalies(id) ON DELETE CASCADE,
      comment TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  console.log('✓ anomaly_comments table created');

  // Insert the first anomaly about T710NF
  const existing = await sql`SELECT id FROM anomalies WHERE title LIKE '%T710NF%'`;
  if (existing.length === 0) {
    await sql`
      INSERT INTO anomalies (title, description, status)
      VALUES (
        'T710NF - Duplicate Positions',
        'There are two T710NF positions in the system. Need to investigate which one is correct and potentially merge or remove the duplicate.',
        'open'
      )
    `;
    console.log('✓ Initial T710NF anomaly inserted');
  } else {
    console.log('✓ T710NF anomaly already exists');
  }

  console.log('\nDone!');
}

createAnomaliesTable().catch(console.error);
