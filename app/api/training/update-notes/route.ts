import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { training_id, notes } = await request.json();

    // Validate inputs
    if (!training_id) {
      return NextResponse.json(
        { error: 'Missing training_id' },
        { status: 400 }
      );
    }

    // Get current training record to verify it exists
    const current = await sql`
      SELECT training_id
      FROM employee_training
      WHERE training_id = ${training_id}
    `;

    if (current.length === 0) {
      return NextResponse.json(
        { error: 'Training record not found' },
        { status: 404 }
      );
    }

    // Update the notes (can be null/empty to clear notes)
    await sql`
      UPDATE employee_training
      SET notes = ${notes || null}
      WHERE training_id = ${training_id}
    `;

    return NextResponse.json({
      success: true,
      message: 'Notes updated successfully'
    });

  } catch (error) {
    console.error('Error updating notes:', error);
    return NextResponse.json(
      { error: 'Failed to update notes' },
      { status: 500 }
    );
  }
}
