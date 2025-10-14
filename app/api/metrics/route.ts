import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    // Single query to get all metrics
    const metrics = await sql`
      SELECT
        (SELECT COUNT(*) FROM positions WHERE is_active = true) as positions_count,
        (SELECT COUNT(*) FROM courses WHERE is_active = true) as courses_count,
        (SELECT COUNT(*) FROM employees WHERE is_active = true) as employees_count,
        (SELECT COUNT(*) FROM employees e
         WHERE e.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM employee_positions ep WHERE ep.employee_id = e.employee_id
         )) as employees_no_positions
    `;

    const data = metrics[0];

    return NextResponse.json({
      success: true,
      data: {
        positions: Number(data.positions_count),
        courses: Number(data.courses_count),
        employees: Number(data.employees_count),
        employeesNoPositions: Number(data.employees_no_positions)
      }
    });

  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
