import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    let results;

    if (query && query.length >= 2) {
      // Search by position ID or name
      results = await sql`
        SELECT
          p.position_id,
          p.position_name,
          p.is_active,
          p.created_at,
          COUNT(DISTINCT pc.course_id) as course_count,
          COUNT(DISTINCT ep.employee_id) as employee_count
        FROM positions p
        LEFT JOIN position_courses pc ON p.position_id = pc.position_id
        LEFT JOIN employee_positions ep ON p.position_id = ep.position_id
        WHERE
          p.position_name ILIKE ${'%' + query + '%'}
          OR p.position_id ILIKE ${'%' + query + '%'}
        GROUP BY p.position_id, p.position_name, p.is_active, p.created_at
        ORDER BY p.position_name ASC
        LIMIT 100
      `;
    } else {
      // Return all positions (no limit)
      results = await sql`
        SELECT
          p.position_id,
          p.position_name,
          p.is_active,
          p.created_at,
          COUNT(DISTINCT pc.course_id) as course_count,
          COUNT(DISTINCT ep.employee_id) as employee_count
        FROM positions p
        LEFT JOIN position_courses pc ON p.position_id = pc.position_id
        LEFT JOIN employee_positions ep ON p.position_id = ep.position_id
        GROUP BY p.position_id, p.position_name, p.is_active, p.created_at
        ORDER BY p.position_name ASC
      `;
    }

    return NextResponse.json({
      success: true,
      data: results,
      count: results.length
    });

  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}
