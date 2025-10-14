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

    // Check if position exists
    const position = await sql`
      SELECT position_id, position_name FROM positions WHERE position_id = ${position_id}
    `;

    if (position.length === 0) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      );
    }

    // Check if assignment already exists
    const existing = await sql`
      SELECT * FROM employee_positions
      WHERE employee_id = ${employee_id} AND position_id = ${position_id}
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Employee already has this position' },
        { status: 409 }
      );
    }

    // Add the position assignment
    await sql`
      INSERT INTO employee_positions (employee_id, position_id)
      VALUES (${employee_id}, ${position_id})
    `;

    return NextResponse.json({
      success: true,
      message: 'Position added successfully',
      employee_name: employee[0].employee_name,
      position_name: position[0].position_name
    });

  } catch (error) {
    console.error('Error adding position:', error);
    return NextResponse.json(
      { error: 'Failed to add position' },
      { status: 500 }
    );
  }
}
