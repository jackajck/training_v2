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

    // Get all employees with the specified leader
    const team = await sql`
      SELECT
        employee_id,
        badge_id,
        employee_name,
        role,
        is_active
      FROM employees
      WHERE leader = ${leader}
        AND is_active = true
      ORDER BY employee_name ASC
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
