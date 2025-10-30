import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { position_id, is_active } = body;

    if (!position_id || is_active === undefined) {
      return NextResponse.json(
        { error: 'Position ID and is_active status are required' },
        { status: 400 }
      );
    }

    // Update the position's active status
    await sql`
      UPDATE positions
      SET is_active = ${is_active}
      WHERE position_id = ${position_id}
    `;

    return NextResponse.json({
      success: true,
      message: `Position ${is_active ? 'activated' : 'deactivated'} successfully`
    });

  } catch (error) {
    console.error('Error toggling position status:', error);
    return NextResponse.json(
      { error: 'Failed to toggle position status' },
      { status: 500 }
    );
  }
}
