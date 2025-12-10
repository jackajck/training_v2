import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET - List all anomalies with comments
export async function GET() {
  try {
    const anomalies = await sql`
      SELECT
        a.id,
        a.title,
        a.description,
        a.status,
        a.created_at,
        a.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', c.id,
              'comment', c.comment,
              'created_at', c.created_at
            ) ORDER BY c.created_at ASC
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'
        ) as comments
      FROM anomalies a
      LEFT JOIN anomaly_comments c ON a.id = c.anomaly_id
      GROUP BY a.id
      ORDER BY
        CASE a.status
          WHEN 'open' THEN 1
          WHEN 'in_progress' THEN 2
          WHEN 'resolved' THEN 3
        END,
        a.created_at DESC
    `;

    return NextResponse.json({ anomalies });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    return NextResponse.json({ error: 'Failed to fetch anomalies' }, { status: 500 });
  }
}

// POST - Create a new anomaly
export async function POST(request: NextRequest) {
  try {
    const { title, description } = await request.json();

    if (!title || title.trim() === '') {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const result = await sql`
      INSERT INTO anomalies (title, description, status)
      VALUES (${title.trim()}, ${description?.trim() || null}, 'open')
      RETURNING id, title, description, status, created_at, updated_at
    `;

    return NextResponse.json({ anomaly: result[0] });
  } catch (error) {
    console.error('Error creating anomaly:', error);
    return NextResponse.json({ error: 'Failed to create anomaly' }, { status: 500 });
  }
}
