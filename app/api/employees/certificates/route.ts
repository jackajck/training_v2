import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const badge_id = searchParams.get('badge_id');

    if (!badge_id) {
      return NextResponse.json(
        { error: 'Badge ID is required' },
        { status: 400 }
      );
    }

    // Get employee basic info
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

    // Get ALL training records for this employee (all certificates they have)
    const certificates = await sql`
      SELECT
        et.training_id,
        et.course_id,
        c.course_name,
        c.duration_months,
        et.completion_date,
        et.expiration_date,
        et.created_at,
        et.notes,
        CASE
          WHEN et.expiration_date IS NULL THEN 'No Expiration'
          WHEN et.expiration_date < CURRENT_DATE THEN 'Expired'
          ELSE 'Valid'
        END as status
      FROM employee_training et
      JOIN courses c ON et.course_id = c.course_id
      WHERE et.employee_id = ${employee_id}
      ORDER BY et.completion_date DESC
    `;

    return NextResponse.json({
      success: true,
      employee: employee[0],
      certificates: certificates,
      count: certificates.length
    });

  } catch (error) {
    console.error('Error fetching employee certificates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch employee certificates' },
      { status: 500 }
    );
  }
}
