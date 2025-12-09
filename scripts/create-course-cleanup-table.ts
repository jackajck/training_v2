/**
 * Script to create course_cleanup table for the course audit/cleanup tool
 *
 * This table stores decisions about each course from the external training CSV:
 * - action: 'keep', 'merge', 'delete', 'pending' (default)
 * - merge_into: course_id to merge into (if action is 'merge')
 * - rename_to: new name for the course
 * - is_one_time: true if this is a one-time course (no expiration)
 * - recert_months: months until recertification (null if one-time)
 * - notes: free-form notes
 *
 * Run with: npx tsx scripts/create-course-cleanup-table.ts
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function createCourseCleanupTable() {
  console.log('=== Creating Course Cleanup Table ===\n');

  // Drop old tables if they exist (the chain-based approach)
  console.log('1. Dropping old chain-based tables...');
  await sql`DROP TABLE IF EXISTS custom_group_exclusions`;
  await sql`DROP TABLE IF EXISTS custom_group_notes`;
  console.log('   ✓ Old tables dropped\n');

  // Create new course_cleanup table
  console.log('2. Creating course_cleanup table...');
  await sql`
    CREATE TABLE IF NOT EXISTS course_cleanup (
      id SERIAL PRIMARY KEY,
      course_id VARCHAR(50) NOT NULL UNIQUE,
      t_code VARCHAR(20),
      original_name VARCHAR(500),
      action VARCHAR(20) DEFAULT 'pending',
      merge_into VARCHAR(50),
      rename_to VARCHAR(500),
      is_one_time BOOLEAN,
      recert_months INTEGER,
      notes TEXT,
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('   ✓ course_cleanup table created\n');

  // Create index on t_code for grouping
  console.log('3. Creating indexes...');
  await sql`CREATE INDEX IF NOT EXISTS idx_course_cleanup_tcode ON course_cleanup(t_code)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_course_cleanup_action ON course_cleanup(action)`;
  console.log('   ✓ Indexes created\n');

  // Pre-populate with all courses from external_training that have T-codes
  console.log('4. Pre-populating from external_training...');

  const courses = await sql`
    SELECT DISTINCT
      course_id,
      requirement
    FROM external_training
    WHERE requirement ~ 'T[0-9]{3}'
    ORDER BY requirement
  `;

  let inserted = 0;
  for (const course of courses) {
    // Extract T-Code
    const tCodeMatch = course.requirement.match(/\bT(\d{3}[A-Z]?)\b/);
    const tCode = tCodeMatch ? `T${tCodeMatch[1]}` : null;

    try {
      await sql`
        INSERT INTO course_cleanup (course_id, t_code, original_name)
        VALUES (${course.course_id}, ${tCode}, ${course.requirement})
        ON CONFLICT (course_id) DO NOTHING
      `;
      inserted++;
    } catch (e) {
      console.log(`   ! Error inserting ${course.course_id}:`, e);
    }
  }

  console.log(`   ✓ Inserted ${inserted} courses\n`);

  // Show summary
  const summary = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT t_code) as t_codes
    FROM course_cleanup
  `;

  console.log('=== Summary ===');
  console.log(`Total courses: ${summary[0].total}`);
  console.log(`Distinct T-Codes: ${summary[0].t_codes}`);

  // Show sample of T-codes with multiple courses
  console.log('\n=== T-Codes with Multiple Courses ===');
  const multiCourse = await sql`
    SELECT t_code, COUNT(*) as course_count
    FROM course_cleanup
    WHERE t_code IS NOT NULL
    GROUP BY t_code
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `;

  for (const row of multiCourse) {
    console.log(`  ${row.t_code}: ${row.course_count} courses`);
  }
}

createCourseCleanupTable()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
