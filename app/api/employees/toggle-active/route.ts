import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employee_id, is_active } = body;

    // Validate input
    if (!employee_id || typeof is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'Employee ID and is_active status are required' },
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

    // Update the employee's active status
    await sql`
      UPDATE employees
      SET is_active = ${is_active}
      WHERE employee_id = ${employee_id}
    `;

    return NextResponse.json({
      success: true,
      message: `Employee ${is_active ? 'activated' : 'deactivated'} successfully`,
      employee_name: employee[0].employee_name,
      is_active
    });

  } catch (error) {
    console.error('Error toggling employee status:', error);
    return NextResponse.json(
      { error: 'Failed to toggle employee status' },
      { status: 500 }
    );
  }
}
