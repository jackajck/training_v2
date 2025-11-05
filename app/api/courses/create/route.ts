import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// POST - Create new course with auto-generated 999*** ID (999000-999999)
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

    // Get the highest existing 999*** course ID (6-digit IDs starting with 999)
    const maxIdResult = await sql`
      SELECT course_id
      FROM courses
      WHERE course_id LIKE '999___'
      AND LENGTH(course_id) = 6
      ORDER BY course_id DESC
      LIMIT 1
    `;

    // Generate next ID in 999*** sequence (999000-999999)
    let startId: number;

    if (maxIdResult.length === 0) {
      // No 999*** IDs exist yet, start at 999000
      startId = 999000;
    } else {
      const currentMax = maxIdResult[0].course_id;
      startId = parseInt(currentMax) + 1;
    }

    // Keep incrementing until we find an available ID
    let nextId: string | null = null;
    let attempts = 0;
    const maxAttempts = 1000; // Safety limit

    while (nextId === null && attempts < maxAttempts) {
      const checkId = (startId + attempts).toString();

      // Make sure we stay within 999000-999999 range
      if (parseInt(checkId) > 999999) {
        return NextResponse.json(
          { error: 'Course ID range exhausted (999000-999999)' },
          { status: 500 }
        );
      }

      const existingCourse = await sql`
        SELECT course_id FROM courses WHERE course_id = ${checkId}
      `;

      if (existingCourse.length === 0) {
        nextId = checkId;
      } else {
        attempts++;
      }
    }

    if (nextId === null) {
      return NextResponse.json(
        { error: 'Unable to generate unique course ID' },
        { status: 500 }
      );
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
