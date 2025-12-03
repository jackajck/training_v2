import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    // Check authentication
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth');

    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get unique names from external_training table
    const result = await sql`
      SELECT DISTINCT associate_name
      FROM external_training
      ORDER BY associate_name
    `;

    const names = (result as { associate_name: string }[]).map(r => r.associate_name);

    return NextResponse.json({
      success: true,
      names,
      count: names.length
    });

  } catch (error) {
    console.error('Error reading names:', error);
    return NextResponse.json(
      { error: 'Failed to read names', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
