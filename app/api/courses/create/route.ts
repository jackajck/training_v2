import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// POST - Create new course
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { course_id, course_name, duration_months, is_active } = body;

    // Validate input
    if (!course_id || course_id.trim().length === 0) {
      return NextResponse.json(
        { error: 'Course ID is required' },
        { status: 400 }
      );
    }

    if (!course_name || course_name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Course name is required' },
        { status: 400 }
      );
    }

    // Check if course_id already exists
    const existing = await sql`
      SELECT course_id FROM courses WHERE course_id = ${course_id.trim()}
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Course ID already exists' },
        { status: 409 }
      );
    }

    // Insert new course
    const newCourse = await sql`
      INSERT INTO courses (course_id, course_name, duration_months, is_active)
      VALUES (
        ${course_id.trim()},
        ${course_name.trim()},
        ${duration_months || null},
        ${is_active !== undefined ? is_active : true}
      )
      RETURNING *
    `;

    return NextResponse.json({
      success: true,
      course: newCourse[0],
      message: 'Course created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating course:', error);
    return NextResponse.json(
      { error: 'Failed to create course' },
      { status: 500 }
    );
  }
}
