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
      )
      SELECT
        cr.course_id as required_course_id,
        cr.course_name,
        cr.duration_months,
        cr.position_name,
        et.completion_date,
        et.expiration_date,
        et.training_id,
        et.notes,
        CASE
            WHEN et.training_id IS NULL THEN 'Never Completed'
            WHEN et.expiration_date IS NULL THEN 'Completed (No Expiration)'
            WHEN et.expiration_date < CURRENT_DATE THEN 'Expired'
            ELSE 'Valid'
        END as status
      FROM course_requirements cr
      LEFT JOIN LATERAL (
          SELECT employee_id, course_id, completion_date, expiration_date, training_id, notes
          FROM employee_training et2
          WHERE et2.employee_id = ${employee_id}
            AND et2.course_id = cr.course_id
          ORDER BY completion_date DESC
          LIMIT 1
      ) et ON true
      ORDER BY
          CASE
              WHEN et.training_id IS NULL THEN 1
              WHEN et.expiration_date < CURRENT_DATE THEN 2
              WHEN et.expiration_date IS NULL THEN 4
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
