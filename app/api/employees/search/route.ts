import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = searchParams.get('limit');

    // If limit is provided without query, load first N employees
    if (limit && !query) {
      const results = await sql`
        SELECT
          e.employee_id,
          e.badge_id,
          e.employee_name,
          e.is_active,
          e.leader,
          e.role,
          e.created_at,
          STRING_AGG(p.position_name, ', ' ORDER BY p.position_name) as positions,
          STRING_AGG(p.position_id, ', ' ORDER BY p.position_id) as position_ids
        FROM employees e
        LEFT JOIN employee_positions ep ON e.employee_id = ep.employee_id
        LEFT JOIN positions p ON ep.position_id = p.position_id
        GROUP BY e.employee_id, e.badge_id, e.employee_name, e.is_active, e.leader, e.role, e.created_at
        ORDER BY e.employee_name ASC
        LIMIT ${parseInt(limit)}
      `;

      return NextResponse.json({
        success: true,
        data: results,
        count: results.length
      });
    }

    if (!query || query.length < 2) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'Search query too short'
      });
    }

    // Search by name or badge ID
    // Now returns employees with their positions (can have multiple)
    const results = await sql`
      SELECT
        e.employee_id,
        e.badge_id,
        e.employee_name,
        e.is_active,
        e.leader,
        e.role,
        e.created_at,
        STRING_AGG(p.position_name, ', ' ORDER BY p.position_name) as positions,
        STRING_AGG(p.position_id, ', ' ORDER BY p.position_id) as position_ids
      FROM employees e
      LEFT JOIN employee_positions ep ON e.employee_id = ep.employee_id
      LEFT JOIN positions p ON ep.position_id = p.position_id
      WHERE
        e.employee_name ILIKE ${'%' + query + '%'}
        OR e.badge_id ILIKE ${'%' + query + '%'}
      GROUP BY e.employee_id, e.badge_id, e.employee_name, e.is_active, e.leader, e.role, e.created_at
      ORDER BY e.employee_name ASC
      LIMIT 100
    `;

    return NextResponse.json({
      success: true,
      data: results,
      count: results.length
    });

  } catch (error) {
    console.error('Error searching employees:', error);
    return NextResponse.json(
      { error: 'Failed to search employees' },
      { status: 500 }
    );
  }
}
