/**
 * Migrate "Not Found" courses from external_training into our system
 *
 * For each employee with courses in external_training that:
 *   - Exist in our courses table (have a valid course_id)
 *   - BUT the employee doesn't have a training record for
 *
 * We will:
 *   1. Create a migration position: MG_{LastNameFirstName} (no spaces/commas)
 *   2. Link all the "not found" courses to that position
 *   3. Assign the position to the employee
 *   4. Create employee_training records with dates from external data
 *
 * Usage:
 *   DRY RUN (single employee): npx tsx scripts/migrate-external-training.ts --dry-run --name "Burke,John"
 *   EXECUTE (single employee): npx tsx scripts/migrate-external-training.ts --name "Burke,John"
 *   DRY RUN (all employees):   npx tsx scripts/migrate-external-training.ts --dry-run --all
 *   EXECUTE (all employees):   npx tsx scripts/migrate-external-training.ts --all
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

interface NotFoundCourse {
  course_id: string;
  course_name: string;
  status: string;
  expire_date: string | null;
  expiration_date: Date | null;
}

interface MigrationPlan {
  employeeId: number;
  employeeName: string;
  badgeId: string;
  positionName: string;
  courses: NotFoundCourse[];
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    all: args.includes('--all'),
    name: args.find((a, i) => args[i - 1] === '--name') || null
  };
}

function generatePositionName(employeeName: string): string {
  // "Burke,John R" -> "MG_BurkeJohnR"
  const cleaned = employeeName.replace(/[,\s]+/g, '');
  return `MG_${cleaned}`;
}

async function getNotFoundCourses(employeeName: string, employeeId: number): Promise<NotFoundCourse[]> {
  // Get all courses from external_training for this employee
  // that exist in our courses table but employee doesn't have training for
  const result = await sql`
    SELECT DISTINCT
      et.course_id,
      et.requirement as course_name,
      et.status,
      et.expire_date,
      et.expiration_date
    FROM external_training et
    JOIN courses c ON et.course_id = c.course_id
    LEFT JOIN employee_training etr
      ON etr.employee_id = ${employeeId}
      AND etr.course_id = et.course_id
    WHERE LOWER(et.associate_name) = LOWER(${employeeName})
      AND et.course_id IS NOT NULL
      AND etr.training_id IS NULL
    ORDER BY et.requirement
  `;

  return result as NotFoundCourse[];
}

async function buildMigrationPlan(employeeName: string): Promise<MigrationPlan | null> {
  // Find employee in our database (exact match)
  const employees = await sql`
    SELECT employee_id, employee_name, badge_id
    FROM employees
    WHERE LOWER(employee_name) = LOWER(${employeeName})
  `;

  if (employees.length === 0) {
    console.log(`  ⚠ Employee "${employeeName}" not found in our database`);
    return null;
  }

  if (employees.length > 1) {
    console.log(`  ⚠ Multiple employees found for "${employeeName}" - skipping`);
    return null;
  }

  const employee = employees[0] as { employee_id: number; employee_name: string; badge_id: string };

  const notFoundCourses = await getNotFoundCourses(employeeName, employee.employee_id);

  if (notFoundCourses.length === 0) {
    console.log(`  ✓ No "Not Found" courses for ${employeeName} - nothing to migrate`);
    return null;
  }

  return {
    employeeId: employee.employee_id,
    employeeName: employee.employee_name,
    badgeId: employee.badge_id,
    positionName: generatePositionName(employee.employee_name),
    courses: notFoundCourses
  };
}

async function getNextMigrationPositionId(): Promise<string> {
  // Migration positions use IDs in the 777xxx range to distinguish from regular positions (555xxx)
  const result = await sql`
    SELECT MAX(CAST(position_id AS INTEGER)) as max_id
    FROM positions
    WHERE position_id ~ '^777[0-9]+$'
  `;
  const maxId = (result[0] as { max_id: number | null }).max_id;
  return String((maxId || 776999) + 1);
}

async function executeMigration(plan: MigrationPlan): Promise<void> {
  console.log(`\n  Executing migration for ${plan.employeeName}...`);

  // 1. Create the migration position (or get existing)
  let positionId: string;
  const existingPosition = await sql`
    SELECT position_id FROM positions WHERE position_name = ${plan.positionName}
  `;

  if (existingPosition.length > 0) {
    positionId = (existingPosition[0] as { position_id: string }).position_id;
    console.log(`    → Using existing position: ${plan.positionName} (ID: ${positionId})`);
  } else {
    const newId = await getNextMigrationPositionId();
    await sql`
      INSERT INTO positions (position_id, position_name, is_active)
      VALUES (${newId}, ${plan.positionName}, true)
    `;
    positionId = newId;
    console.log(`    → Created position: ${plan.positionName} (ID: ${positionId})`);
  }

  // 2. Assign position to employee (if not already assigned)
  const existingAssignment = await sql`
    SELECT 1 FROM employee_positions
    WHERE employee_id = ${plan.employeeId} AND position_id = ${positionId}
  `;

  if (existingAssignment.length === 0) {
    await sql`
      INSERT INTO employee_positions (employee_id, position_id)
      VALUES (${plan.employeeId}, ${positionId})
    `;
    console.log(`    → Assigned position to employee`);
  } else {
    console.log(`    → Position already assigned to employee`);
  }

  // 3. Link courses to position and create training records
  for (const course of plan.courses) {
    // Link course to position (if not already linked)
    const existingLink = await sql`
      SELECT 1 FROM position_courses
      WHERE position_id = ${positionId} AND course_id = ${course.course_id}
    `;

    if (existingLink.length === 0) {
      await sql`
        INSERT INTO position_courses (position_id, course_id)
        VALUES (${positionId}, ${course.course_id})
      `;
    }

    // Create training record
    // Parse expiration date from external data
    let expirationDate: Date | null = null;
    if (course.expiration_date) {
      expirationDate = new Date(course.expiration_date);
    } else if (course.expire_date) {
      // Try to parse from string like "12/31/2025"
      const parts = course.expire_date.split('/');
      if (parts.length === 3) {
        expirationDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      }
    }

    // Estimate completion date (if we have expiration, assume course duration to back-calculate)
    // For now, use expiration date as completion date if no better data
    const completionDate = expirationDate;

    await sql`
      INSERT INTO employee_training (employee_id, course_id, completion_date, expiration_date, notes)
      VALUES (
        ${plan.employeeId},
        ${course.course_id},
        ${completionDate},
        ${expirationDate},
        'Migrated from external training data'
      )
    `;
  }

  console.log(`    → Added ${plan.courses.length} training records`);
  console.log(`  ✓ Migration complete for ${plan.employeeName}`);
}

function printPlan(plan: MigrationPlan): void {
  console.log(`\n  Employee: ${plan.employeeName} (Badge: ${plan.badgeId}, ID: ${plan.employeeId})`);
  console.log(`  Migration Position: ${plan.positionName}`);
  console.log(`  Courses to migrate (${plan.courses.length}):`);

  for (const course of plan.courses) {
    const expiry = course.expire_date || course.expiration_date || 'No date';
    console.log(`    - ${course.course_id}: ${course.course_name}`);
    console.log(`      Status: ${course.status}, Expires: ${expiry}`);
  }
}

async function main() {
  const { dryRun, all, name } = parseArgs();

  console.log('\n========================================');
  console.log('  External Training Migration Script');
  console.log('========================================');
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log(`  Target: ${all ? 'All employees' : name || '(none specified)'}`);
  console.log('========================================\n');

  if (!all && !name) {
    console.log('Usage:');
    console.log('  npx tsx scripts/migrate-external-training.ts --dry-run --name "Burke,John"');
    console.log('  npx tsx scripts/migrate-external-training.ts --name "Burke,John"');
    console.log('  npx tsx scripts/migrate-external-training.ts --dry-run --all');
    console.log('  npx tsx scripts/migrate-external-training.ts --all');
    process.exit(1);
  }

  let employeeNames: string[] = [];

  if (all) {
    // Get all distinct employee names from external_training that exist in our DB
    const names = await sql`
      SELECT DISTINCT et.associate_name
      FROM external_training et
      JOIN employees e ON LOWER(et.associate_name) = LOWER(e.employee_name)
      ORDER BY et.associate_name
    `;
    employeeNames = (names as { associate_name: string }[]).map(n => n.associate_name);
    console.log(`Found ${employeeNames.length} employees in external data that match our database\n`);
  } else if (name) {
    employeeNames = [name];
  }

  const plans: MigrationPlan[] = [];
  let skipped = 0;

  for (const empName of employeeNames) {
    console.log(`Processing: ${empName}`);
    const plan = await buildMigrationPlan(empName);
    if (plan) {
      plans.push(plan);
      printPlan(plan);
    } else {
      skipped++;
    }
  }

  console.log('\n========================================');
  console.log('  Summary');
  console.log('========================================');
  console.log(`  Employees to migrate: ${plans.length}`);
  console.log(`  Employees skipped: ${skipped}`);
  console.log(`  Total courses to add: ${plans.reduce((sum, p) => sum + p.courses.length, 0)}`);
  console.log('========================================\n');

  if (dryRun) {
    console.log('DRY RUN - No changes made. Remove --dry-run to execute.\n');
  } else if (plans.length > 0) {
    console.log('Executing migrations...\n');
    for (const plan of plans) {
      await executeMigration(plan);
    }
    console.log('\n✓ All migrations complete!\n');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
