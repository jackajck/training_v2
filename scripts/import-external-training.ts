/**
 * Import training records from course_compare.csv into external_training table
 *
 * Run: npx tsx scripts/import-external-training.ts
 */

import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';

const sql = neon(process.env.DATABASE_URL!);

interface CSVRow {
  requirement: string;
  associate: string;
  status: string;
  expireDate: string;
  courseId: string | null;
  expirationDate: string | null;
}

function parseCSV(content: string): CSVRow[] {
  // Handle BOM
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/);
  const rows: CSVRow[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV with quotes
    const matches = line.match(/(?:^|,)("(?:[^"]*(?:""[^"]*)*)"|[^,]*)/g);
    if (!matches || matches.length < 4) continue;

    const fields = matches.map(m => {
      let val = m.startsWith(',') ? m.slice(1) : m;
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      return val.trim();
    });

    const requirement = fields[0];
    const expireDate = fields[3];

    // Extract course ID from requirement
    const idMatch = requirement.match(/\((\d+)\)\s*$/);
    const courseId = idMatch ? idMatch[1] : null;

    // Parse expiration date to ISO format
    let expirationDate: string | null = null;
    if (expireDate && expireDate.toLowerCase() !== 'n/a' && expireDate !== '') {
      const dateMatch = expireDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dateMatch) {
        const [, month, day, year] = dateMatch;
        expirationDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    rows.push({
      requirement,
      associate: fields[1],
      status: fields[2],
      expireDate,
      courseId,
      expirationDate
    });
  }

  return rows;
}

async function main() {
  const csvPath = path.join(process.cwd(), 'course_compare.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('ERROR: course_compare.csv not found!');
    process.exit(1);
  }

  console.log('Reading CSV file...');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);
  console.log(`Parsed ${rows.length} rows from CSV\n`);

  // Clear existing data
  console.log('Clearing existing external_training data...');
  await sql`TRUNCATE TABLE external_training RESTART IDENTITY`;

  // Insert in batches using parallel promises
  const batchSize = 100;
  let inserted = 0;

  console.log('Importing records...');

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    // Run batch inserts in parallel
    await Promise.all(batch.map(row =>
      sql`
        INSERT INTO external_training (
          associate_name,
          requirement,
          course_id,
          status,
          expire_date,
          expiration_date
        ) VALUES (
          ${row.associate},
          ${row.requirement},
          ${row.courseId},
          ${row.status},
          ${row.expireDate},
          ${row.expirationDate}
        )
      `
    ));

    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === rows.length) {
      console.log(`  Inserted ${inserted}/${rows.length} records...`);
    }
  }

  // Get unique associate count
  const uniqueCount = await sql`
    SELECT COUNT(DISTINCT associate_name) as count FROM external_training
  `;

  console.log('\n=== IMPORT COMPLETE ===');
  console.log(`Total records: ${inserted}`);
  console.log(`Unique employees: ${uniqueCount[0].count}`);
}

main().catch(console.error);
