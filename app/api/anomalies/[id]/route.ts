import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET - Get a single anomaly by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const anomalyId = parseInt(id);

    if (isNaN(anomalyId)) {
      return NextResponse.json({ error: 'Invalid anomaly ID' }, { status: 400 });
    }

    const result = await sql`
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
      WHERE a.id = ${anomalyId}
      GROUP BY a.id
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Anomaly not found' }, { status: 404 });
    }

    return NextResponse.json({ anomaly: result[0] });
  } catch (error) {
    console.error('Error fetching anomaly:', error);
    return NextResponse.json({ error: 'Failed to fetch anomaly' }, { status: 500 });
  }
}

// PUT - Update an anomaly
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const anomalyId = parseInt(id);

    if (isNaN(anomalyId)) {
      return NextResponse.json({ error: 'Invalid anomaly ID' }, { status: 400 });
    }

    const { title, description, status } = await request.json();

    // Validate status if provided
    const validStatuses = ['open', 'in_progress', 'resolved'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const result = await sql`
      UPDATE anomalies
      SET
        title = COALESCE(${title?.trim() || null}, title),
        description = COALESCE(${description?.trim() || null}, description),
        status = COALESCE(${status || null}, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${anomalyId}
      RETURNING id, title, description, status, created_at, updated_at
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Anomaly not found' }, { status: 404 });
    }

    return NextResponse.json({ anomaly: result[0] });
  } catch (error) {
    console.error('Error updating anomaly:', error);
    return NextResponse.json({ error: 'Failed to update anomaly' }, { status: 500 });
  }
}

// DELETE - Delete an anomaly
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const anomalyId = parseInt(id);

    if (isNaN(anomalyId)) {
      return NextResponse.json({ error: 'Invalid anomaly ID' }, { status: 400 });
    }

    const result = await sql`
      DELETE FROM anomalies
      WHERE id = ${anomalyId}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Anomaly not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting anomaly:', error);
    return NextResponse.json({ error: 'Failed to delete anomaly' }, { status: 500 });
  }
}
