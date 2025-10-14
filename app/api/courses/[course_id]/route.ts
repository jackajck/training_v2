import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET - Fetch course details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ course_id: string }> }
) {
  try {
    const { course_id } = await params;

    // Get course details
    const course = await sql`
      SELECT
        c.course_id,
        c.course_name,
        c.duration_months,
        c.is_active,
        c.created_at
      FROM courses c
      WHERE c.course_id = ${course_id}
    `;

    if (course.length === 0) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    // Get positions that require this course
    const positions = await sql`
      SELECT
        p.position_id,
        p.position_name,
        p.is_active
      FROM position_courses pc
      JOIN positions p ON pc.position_id = p.position_id
      WHERE pc.course_id = ${course_id}
      ORDER BY p.position_name ASC
      LIMIT 100
    `;

    // Get completion statistics
    const stats = await sql`
      SELECT
        COUNT(DISTINCT et.employee_id) as total_completions,
        COUNT(DISTINCT CASE WHEN et.expiration_date < CURRENT_DATE THEN et.employee_id END) as expired_count,
        COUNT(DISTINCT CASE WHEN et.expiration_date >= CURRENT_DATE THEN et.employee_id END) as valid_count
      FROM employee_training et
      WHERE et.course_id = ${course_id}
    `;

    return NextResponse.json({
      success: true,
      course: course[0],
      positions: positions,
      stats: stats[0]
    });

  } catch (error) {
    console.error('Error fetching course details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch course details' },
      { status: 500 }
    );
  }
}

// PUT - Update course
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ course_id: string }> }
) {
  try {
    const { course_id } = await params;
    const body = await request.json();
    const { course_name, duration_months, is_active } = body;

    // Validate input
    if (!course_name || course_name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Course name is required' },
        { status: 400 }
      );
    }

    // Check if course exists
    const existing = await sql`
      SELECT course_id FROM courses WHERE course_id = ${course_id}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    // If setting to inactive, remove from position_courses
    if (is_active === false) {
      await sql`
        DELETE FROM position_courses
        WHERE course_id = ${course_id}
      `;
    }

    // Update course
    const updated = await sql`
      UPDATE courses
      SET
        course_name = ${course_name.trim()},
        duration_months = ${duration_months || null},
        is_active = ${is_active !== undefined ? is_active : true}
      WHERE course_id = ${course_id}
      RETURNING *
    `;

    const message = is_active === false
      ? 'Course marked inactive and removed from all positions'
      : 'Course updated successfully';

    return NextResponse.json({
      success: true,
      course: updated[0],
      message: message
    });

  } catch (error) {
    console.error('Error updating course:', error);
    return NextResponse.json(
      { error: 'Failed to update course' },
      { status: 500 }
    );
  }
}

// DELETE - Hard delete course (removes training records too!)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ course_id: string }> }
) {
  try {
    const { course_id } = await params;

    // Check if course exists
    const existing = await sql`
      SELECT course_id FROM courses WHERE course_id = ${course_id}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    // Get training record count for message
    const trainingCount = await sql`
      SELECT COUNT(*) as count
      FROM employee_training
      WHERE course_id = ${course_id}
    `;

    const trainingRecords = parseInt(trainingCount[0].count);

    // HARD DELETE: Remove everything
    // 1. Delete training records
    await sql`
      DELETE FROM employee_training
      WHERE course_id = ${course_id}
    `;

    // 2. Delete from position_courses junction table
    await sql`
      DELETE FROM position_courses
      WHERE course_id = ${course_id}
    `;

    // 3. Delete the course itself
    await sql`
      DELETE FROM courses
      WHERE course_id = ${course_id}
    `;

    const message = trainingRecords > 0
      ? `Course permanently deleted (removed ${trainingRecords} training records)`
      : 'Course permanently deleted';

    return NextResponse.json({
      success: true,
      message: message,
      training_records_deleted: trainingRecords
    });

  } catch (error) {
    console.error('Error deleting course:', error);
    return NextResponse.json(
      { error: 'Failed to delete course' },
      { status: 500 }
    );
  }
}
