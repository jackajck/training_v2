import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const leader = searchParams.get('leader');

    if (!leader) {
      return NextResponse.json(
        { error: 'Leader parameter is required' },
        { status: 400 }
      );
    }

    // Get all employees with the specified leader, including positions
    const team = await sql`
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
      WHERE e.leader = ${leader}
        AND e.is_active = true
      GROUP BY e.employee_id, e.badge_id, e.employee_name, e.is_active, e.leader, e.role, e.created_at
      ORDER BY e.employee_name ASC
    `;

    return NextResponse.json({
      success: true,
      team: team,
      count: team.length
    });

  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team members' },
      { status: 500 }
    );
  }
}
