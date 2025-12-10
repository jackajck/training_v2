import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// PUT - Update a comment
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const anomalyId = parseInt(id);
    const commentIdNum = parseInt(commentId);

    if (isNaN(anomalyId) || isNaN(commentIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const { comment } = await request.json();

    if (!comment || comment.trim() === '') {
      return NextResponse.json({ error: 'Comment is required' }, { status: 400 });
    }

    const result = await sql`
      UPDATE anomaly_comments
      SET comment = ${comment.trim()}
      WHERE id = ${commentIdNum} AND anomaly_id = ${anomalyId}
      RETURNING id, anomaly_id, comment, created_at
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    return NextResponse.json({ comment: result[0] });
  } catch (error) {
    console.error('Error updating comment:', error);
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
  }
}

// DELETE - Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const anomalyId = parseInt(id);
    const commentIdNum = parseInt(commentId);

    if (isNaN(anomalyId) || isNaN(commentIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const result = await sql`
      DELETE FROM anomaly_comments
      WHERE id = ${commentIdNum} AND anomaly_id = ${anomalyId}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }
}
