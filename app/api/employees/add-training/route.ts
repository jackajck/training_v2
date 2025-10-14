import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employee_id, course_id, completion_date, expiration_date } = body;

    // Validate input
    if (!employee_id || !course_id || !completion_date) {
      return NextResponse.json(
        { error: 'Employee ID, Course ID, and Completion Date are required' },
        { status: 400 }
      );
    }

    // Check if employee exists
    const employee = await sql`
      SELECT employee_id, employee_name FROM employees WHERE employee_id = ${employee_id}
    `;

    if (employee.length === 0) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Check if course exists
    const course = await sql`
      SELECT course_id, course_name FROM courses WHERE course_id = ${course_id}
    `;

    if (course.length === 0) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    // Insert training record (ON CONFLICT DO NOTHING prevents duplicates)
    await sql`
      INSERT INTO employee_training (employee_id, course_id, completion_date, expiration_date)
      VALUES (
        ${employee_id},
        ${course_id},
        ${completion_date},
        ${expiration_date || null}
      )
      ON CONFLICT (employee_id, course_id, completion_date) DO NOTHING
    `;

    return NextResponse.json({
      success: true,
      message: 'Training record added successfully',
      employee_name: employee[0].employee_name,
      course_name: course[0].course_name
    });

  } catch (error) {
    console.error('Error adding training:', error);
    return NextResponse.json(
      { error: 'Failed to add training record' },
      { status: 500 }
    );
  }
}
