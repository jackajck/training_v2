/**
 * Script to add is_enabled column to course_groups table
 *
 * This allows selective enabling of course groups for matching.
 * Groups that are disabled will fall back to exact course ID matching.
 *
 * Run with: npx tsx scripts/add-course-groups-enabled.ts
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function addEnabledColumn() {
  console.log('=== Adding is_enabled column to course_groups ===\n');

  // Check if column already exists
  const columns = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'course_groups' AND column_name = 'is_enabled'
  `;

  if (columns.length > 0) {
    console.log('Column is_enabled already exists. Skipping.\n');
  } else {
    // Add the is_enabled column with default false (safe rollout)
    console.log('Adding is_enabled column...');
    await sql`
      ALTER TABLE course_groups
      ADD COLUMN is_enabled BOOLEAN DEFAULT false
    `;
    console.log('✓ Column added successfully\n');
  }

  // Show current state of groups
  console.log('=== Current Course Groups ===\n');
  const groups = await sql`
    SELECT
      cg.group_id,
      cg.group_code,
      cg.group_name,
      cg.is_enabled,
      COUNT(cgm.course_id) as course_count
    FROM course_groups cg
    LEFT JOIN course_group_members cgm ON cg.group_id = cgm.group_id
    GROUP BY cg.group_id, cg.group_code, cg.group_name, cg.is_enabled
    ORDER BY cg.group_code
  `;

  console.log(`Total groups: ${groups.length}\n`);
  console.log('Group Code | Enabled | Course Count | Group Name');
  console.log('-'.repeat(80));

  for (const g of groups) {
    const enabled = g.is_enabled ? 'Yes' : 'No';
    console.log(`${g.group_code.padEnd(10)} | ${enabled.padEnd(7)} | ${String(g.course_count).padEnd(12)} | ${g.group_name?.substring(0, 40) || ''}`);
  }

  console.log('\n=== To enable a group, run: ===');
  console.log("UPDATE course_groups SET is_enabled = true WHERE group_code = 'T717';");
  console.log('\n=== To enable all groups at once: ===');
  console.log('UPDATE course_groups SET is_enabled = true;');
}

addEnabledColumn()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
