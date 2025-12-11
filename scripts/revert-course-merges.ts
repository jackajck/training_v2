import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

interface AuditEntry {
  groupCode: string;
  action: string;
  winnerId: string;
  winnerName: string;
  affectedId: string;
  affectedName: string;
  details: string;
}

async function revertMerges() {
  console.log('=== REVERTING COURSE MERGES ===\n');

  // Parse the audit CSV
  const csv = fs.readFileSync('./docs/course-merge-audit-2025-12-04.csv', 'utf8');
  const lines = csv.split('\n').slice(1); // skip header

  const winners = new Set<string>();
  const auditEntries: AuditEntry[] = [];

  for (const line of lines) {
    if (line.trim() === '') continue;
    const match = line.match(/"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
    if (match === null) continue;

    const [, groupCode, action, winnerId, winnerName, affectedId, affectedName, details] = match;
    auditEntries.push({ groupCode, action, winnerId, winnerName, affectedId, affectedName, details });

    if (winnerId) winners.add(winnerId);
  }

  console.log(`Found ${winners.size} winner courses to delete`);
  console.log(`Found ${auditEntries.length} audit entries\n`);

  // Step 1: Delete training records for winner courses
  console.log('Step 1: Deleting training records for winner courses...');
  const winnerArray = Array.from(winners);

  for (const winnerId of winnerArray) {
    const deleted = await sql`
      DELETE FROM employee_training
      WHERE course_id = ${winnerId}
      RETURNING training_id
    `;
    if (deleted.length > 0) {
      console.log(`  Deleted ${deleted.length} training records for course ${winnerId}`);
    }
  }

  // Step 2: Delete position_courses for winner courses
  console.log('\nStep 2: Deleting position_courses for winner courses...');
  for (const winnerId of winnerArray) {
    const deleted = await sql`
      DELETE FROM position_courses
      WHERE course_id = ${winnerId}
      RETURNING position_id
    `;
    if (deleted.length > 0) {
      console.log(`  Deleted ${deleted.length} position_courses for course ${winnerId}`);
    }
  }

  // Step 3: Delete winner courses
  console.log('\nStep 3: Deleting winner courses...');
  for (const winnerId of winnerArray) {
    const deleted = await sql`
      DELETE FROM courses
      WHERE course_id = ${winnerId}
      RETURNING course_name
    `;
    if (deleted.length > 0) {
      console.log(`  Deleted course: ${winnerId} - ${deleted[0].course_name}`);
    }
  }

  // Step 4: Get all unique courses from external_training that were involved in merges
  console.log('\nStep 4: Finding courses to recreate from external_training...');

  // Get all course IDs that were either winners or affected
  const allInvolvedIds = new Set<string>();
  for (const entry of auditEntries) {
    if (entry.winnerId) allInvolvedIds.add(entry.winnerId);
    if (entry.affectedId) allInvolvedIds.add(entry.affectedId);
  }

  console.log(`Total involved course IDs: ${allInvolvedIds.size}`);

  // Get these courses from external_training
  const involvedArray = Array.from(allInvolvedIds);
  const externalCourses = await sql`
    SELECT DISTINCT course_id, requirement
    FROM external_training
    WHERE course_id = ANY(${involvedArray})
    ORDER BY requirement
  `;

  console.log(`Found ${externalCourses.length} courses in external_training to recreate`);

  // Step 5: Create courses from external_training
  console.log('\nStep 5: Creating courses from external_training...');
  let created = 0;
  let skipped = 0;

  for (const ext of externalCourses) {
    // Extract name without the course ID at the end, e.g., "SPPIVT T743 Hexavalent...(13728)" -> "SPPIVT T743 Hexavalent..."
    let courseName = ext.requirement;
    const idMatch = courseName.match(/\((\d+)\)$/);
    if (idMatch) {
      courseName = courseName.replace(/\(\d+\)$/, '').trim();
    }

    // Check if course already exists
    const existing = await sql`SELECT course_id FROM courses WHERE course_id = ${ext.course_id}`;
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // Determine duration - default to 12 months, null for one-time (IL) courses
    let durationMonths: number | null = 12;
    if (courseName.includes('(IL)') && !courseName.includes('(OL)')) {
      durationMonths = null; // One-time initial learning
    }

    await sql`
      INSERT INTO courses (course_id, course_name, duration_months, is_active)
      VALUES (${ext.course_id}, ${courseName}, ${durationMonths}, true)
    `;
    created++;
    console.log(`  Created: ${ext.course_id} - ${courseName}`);
  }

  console.log(`\nCreated ${created} courses, skipped ${skipped} (already exist)`);

  // Step 6: Re-import training records from external_training
  console.log('\nStep 6: Re-importing training records from external_training...');

  // Get all external training records for involved courses
  const externalRecords = await sql`
    SELECT et.course_id, et.associate_name, et.expire_date, e.employee_id
    FROM external_training et
    JOIN employees e ON LOWER(REPLACE(e.employee_name, ' ', '')) = LOWER(REPLACE(et.associate_name, ' ', ''))
    WHERE et.course_id = ANY(${involvedArray})
    AND et.course_id IS NOT NULL
  `;

  console.log(`Found ${externalRecords.length} training records to import`);

  let imported = 0;
  let duplicates = 0;

  for (const record of externalRecords) {
    // Parse expiration date
    let expirationDate: Date | null = null;
    if (record.expire_date) {
      const parts = record.expire_date.split('/');
      if (parts.length === 3) {
        expirationDate = new Date(`${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`);
      }
    }

    // Check for existing record
    const existing = await sql`
      SELECT training_id FROM employee_training
      WHERE employee_id = ${record.employee_id} AND course_id = ${record.course_id}
    `;

    if (existing.length > 0) {
      duplicates++;
      continue;
    }

    // Insert training record
    await sql`
      INSERT INTO employee_training (employee_id, course_id, completion_date, expiration_date)
      VALUES (${record.employee_id}, ${record.course_id}, ${expirationDate}, ${expirationDate})
    `;
    imported++;
  }

  console.log(`Imported ${imported} training records, skipped ${duplicates} duplicates`);

  // Step 7: Add courses to MG_ positions
  console.log('\nStep 7: Adding courses to MG_ positions...');

  // Get employees and their MG_ positions for the imported training
  const mgPositions = await sql`
    SELECT DISTINCT et.employee_id, et.course_id, ep.position_id
    FROM employee_training et
    JOIN employee_positions ep ON et.employee_id = ep.employee_id
    WHERE et.course_id = ANY(${involvedArray})
    AND ep.position_id LIKE 'MG_%'
  `;

  let positionCoursesAdded = 0;
  for (const mg of mgPositions) {
    // Check if already exists
    const existing = await sql`
      SELECT position_id FROM position_courses
      WHERE position_id = ${mg.position_id} AND course_id = ${mg.course_id}
    `;

    if (existing.length === 0) {
      await sql`
        INSERT INTO position_courses (position_id, course_id)
        VALUES (${mg.position_id}, ${mg.course_id})
      `;
      positionCoursesAdded++;
    }
  }

  console.log(`Added ${positionCoursesAdded} position_courses entries for MG_ positions`);

  console.log('\n=== REVERT COMPLETE ===');
}

revertMerges().catch(console.error);
