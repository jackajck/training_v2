import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';

const sql = neon(process.env.DATABASE_URL!);

interface MergeAction {
  group_code: string;
  action: 'MERGE' | 'DELETE_OBSOLETE' | 'TRANSFER_POSITION' | 'TRANSFER_TRAINING' | 'DELETE_COURSE' | 'REMOVE_FROM_GROUP';
  winner_course_id: string | null;
  winner_course_name: string | null;
  affected_course_id: string;
  affected_course_name: string;
  details: string;
}

async function main() {
  const isDryRun = !process.argv.includes('--execute');

  console.log(isDryRun ? '=== DRY RUN MODE ===' : '=== EXECUTING CHANGES ===');
  console.log('');

  const auditLog: MergeAction[] = [];

  // Step 1: Delete obsolete course 999015
  console.log('Step 1: Removing obsolete course 999015 (T532B1)...');

  const obsoleteCourse = await sql`
    SELECT course_id, course_name FROM courses WHERE course_id = '999015'
  `;

  if (obsoleteCourse.length > 0) {
    auditLog.push({
      group_code: 'T532A',
      action: 'DELETE_OBSOLETE',
      winner_course_id: null,
      winner_course_name: null,
      affected_course_id: '999015',
      affected_course_name: obsoleteCourse[0].course_name,
      details: 'Obsolete course with 0 positions and 0 trainings'
    });

    if (!isDryRun) {
      await sql`DELETE FROM course_group_members WHERE course_id = '999015'`;
      await sql`DELETE FROM courses WHERE course_id = '999015'`;
    }
    console.log('  Removed obsolete course 999015');
  } else {
    console.log('  Course 999015 not found (already removed?)');
  }

  // Step 2: Get all course groups with their members
  console.log('\nStep 2: Finding groups to merge...');

  const groups = await sql`
    SELECT
      cg.group_id,
      cg.group_code,
      cg.group_name,
      c.course_id,
      c.course_name,
      (SELECT COUNT(*)::int FROM position_courses pc WHERE pc.course_id = c.course_id) as position_count,
      (SELECT COUNT(*)::int FROM employee_training et WHERE et.course_id = c.course_id) as training_count
    FROM course_groups cg
    JOIN course_group_members cgm ON cg.group_id = cgm.group_id
    JOIN courses c ON cgm.course_id = c.course_id
    WHERE c.course_id != '999015'
    ORDER BY cg.group_code, c.course_name
  `;

  // Group by group_code
  const byGroup: Record<string, typeof groups> = {};
  for (const row of groups) {
    if (!byGroup[row.group_code]) {
      byGroup[row.group_code] = [];
    }
    byGroup[row.group_code].push(row);
  }

  let totalMerged = 0;
  let totalPositionsTransferred = 0;
  let totalTrainingsTransferred = 0;
  let totalCoursesDeleted = 0;

  // Step 3: Process each group
  console.log('\nStep 3: Processing merges...\n');

  for (const [groupCode, courses] of Object.entries(byGroup)) {
    if (courses.length < 2) continue;

    // Find winner - shortest name (plainest, no suffix)
    const sorted = [...courses].sort((a, b) =>
      (a.course_name as string).length - (b.course_name as string).length
    );
    const winner = sorted[0];
    const losers = sorted.slice(1);

    console.log(`[${groupCode}] Merging ${courses.length} courses into ${winner.course_id}`);
    console.log(`  Winner: ${winner.course_id} - ${winner.course_name}`);

    for (const loser of losers) {
      console.log(`  Merging: ${loser.course_id} - ${loser.course_name}`);

      // Transfer positions
      if (loser.position_count > 0) {
        // Check for conflicts (position already has winner course)
        const conflicts = await sql`
          SELECT pc.position_id
          FROM position_courses pc
          WHERE pc.course_id = ${loser.course_id}
          AND pc.position_id IN (
            SELECT position_id FROM position_courses WHERE course_id = ${winner.course_id}
          )
        `;

        const conflictIds = conflicts.map(c => c.position_id);

        if (!isDryRun) {
          // Delete conflicts (position already has winner)
          if (conflictIds.length > 0) {
            await sql`
              DELETE FROM position_courses
              WHERE course_id = ${loser.course_id}
              AND position_id = ANY(${conflictIds})
            `;
          }

          // Transfer non-conflicts
          const transferred = await sql`
            UPDATE position_courses
            SET course_id = ${winner.course_id}
            WHERE course_id = ${loser.course_id}
            RETURNING position_id
          `;
          totalPositionsTransferred += transferred.length;

          if (transferred.length > 0) {
            auditLog.push({
              group_code: groupCode,
              action: 'TRANSFER_POSITION',
              winner_course_id: winner.course_id,
              winner_course_name: winner.course_name,
              affected_course_id: loser.course_id,
              affected_course_name: loser.course_name,
              details: `Transferred ${transferred.length} positions (${conflictIds.length} conflicts skipped)`
            });
          }
        } else {
          console.log(`    Would transfer ${loser.position_count} positions (${conflictIds.length} conflicts)`);
        }
      }

      // Transfer trainings
      if (loser.training_count > 0) {
        // Check for conflicts (employee already has winner course training)
        const trainingConflicts = await sql`
          SELECT et.employee_id
          FROM employee_training et
          WHERE et.course_id = ${loser.course_id}
          AND et.employee_id IN (
            SELECT employee_id FROM employee_training WHERE course_id = ${winner.course_id}
          )
        `;

        const trainingConflictIds = trainingConflicts.map(c => c.employee_id);

        if (!isDryRun) {
          // Delete conflicts
          if (trainingConflictIds.length > 0) {
            await sql`
              DELETE FROM employee_training
              WHERE course_id = ${loser.course_id}
              AND employee_id = ANY(${trainingConflictIds})
            `;
          }

          // Transfer non-conflicts
          const transferred = await sql`
            UPDATE employee_training
            SET course_id = ${winner.course_id}
            WHERE course_id = ${loser.course_id}
            RETURNING employee_id
          `;
          totalTrainingsTransferred += transferred.length;

          if (transferred.length > 0 || trainingConflictIds.length > 0) {
            auditLog.push({
              group_code: groupCode,
              action: 'TRANSFER_TRAINING',
              winner_course_id: winner.course_id,
              winner_course_name: winner.course_name,
              affected_course_id: loser.course_id,
              affected_course_name: loser.course_name,
              details: `Transferred ${transferred.length} trainings (${trainingConflictIds.length} conflicts deleted - employee already had winner course)`
            });
          }
        } else {
          console.log(`    Would transfer ${loser.training_count} trainings (${trainingConflictIds.length} conflicts)`);
        }
      }

      // Log the merge action
      auditLog.push({
        group_code: groupCode,
        action: 'MERGE',
        winner_course_id: winner.course_id,
        winner_course_name: winner.course_name,
        affected_course_id: loser.course_id,
        affected_course_name: loser.course_name,
        details: `Merged into winner. Original: ${loser.position_count} positions, ${loser.training_count} trainings`
      });

      // Remove from group and delete course
      if (!isDryRun) {
        await sql`DELETE FROM course_group_members WHERE course_id = ${loser.course_id}`;
        await sql`DELETE FROM courses WHERE course_id = ${loser.course_id}`;
        totalCoursesDeleted++;
      }

      auditLog.push({
        group_code: groupCode,
        action: 'DELETE_COURSE',
        winner_course_id: winner.course_id,
        winner_course_name: winner.course_name,
        affected_course_id: loser.course_id,
        affected_course_name: loser.course_name,
        details: 'Course deleted after merge'
      });
    }

    totalMerged++;
    console.log('');
  }

  // Step 4: Clean up empty groups
  console.log('Step 4: Cleaning up empty course groups...');

  if (!isDryRun) {
    const emptyGroups = await sql`
      DELETE FROM course_groups
      WHERE group_id NOT IN (SELECT DISTINCT group_id FROM course_group_members)
      RETURNING group_id, group_code, group_name
    `;
    console.log(`  Removed ${emptyGroups.length} empty groups`);
  }

  // Step 5: Write CSV audit log
  const timestamp = new Date().toISOString().split('T')[0];
  const csvFilename = `course-merge-audit-${timestamp}.csv`;

  const csvHeader = 'group_code,action,winner_course_id,winner_course_name,affected_course_id,affected_course_name,details\n';
  const csvRows = auditLog.map(row =>
    `"${row.group_code}","${row.action}","${row.winner_course_id || ''}","${(row.winner_course_name || '').replace(/"/g, '""')}","${row.affected_course_id}","${row.affected_course_name.replace(/"/g, '""')}","${row.details.replace(/"/g, '""')}"`
  ).join('\n');

  fs.writeFileSync(csvFilename, csvHeader + csvRows);
  console.log(`\nAudit log written to: ${csvFilename}`);

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(`Groups merged: ${totalMerged}`);
  if (!isDryRun) {
    console.log(`Courses deleted: ${totalCoursesDeleted}`);
    console.log(`Positions transferred: ${totalPositionsTransferred}`);
    console.log(`Trainings transferred: ${totalTrainingsTransferred}`);
  }
  console.log(`Audit log entries: ${auditLog.length}`);

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN - No changes made. Run with --execute to apply changes.');
  } else {
    console.log('\n✅ Changes applied successfully!');
  }
}

main().catch(console.error);
