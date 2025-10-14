import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { position_id, course_id } = body;

    // Validate input
    if (!position_id || !course_id) {
      return NextResponse.json(
        { error: 'Position ID and Course ID are required' },
        { status: 400 }
      );
    }

    // Check if position exists
    const position = await sql`
      SELECT position_id, position_name FROM positions WHERE position_id = ${position_id}
    `;

    if (position.length === 0) {
      return NextResponse.json(
        { error: 'Position not found' },
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

    // Check if assignment already exists
    const existing = await sql`
      SELECT * FROM position_courses
      WHERE position_id = ${position_id} AND course_id = ${course_id}
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Position already has this course requirement' },
        { status: 409 }
      );
    }

    // Add the course requirement
    await sql`
      INSERT INTO position_courses (position_id, course_id)
      VALUES (${position_id}, ${course_id})
    `;

    return NextResponse.json({
      success: true,
      message: 'Course added to position successfully',
      position_name: position[0].position_name,
      course_name: course[0].course_name
    });

  } catch (error) {
    console.error('Error adding course to position:', error);
    return NextResponse.json(
      { error: 'Failed to add course to position' },
      { status: 500 }
    );
  }
}
