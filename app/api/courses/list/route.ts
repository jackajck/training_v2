import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    let results;

    if (query && query.length >= 2) {
      // Search by course ID or name
      results = await sql`
        SELECT
          c.course_id,
          c.course_name,
          c.duration_months,
          c.is_active,
          c.created_at,
          COUNT(DISTINCT pc.position_id) as position_count,
          COUNT(DISTINCT et.employee_id) as completion_count
        FROM courses c
        LEFT JOIN position_courses pc ON c.course_id = pc.course_id
        LEFT JOIN employee_training et ON c.course_id = et.course_id
        WHERE
          c.course_name ILIKE ${'%' + query + '%'}
          OR c.course_id ILIKE ${'%' + query + '%'}
        GROUP BY c.course_id, c.course_name, c.duration_months, c.is_active, c.created_at
        ORDER BY c.course_name ASC
      `;
    } else {
      // Return all courses
      results = await sql`
        SELECT
          c.course_id,
          c.course_name,
          c.duration_months,
          c.is_active,
          c.created_at,
          COUNT(DISTINCT pc.position_id) as position_count,
          COUNT(DISTINCT et.employee_id) as completion_count
        FROM courses c
        LEFT JOIN position_courses pc ON c.course_id = pc.course_id
        LEFT JOIN employee_training et ON c.course_id = et.course_id
        GROUP BY c.course_id, c.course_name, c.duration_months, c.is_active, c.created_at
        ORDER BY c.course_name ASC
      `;
    }

    return NextResponse.json({
      success: true,
      data: results,
      count: results.length
    });

  } catch (error) {
    console.error('Error fetching courses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch courses' },
      { status: 500 }
    );
  }
}
