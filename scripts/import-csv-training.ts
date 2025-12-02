/**
 * Import/Update training records from course_compare.csv
 *
 * Logic:
 * 1. If we have a training record with NULL expiration → update with CSV's expiration
 * 2. If we already have an expiration date → leave it alone
 * 3. If we're missing the record entirely → import it from CSV
 *
 * Run preview: npx tsx scripts/import-csv-training.ts --preview
 * Run import:  npx tsx scripts/import-csv-training.ts --import
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
  expiration: string | null;
}

interface ImportResult {
  toUpdate: { employee: string; course: string; courseId: string; newExpiration: string; trainingId: number }[];
  toInsert: { employee: string; employeeId: number; course: string; courseId: string; expiration: string }[];
  notFound: { employee: string; course: string; reason: string }[];
  alreadyHasExpiration: number;
  noExpirationInCSV: number;
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

    // Parse expiration date
    let expiration: string | null = null;
    if (expireDate && expireDate.toLowerCase() !== 'n/a' && expireDate !== '') {
      const dateMatch = expireDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dateMatch) {
        const [, month, day, year] = dateMatch;
        expiration = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    rows.push({
      requirement,
      associate: fields[1],
      status: fields[2],
      expireDate,
      courseId,
      expiration
    });
  }

  return rows;
}

async function processCSV(preview: boolean): Promise<ImportResult> {
  const csvPath = path.join(process.cwd(), 'course_compare.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);

  console.log(`Parsed ${rows.length} rows from CSV\n`);

  // Get all employees (for name lookup)
  console.log('Loading employees...');
  const employees = await sql`SELECT employee_id, employee_name FROM employees WHERE is_active = true`;
  const employeeMap = new Map<string, number>();
  employees.forEach((e: any) => {
    employeeMap.set(e.employee_name.toLowerCase(), e.employee_id);
  });
  console.log(`Loaded ${employees.length} employees`);

  // Get all courses
  console.log('Loading courses...');
  const courses = await sql`SELECT course_id, course_name FROM courses`;
  const courseSet = new Set<string>();
  courses.forEach((c: any) => {
    courseSet.add(c.course_id);
  });
  console.log(`Loaded ${courses.length} courses`);

  // Get ALL training records with their expiration status
  console.log('Loading all training records...');
  const training = await sql`
    SELECT training_id, employee_id, course_id, expiration_date
    FROM employee_training
  `;
  // Map: "employeeId-courseId" -> { training_id, has_expiration }
  const trainingMap = new Map<string, { training_id: number; has_expiration: boolean }>();
  training.forEach((t: any) => {
    const key = `${t.employee_id}-${t.course_id}`;
    // Keep the one with expiration if exists, otherwise keep any
    const existing = trainingMap.get(key);
    if (!existing || (t.expiration_date && !existing.has_expiration)) {
      trainingMap.set(key, {
        training_id: t.training_id,
        has_expiration: !!t.expiration_date
      });
    }
  });
  console.log(`Loaded ${training.length} training records\n`);

  const result: ImportResult = {
    toUpdate: [],
    toInsert: [],
    notFound: [],
    alreadyHasExpiration: 0,
    noExpirationInCSV: 0
  };

  console.log('Processing CSV rows...');

  for (const row of rows) {
    // Skip if no course ID extracted
    if (!row.courseId) {
      continue; // Silent skip - too many to report
    }

    // Skip if course doesn't exist in our DB
    if (!courseSet.has(row.courseId)) {
      continue; // Silent skip
    }

    // Skip if no expiration in CSV
    if (!row.expiration) {
      result.noExpirationInCSV++;
      continue;
    }

    // Find employee
    const employeeId = employeeMap.get(row.associate.toLowerCase());
    if (!employeeId) {
      result.notFound.push({ employee: row.associate, course: row.requirement, reason: 'Employee not found' });
      continue;
    }

    // Check existing training record
    const key = `${employeeId}-${row.courseId}`;
    const existing = trainingMap.get(key);

    if (existing) {
      if (existing.has_expiration) {
        // Already has expiration - skip
        result.alreadyHasExpiration++;
      } else {
        // Has record but NULL expiration - update it
        result.toUpdate.push({
          employee: row.associate,
          course: row.requirement,
          courseId: row.courseId,
          newExpiration: row.expiration,
          trainingId: existing.training_id
        });
      }
    } else {
      // No record exists - insert new one
      result.toInsert.push({
        employee: row.associate,
        employeeId,
        course: row.requirement,
        courseId: row.courseId,
        expiration: row.expiration
      });
    }
  }

  // Now do the actual updates/inserts if not preview
  if (!preview) {
    console.log('\nApplying updates...');

    // Batch updates
    let updateCount = 0;
    for (const item of result.toUpdate) {
      await sql`
        UPDATE employee_training
        SET expiration_date = ${item.newExpiration}
        WHERE training_id = ${item.trainingId}
      `;
      updateCount++;
      if (updateCount % 100 === 0) {
        console.log(`  Updated ${updateCount}/${result.toUpdate.length}`);
      }
    }

    console.log('Applying inserts...');
    // Batch inserts
    let insertCount = 0;
    for (const item of result.toInsert) {
      // Calculate completion date as 1 year before expiration
      const expDate = new Date(item.expiration);
      expDate.setFullYear(expDate.getFullYear() - 1);
      const completionDate = expDate.toISOString().split('T')[0];

      await sql`
        INSERT INTO employee_training (employee_id, course_id, completion_date, expiration_date, notes)
        VALUES (${item.employeeId}, ${item.courseId}, ${completionDate}, ${item.expiration}, 'Imported from course_compare.csv')
      `;
      insertCount++;
      if (insertCount % 100 === 0) {
        console.log(`  Inserted ${insertCount}/${result.toInsert.length}`);
      }
    }
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const preview = args.includes('--preview');
  const doImport = args.includes('--import');

  if (!preview && !doImport) {
    console.log('Usage:');
    console.log('  npx tsx scripts/import-csv-training.ts --preview   # Show what would be changed');
    console.log('  npx tsx scripts/import-csv-training.ts --import    # Actually import/update');
    process.exit(1);
  }

  console.log(preview ? '=== PREVIEW MODE ===' : '=== IMPORT MODE ===');
  console.log('');

  const result = await processCSV(preview);

  console.log('\n=== SUMMARY ===\n');

  console.log(`Records to UPDATE (have training but NULL expiration): ${result.toUpdate.length}`);
  if (result.toUpdate.length > 0) {
    const sample = result.toUpdate.slice(0, 10);
    sample.forEach(r => console.log(`  - ${r.employee}: ${r.courseId} → ${r.newExpiration}`));
    if (result.toUpdate.length > 10) {
      console.log(`  ... and ${result.toUpdate.length - 10} more`);
    }
  }

  console.log(`\nRecords to INSERT (missing entirely): ${result.toInsert.length}`);
  if (result.toInsert.length > 0) {
    const sample = result.toInsert.slice(0, 10);
    sample.forEach(r => console.log(`  - ${r.employee}: ${r.courseId} exp ${r.expiration}`));
    if (result.toInsert.length > 10) {
      console.log(`  ... and ${result.toInsert.length - 10} more`);
    }
  }

  console.log(`\nSkipped - already has expiration: ${result.alreadyHasExpiration}`);
  console.log(`Skipped - no expiration in CSV (n/a): ${result.noExpirationInCSV}`);
  console.log(`Skipped - employee not found: ${result.notFound.length}`);

  if (preview) {
    console.log('\n=== Run with --import to apply these changes ===');
  } else {
    console.log('\n=== IMPORT COMPLETE ===');
  }
}

main().catch(console.error);
