import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// POST - Create new position with auto-generated 555*** ID (555000-555999)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { position_name } = body;

    // Validate input
    if (!position_name || position_name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Position name is required' },
        { status: 400 }
      );
    }

    // Get the highest existing 555*** position ID (6-digit IDs starting with 555)
    const maxIdResult = await sql`
      SELECT position_id
      FROM positions
      WHERE position_id LIKE '555___'
      AND LENGTH(position_id) = 6
      ORDER BY position_id DESC
      LIMIT 1
    `;

    // Generate next ID in 555*** sequence (555000-555999)
    let nextId: string;
    let startId: number;

    if (maxIdResult.length === 0) {
      // No 555*** IDs exist yet, start at 555000
      startId = 555000;
    } else {
      const currentMax = maxIdResult[0].position_id;
      startId = parseInt(currentMax) + 1;
    }

    // Keep incrementing until we find an available ID
    let found = false;
    let attempts = 0;
    const maxAttempts = 1000; // Safety limit

    while (!found && attempts < maxAttempts) {
      const checkId = (startId + attempts).toString();

      // Make sure we stay within 555000-555999 range
      if (parseInt(checkId) > 555999) {
        return NextResponse.json(
          { error: 'Position ID range exhausted (555000-555999)' },
          { status: 500 }
        );
      }

      const existingPosition = await sql`
        SELECT position_id FROM positions WHERE position_id = ${checkId}
      `;

      if (existingPosition.length === 0) {
        nextId = checkId;
        found = true;
      } else {
        attempts++;
      }
    }

    if (!found) {
      return NextResponse.json(
        { error: 'Unable to generate unique position ID' },
        { status: 500 }
      );
    }

    // Insert new position
    const newPosition = await sql`
      INSERT INTO positions (position_id, position_name, is_active)
      VALUES (
        ${nextId},
        ${position_name.trim()},
        true
      )
      RETURNING *
    `;

    return NextResponse.json({
      success: true,
      position: newPosition[0],
      message: `Position created successfully with ID: ${nextId}`
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating position:', error);
    return NextResponse.json(
      { error: 'Failed to create position' },
      { status: 500 }
    );
  }
}
