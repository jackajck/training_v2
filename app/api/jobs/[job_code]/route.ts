import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ job_code: string }> }
) {
  try {
    const { job_code } = await params;

    // Get position details by position_id (job_code is now position_id)
    const position = await sql`
      SELECT
        p.position_id,
        p.position_name,
        p.position_code,
        p.is_active,
        p.created_at
      FROM positions p
      WHERE p.position_id = ${job_code}::integer
    `;

    if (position.length === 0) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      );
    }

    // Get required courses
    const courses = await sql`
      SELECT
        c.course_id,
        c.course_name,
        c.duration_months,
        c.is_active
      FROM position_courses pc
      JOIN courses c ON pc.course_id = c.course_id
      WHERE pc.position_id = ${job_code}::integer
      ORDER BY c.course_name ASC
    `;

    // Get employees with this position
    const employees = await sql`
      SELECT
        e.badge_id,
        e.employee_name,
        e.is_active
      FROM employees e
      JOIN employee_positions ep ON e.employee_id = ep.employee_id
      WHERE ep.position_id = ${job_code}::integer
      ORDER BY e.employee_name ASC
      LIMIT 100
    `;

    return NextResponse.json({
      success: true,
      position: position[0],
      courses: courses,
      employees: employees
    });

  } catch (error) {
    console.error('Error fetching position details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch position details' },
      { status: 500 }
    );
  }
}
