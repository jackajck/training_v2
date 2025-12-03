import { sql } from '../lib/db';

async function mergeDuplicateCourses() {
  // Find all exact name duplicates
  const duplicates = await sql`
    SELECT course_name, array_agg(course_id ORDER BY course_id) as course_ids
    FROM courses
    GROUP BY course_name
    HAVING COUNT(*) > 1
    ORDER BY course_name
  ` as { course_name: string; course_ids: string[] }[];

  console.log('Found', duplicates.length, 'duplicate course names to merge\n');

  let totalMerged = 0;
  let totalDeleted = 0;

  for (const dup of duplicates) {
    console.log('----------------------------------------');
    console.log('Course:', dup.course_name.substring(0, 70));

    // Find which ID to keep (highest score = positions*100 + trainings)
    let bestId = '';
    let bestScore = -1;
    const idStats: { id: string; posCount: number; trainingCount: number }[] = [];

    for (const id of dup.course_ids) {
      const stats = await sql`
        SELECT
          (SELECT COUNT(*) FROM position_courses WHERE course_id = ${id}) as pos_count,
          (SELECT COUNT(*) FROM employee_training WHERE course_id = ${id}) as training_count
      `;
      const posCount = Number(stats[0].pos_count);
      const trainingCount = Number(stats[0].training_count);
      const score = posCount * 100 + trainingCount;

      idStats.push({ id, posCount, trainingCount });
      console.log('  ID:', id, '| Positions:', posCount, '| Trainings:', trainingCount);

      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    const othersToMerge = dup.course_ids.filter(id => id !== bestId);
    console.log('  KEEPING:', bestId);
    console.log('  MERGING:', othersToMerge.join(', '));

    // Merge each duplicate into the best one
    for (const oldId of othersToMerge) {
      // 1. Move position_courses (skip if already exists)
      const positionsMoved = await sql`
        INSERT INTO position_courses (position_id, course_id)
        SELECT position_id, ${bestId}
        FROM position_courses
        WHERE course_id = ${oldId}
        AND position_id NOT IN (SELECT position_id FROM position_courses WHERE course_id = ${bestId})
        RETURNING position_id
      `;

      // 2. Move employee_training (skip if already exists for same employee)
      const trainingsMoved = await sql`
        INSERT INTO employee_training (employee_id, course_id, completion_date, expiration_date)
        SELECT employee_id, ${bestId}, completion_date, expiration_date
        FROM employee_training
        WHERE course_id = ${oldId}
        AND employee_id NOT IN (SELECT employee_id FROM employee_training WHERE course_id = ${bestId})
        RETURNING employee_id
      `;

      // 3. Delete old position_courses
      await sql`DELETE FROM position_courses WHERE course_id = ${oldId}`;

      // 4. Delete old employee_training
      await sql`DELETE FROM employee_training WHERE course_id = ${oldId}`;

      // 5. Remove from course_group_members
      await sql`DELETE FROM course_group_members WHERE course_id = ${oldId}`;

      // 6. Delete the old course
      await sql`DELETE FROM courses WHERE course_id = ${oldId}`;

      console.log('    Merged', oldId, '-> Positions:', positionsMoved.length, '| Trainings:', trainingsMoved.length);
      totalDeleted++;
    }

    totalMerged++;
  }

  // Clean up empty course groups
  const emptyGroups = await sql`
    DELETE FROM course_groups
    WHERE group_id NOT IN (SELECT DISTINCT group_id FROM course_group_members)
    RETURNING group_id
  `;

  console.log('\n========================================');
  console.log('DONE!');
  console.log('Merged', totalMerged, 'duplicate sets');
  console.log('Deleted', totalDeleted, 'duplicate courses');
  console.log('Cleaned up', emptyGroups.length, 'empty course groups');
}

// Run with --dry-run to just show what would happen
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('DRY RUN - showing what would be merged:\n');

  sql`
    SELECT course_name, array_agg(course_id ORDER BY course_id) as course_ids
    FROM courses
    GROUP BY course_name
    HAVING COUNT(*) > 1
    ORDER BY course_name
  `.then(async (duplicates) => {
    for (const dup of duplicates as { course_name: string; course_ids: string[] }[]) {
      console.log(dup.course_name.substring(0, 60));
      for (const id of dup.course_ids) {
        const stats = await sql`
          SELECT
            (SELECT COUNT(*) FROM position_courses WHERE course_id = ${id}) as pos_count,
            (SELECT COUNT(*) FROM employee_training WHERE course_id = ${id}) as training_count
        `;
        console.log('  ID:', id, '| Pos:', stats[0].pos_count, '| Train:', stats[0].training_count);
      }
    }
    console.log('\nRun without --dry-run to actually merge');
    process.exit(0);
  });
} else {
  mergeDuplicateCourses()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}
