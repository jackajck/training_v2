import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// POST - Create new course with auto-generated 999** ID
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { course_name, duration_months, is_active } = body;

    // Validate input
    if (!course_name || course_name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Course name is required' },
        { status: 400 }
      );
    }

    // Get the highest existing 999** course ID
    const maxIdResult = await sql`
      SELECT course_id
      FROM courses
      WHERE course_id LIKE '999%'
      ORDER BY course_id DESC
      LIMIT 1
    `;

    // Generate next ID in 999** sequence
    let nextId: string;
    if (maxIdResult.length === 0) {
      // No 999** IDs exist yet, start at 99900
      nextId = '99900';
    } else {
      const currentMax = maxIdResult[0].course_id;
      const numericPart = parseInt(currentMax);
      nextId = (numericPart + 1).toString();
    }

    // Insert new course
    const newCourse = await sql`
      INSERT INTO courses (course_id, course_name, duration_months, is_active)
      VALUES (
        ${nextId},
        ${course_name.trim()},
        ${duration_months || null},
        ${is_active !== undefined ? is_active : true}
      )
      RETURNING *
    `;

    return NextResponse.json({
      success: true,
      course: newCourse[0],
      message: `Course created successfully with ID: ${nextId}`
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating course:', error);
    return NextResponse.json(
      { error: 'Failed to create course' },
      { status: 500 }
    );
  }
}
