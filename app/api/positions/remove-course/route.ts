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

    // Check if assignment exists
    const existing = await sql`
      SELECT * FROM position_courses
      WHERE position_id = ${position_id} AND course_id = ${course_id}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Course not assigned to this position' },
        { status: 404 }
      );
    }

    // Remove the course requirement
    await sql`
      DELETE FROM position_courses
      WHERE position_id = ${position_id} AND course_id = ${course_id}
    `;

    return NextResponse.json({
      success: true,
      message: 'Course removed from position successfully'
    });

  } catch (error) {
    console.error('Error removing course from position:', error);
    return NextResponse.json(
      { error: 'Failed to remove course from position' },
      { status: 500 }
    );
  }
}
