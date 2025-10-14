import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { badge_id, employee_name, position_ids } = body;

    // Validate input
    if (!badge_id || !employee_name) {
      return NextResponse.json(
        { error: 'Badge ID and Employee Name are required' },
        { status: 400 }
      );
    }

    if (!position_ids || position_ids.length === 0) {
      return NextResponse.json(
        { error: 'At least one position is required' },
        { status: 400 }
      );
    }

    // Check if badge_id already exists
    const existing = await sql`
      SELECT badge_id FROM employees WHERE badge_id = ${badge_id}
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Badge ID already exists' },
        { status: 409 }
      );
    }

    // Create the employee
    const newEmployee = await sql`
      INSERT INTO employees (badge_id, employee_name, is_active)
      VALUES (${badge_id}, ${employee_name}, true)
      RETURNING employee_id, badge_id, employee_name, is_active, created_at
    `;

    const employee_id = newEmployee[0].employee_id;

    // Add positions
    for (const position_id of position_ids) {
      // Validate position exists
      const positionExists = await sql`
        SELECT position_id FROM positions WHERE position_id = ${position_id}
      `;

      if (positionExists.length === 0) {
        // Rollback by deleting the employee
        await sql`DELETE FROM employees WHERE employee_id = ${employee_id}`;
        return NextResponse.json(
          { error: `Invalid position ID: ${position_id}` },
          { status: 400 }
        );
      }

      // Add position assignment
      await sql`
        INSERT INTO employee_positions (employee_id, position_id)
        VALUES (${employee_id}, ${position_id})
      `;
    }

    return NextResponse.json({
      success: true,
      message: 'Employee created successfully',
      data: newEmployee[0]
    });

  } catch (error) {
    console.error('Error creating employee:', error);
    return NextResponse.json(
      { error: 'Failed to create employee' },
      { status: 500 }
    );
  }
}
