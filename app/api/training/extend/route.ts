import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { training_id, months_to_extend, extension_notes } = await request.json();

    // Validate inputs
    if (!training_id || !months_to_extend || !extension_notes) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (months_to_extend < 1 || months_to_extend > 120) {
      return NextResponse.json(
        { error: 'Months to extend must be between 1 and 120' },
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

    // Calculate new expiration date
    const currentExpiration = new Date(current[0].expiration_date);
    const newExpiration = new Date(currentExpiration);
    newExpiration.setMonth(newExpiration.getMonth() + months_to_extend);

    // Prepare extension note to append
    const timestamp = new Date().toLocaleDateString('en-US');
    const extensionNote = `\n\n[EXTENDED ${months_to_extend} months on ${timestamp}]\n${extension_notes.trim()}`;
    const updatedNotes = (current[0].notes || '') + extensionNote;

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
