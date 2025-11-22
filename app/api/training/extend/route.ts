import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { training_id, new_expiration_date, extension_notes } = await request.json();

    // Validate inputs
    if (!training_id || !new_expiration_date || !extension_notes) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate date format
    const newExpiration = new Date(new_expiration_date);
    if (isNaN(newExpiration.getTime())) {
      return NextResponse.json(
        { error: 'Invalid expiration date' },
        { status: 400 }
      );
    }

    // Get current training record
    const current = await sql`
      SELECT expiration_date, notes
      FROM employee_training
      WHERE training_id = ${training_id}
    `;

    if (current.length === 0) {
      return NextResponse.json(
        { error: 'Training record not found' },
        { status: 404 }
      );
    }

    if (!current[0].expiration_date) {
      return NextResponse.json(
        { error: 'Cannot extend training with no expiration date' },
        { status: 400 }
      );
    }

    const currentExpiration = new Date(current[0].expiration_date);

    // Append the new note to existing notes
    const updatedNotes = current[0].notes
      ? `${current[0].notes}\n${extension_notes.trim()}`
      : extension_notes.trim();

    // Update the record
    await sql`
      UPDATE employee_training
      SET
        expiration_date = ${newExpiration.toISOString()},
        notes = ${updatedNotes}
      WHERE training_id = ${training_id}
    `;

    return NextResponse.json({
      success: true,
      message: 'Certificate extended successfully',
      new_expiration: newExpiration.toISOString(),
      old_expiration: currentExpiration.toISOString()
    });

  } catch (error) {
    console.error('Error extending certificate:', error);
    return NextResponse.json(
      { error: 'Failed to extend certificate' },
      { status: 500 }
    );
  }
}
