import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employee_id, position_id } = body;

    // Validate input
    if (!employee_id || !position_id) {
      return NextResponse.json(
        { error: 'Employee ID and Position ID are required' },
        { status: 400 }
      );
    }

    // Check if employee exists
    const employee = await sql`
      SELECT employee_id, employee_name FROM employees WHERE employee_id = ${employee_id}
    `;

    if (employee.length === 0) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      );
    }

    // Check if position assignment exists
    const assignment = await sql`
      SELECT * FROM employee_positions
      WHERE employee_id = ${employee_id} AND position_id = ${position_id}
    `;

    if (assignment.length === 0) {
      return NextResponse.json(
        { error: 'Position assignment not found' },
        { status: 404 }
      );
    }

    // Check how many positions the employee has
    const positionCount = await sql`
      SELECT COUNT(*) as count FROM employee_positions WHERE employee_id = ${employee_id}
    `;

    const totalPositions = parseInt(positionCount[0].count);

    // Prevent removing the last position (optional - remove this check if you want to allow it)
    if (totalPositions === 1) {
      return NextResponse.json(
        { error: 'Cannot remove the last position. Employee must have at least one position.' },
        { status: 400 }
      );
    }

    // Remove the position assignment
    await sql`
      DELETE FROM employee_positions
      WHERE employee_id = ${employee_id} AND position_id = ${position_id}
    `;

    return NextResponse.json({
      success: true,
      message: 'Position removed successfully',
      employee_name: employee[0].employee_name,
      remaining_positions: totalPositions - 1
    });

  } catch (error) {
    console.error('Error removing position:', error);
    return NextResponse.json(
      { error: 'Failed to remove position' },
      { status: 500 }
    );
  }
}
