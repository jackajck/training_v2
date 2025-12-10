import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// POST - Add a comment to an anomaly
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const anomalyId = parseInt(id);

    if (isNaN(anomalyId)) {
      return NextResponse.json({ error: 'Invalid anomaly ID' }, { status: 400 });
    }

    const { comment } = await request.json();

    if (!comment || comment.trim() === '') {
      return NextResponse.json({ error: 'Comment is required' }, { status: 400 });
    }

    // Check if anomaly exists
    const anomalyExists = await sql`SELECT id FROM anomalies WHERE id = ${anomalyId}`;
    if (anomalyExists.length === 0) {
      return NextResponse.json({ error: 'Anomaly not found' }, { status: 404 });
    }

    const result = await sql`
      INSERT INTO anomaly_comments (anomaly_id, comment)
      VALUES (${anomalyId}, ${comment.trim()})
      RETURNING id, anomaly_id, comment, created_at
    `;

    // Update the anomaly's updated_at timestamp
    await sql`
      UPDATE anomalies
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ${anomalyId}
    `;

    return NextResponse.json({ comment: result[0] });
  } catch (error) {
    console.error('Error adding comment:', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
