import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const sql = neon(DATABASE_URL);

async function createMissingCourses() {
  // Find all courses in external_training that don't exist in courses table
  console.log('=== Finding Missing Courses ===');
  const missing = await sql`
    SELECT DISTINCT et.course_id, et.requirement
    FROM external_training et
    LEFT JOIN courses c ON et.course_id = c.course_id
    WHERE c.course_id IS NULL
    AND et.course_id IS NOT NULL
    ORDER BY et.requirement
  `;

  console.log(`Found ${missing.length} missing courses:`);
  for (const m of missing) {
    console.log(`  ${m.course_id}: ${m.requirement}`);
  }

  // Create them
  console.log('\n=== Creating Missing Courses ===');
  for (const ext of missing) {
    // Extract name without the course ID at the end
    let courseName = ext.requirement;
    const idMatch = courseName.match(/\(\d+\)$/);
    if (idMatch) {
      courseName = courseName.replace(/\(\d+\)$/, '').trim();
    }

    // Determine duration - default to 12 months, null for one-time (IL) courses
    let durationMonths: number | null = 12;
    if (courseName.includes('(IL)') && !courseName.includes('(OL)')) {
      durationMonths = null;
    }

    await sql`
      INSERT INTO courses (course_id, course_name, duration_months, is_active)
      VALUES (${ext.course_id}, ${courseName}, ${durationMonths}, true)
    `;
    console.log(`  Created: ${ext.course_id} - ${courseName}`);
  }

  console.log(`\nDone! Created ${missing.length} courses`);
}

createMissingCourses().catch(console.error);
