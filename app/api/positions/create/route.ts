import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// POST - Create new position with auto-generated 999** ID
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

    // Get the highest existing 999** position ID
    const maxIdResult = await sql`
      SELECT position_id
      FROM positions
      WHERE position_id LIKE '999%'
      ORDER BY position_id DESC
      LIMIT 1
    `;

    // Generate next ID in 999** sequence
    let nextId: string;
    if (maxIdResult.length === 0) {
      // No 999** IDs exist yet, start at 99900
      nextId = '99900';
    } else {
      const currentMax = maxIdResult[0].position_id;
      const numericPart = parseInt(currentMax);
      nextId = (numericPart + 1).toString();
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
