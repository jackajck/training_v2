/**
 * Script to enable course groups that have position requirements
 *
 * This enables group matching for T-codes where positions require courses
 * from that group. Groups without position requirements stay disabled.
 *
 * Run with: npx tsx scripts/enable-course-groups.ts
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function enableCourseGroups() {
  console.log('=== Enabling Course Groups with Position Requirements ===\n');

  // Find groups that have at least one course required by a position
  const groupsWithReqs = await sql`
    SELECT DISTINCT cg.group_id, cg.group_code, cg.group_name
    FROM course_groups cg
    JOIN course_group_members cgm ON cg.group_id = cgm.group_id
    JOIN position_courses pc ON cgm.course_id = pc.course_id
    ORDER BY cg.group_code
  `;

  console.log(`Found ${groupsWithReqs.length} groups with position requirements:\n`);

  for (const group of groupsWithReqs) {
    console.log(`  - ${group.group_code}: ${group.group_name?.substring(0, 50) || 'N/A'}`);
  }

  // Enable these groups
  console.log('\nEnabling groups...');

  const groupIds = groupsWithReqs.map((g: any) => g.group_id);

  if (groupIds.length > 0) {
    await sql`
      UPDATE course_groups
      SET is_enabled = true
      WHERE group_id = ANY(${groupIds})
    `;
    console.log(`✓ Enabled ${groupIds.length} groups\n`);
  }

  // Show final state
  console.log('=== Final State ===\n');
  const allGroups = await sql`
    SELECT
      cg.group_code,
      cg.is_enabled,
      COUNT(cgm.course_id) as course_count,
      (SELECT COUNT(DISTINCT pc.position_id)
       FROM position_courses pc
       WHERE pc.course_id IN (SELECT course_id FROM course_group_members WHERE group_id = cg.group_id)
      ) as position_count
    FROM course_groups cg
    LEFT JOIN course_group_members cgm ON cg.group_id = cgm.group_id
    GROUP BY cg.group_id, cg.group_code, cg.is_enabled
    ORDER BY cg.is_enabled DESC, cg.group_code
  `;

  console.log('Enabled Groups:');
  console.log('Group Code | Courses | Positions');
  console.log('-'.repeat(40));

  let enabledCount = 0;
  let disabledCount = 0;

  for (const g of allGroups) {
    if (g.is_enabled) {
      enabledCount++;
      console.log(`${g.group_code.padEnd(10)} | ${String(g.course_count).padEnd(7)} | ${g.position_count}`);
    } else {
      disabledCount++;
    }
  }

  console.log(`\nSummary: ${enabledCount} enabled, ${disabledCount} disabled`);
}

enableCourseGroups()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
