import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { job_code, course_id } = body;

    // Validate input
    if (!job_code || !course_id) {
      return NextResponse.json(
        { error: 'Job Code and Course ID are required' },
        { status: 400 }
      );
    }

    // Check if assignment exists
    const existing = await sql`
      SELECT * FROM job_courses
      WHERE job_code = ${job_code} AND course_id = ${course_id}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        { error: 'Course not assigned to this job' },
        { status: 404 }
      );
    }

    // Remove the course requirement
    await sql`
      DELETE FROM job_courses
      WHERE job_code = ${job_code} AND course_id = ${course_id}
    `;

    return NextResponse.json({
      success: true,
      message: 'Course removed from job successfully'
    });

  } catch (error) {
    console.error('Error removing course from job:', error);
    return NextResponse.json(
      { error: 'Failed to remove course from job' },
      { status: 500 }
    );
  }
}
