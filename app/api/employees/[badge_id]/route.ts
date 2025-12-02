import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ badge_id: string }> }
) {
  try {
    const { badge_id } = await params;

    // Get employee basic info with positions
    const employee = await sql`
      SELECT
        e.employee_id,
        e.badge_id,
        e.employee_name,
        e.is_active,
        e.leader,
        e.role,
        e.created_at
      FROM employees e
      WHERE e.badge_id = ${badge_id}
    `;

    if (employee.length === 0) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    const employee_id = employee[0].employee_id;

    // Get all active positions for this employee
    const positions = await sql`
      SELECT
        p.position_id,
        p.position_name,
        ep.job_code,
        p.is_active
      FROM employee_positions ep
      JOIN positions p ON ep.position_id = p.position_id
      WHERE ep.employee_id = ${employee_id}
        AND p.is_active = true
      ORDER BY p.position_name ASC
    `;

    // Get required courses from ALL positions with completion status
    // Group by course to handle cases where multiple positions require the same course
    // Now supports course group matching - if a required course belongs to an enabled group,
    // any course in that group can satisfy the requirement (uses latest expiration date)
    const training = await sql`
      WITH course_requirements AS (
        SELECT DISTINCT
          erc.employee_id,
          erc.course_id,
          erc.course_name,
          erc.duration_months,
          STRING_AGG(DISTINCT erc.position_name, ', ' ORDER BY erc.position_name) as position_name
        FROM employee_required_courses erc
        WHERE erc.employee_id = ${employee_id}
        GROUP BY erc.employee_id, erc.course_id, erc.course_name, erc.duration_months
      ),
      -- Get enabled course groups for required courses
      required_course_groups AS (
        SELECT
          cgm.course_id as required_course_id,
          cg.group_id,
          cg.group_code
        FROM course_group_members cgm
        JOIN course_groups cg ON cgm.group_id = cg.group_id
        WHERE cg.is_enabled = true
      ),
      -- Find all courses in enabled groups that this employee has
      employee_group_training AS (
        SELECT
          et.employee_id,
          cg.group_id,
          cg.group_code,
          et.course_id as completed_course_id,
          c.course_name as completed_course_name,
          et.completion_date,
          et.expiration_date,
          et.training_id,
          et.notes
        FROM employee_training et
        JOIN course_group_members cgm ON et.course_id = cgm.course_id
        JOIN course_groups cg ON cgm.group_id = cg.group_id
        JOIN courses c ON et.course_id = c.course_id
        WHERE et.employee_id = ${employee_id}
          AND cg.is_enabled = true
      )
      SELECT
        cr.course_id as required_course_id,
        cr.course_name,
        cr.duration_months,
        cr.position_name,
        COALESCE(group_match.completion_date, exact_match.completion_date) as completion_date,
        COALESCE(group_match.expiration_date, exact_match.expiration_date) as expiration_date,
        COALESCE(group_match.training_id, exact_match.training_id) as training_id,
        COALESCE(group_match.notes, exact_match.notes) as notes,
        CASE
            WHEN exact_match.training_id IS NOT NULL THEN 'exact'
            WHEN group_match.training_id IS NOT NULL THEN 'group'
            ELSE NULL
        END as match_type,
        group_match.group_code,
        group_match.completed_course_id as matched_course_id,
        group_match.completed_course_name as matched_course_name,
        CASE
            WHEN COALESCE(group_match.training_id, exact_match.training_id) IS NULL THEN 'Never Completed'
            WHEN COALESCE(group_match.expiration_date, exact_match.expiration_date) IS NULL THEN 'Completed (No Expiration)'
            WHEN COALESCE(group_match.expiration_date, exact_match.expiration_date) < CURRENT_DATE THEN 'Expired'
            ELSE 'Valid'
        END as status
      FROM course_requirements cr
      -- Exact match (existing behavior)
      LEFT JOIN LATERAL (
          SELECT employee_id, course_id, completion_date, expiration_date, training_id, notes
          FROM employee_training et2
          WHERE et2.employee_id = ${employee_id}
            AND et2.course_id = cr.course_id
          ORDER BY expiration_date DESC NULLS LAST, completion_date DESC
          LIMIT 1
      ) exact_match ON true
      -- Group match (new behavior) - find best matching course from same group
      LEFT JOIN LATERAL (
          SELECT
            egt.training_id,
            egt.completion_date,
            egt.expiration_date,
            egt.notes,
            egt.group_code,
            egt.completed_course_id,
            egt.completed_course_name
          FROM employee_group_training egt
          JOIN required_course_groups rcg ON rcg.required_course_id = cr.course_id
            AND egt.group_id = rcg.group_id
          WHERE exact_match.training_id IS NULL  -- Only use group match if no exact match
          ORDER BY egt.expiration_date DESC NULLS LAST, egt.completion_date DESC
          LIMIT 1
      ) group_match ON true
      ORDER BY
          CASE
              WHEN COALESCE(group_match.training_id, exact_match.training_id) IS NULL THEN 1
              WHEN COALESCE(group_match.expiration_date, exact_match.expiration_date) < CURRENT_DATE THEN 2
              WHEN COALESCE(group_match.expiration_date, exact_match.expiration_date) IS NULL THEN 4
              ELSE 3
          END,
          cr.course_name
    `;

    return NextResponse.json({
      success: true,
      employee: employee[0],
      positions: positions,
      training: training
    });

  } catch (error) {
    console.error('Error fetching employee details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch employee details' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ badge_id: string }> }
) {
  try {
    const { badge_id } = await params;
    const body = await request.json();
    const { leader, role } = body;

    // Update the leader and/or role field
    if (leader !== undefined && role !== undefined) {
      await sql`
        UPDATE employees
        SET leader = ${leader}, role = ${role}
        WHERE badge_id = ${badge_id}
      `;
    } else if (leader !== undefined) {
      await sql`
        UPDATE employees
        SET leader = ${leader}
        WHERE badge_id = ${badge_id}
      `;
    } else if (role !== undefined) {
      await sql`
        UPDATE employees
        SET role = ${role}
        WHERE badge_id = ${badge_id}
      `;
    } else {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Employee updated successfully'
    });

  } catch (error) {
    console.error('Error updating employee:', error);
    return NextResponse.json(
      { error: 'Failed to update employee' },
      { status: 500 }
    );
  }
}
