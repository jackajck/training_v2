import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// GET - fetch Q course assignments for an employee
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employee_id');

  if (!employeeId) {
    return NextResponse.json({ error: 'employee_id required' }, { status: 400 });
  }

  try {
    const assignments = await sql`
      SELECT course_id, is_needed
      FROM employee_q_courses
      WHERE employee_id = ${employeeId}
    `;

    // Return as a map for easy lookup
    const assignmentMap: Record<string, boolean> = {};
    (assignments as { course_id: string; is_needed: boolean }[]).forEach((a) => {
      assignmentMap[a.course_id] = a.is_needed;
    });

    return NextResponse.json({ data: assignmentMap });
  } catch (error) {
    console.error('Error fetching Q course assignments:', error);
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 });
  }
}

// POST - toggle Q course assignment for an employee
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employee_id, course_id, is_needed } = body;

    if (!employee_id || !course_id || typeof is_needed !== 'boolean') {
      return NextResponse.json(
        { error: 'employee_id, course_id, and is_needed (boolean) required' },
        { status: 400 }
      );
    }

    // Upsert - insert or update
    await sql`
      INSERT INTO employee_q_courses (employee_id, course_id, is_needed, updated_at)
      VALUES (${employee_id}, ${course_id}, ${is_needed}, NOW())
      ON CONFLICT (employee_id, course_id)
      DO UPDATE SET is_needed = ${is_needed}, updated_at = NOW()
    `;

    return NextResponse.json({
      success: true,
      message: `Course ${course_id} marked as ${is_needed ? 'needed' : 'not needed'}`
    });
  } catch (error) {
    console.error('Error toggling Q course:', error);
    return NextResponse.json({ error: 'Failed to toggle Q course' }, { status: 500 });
  }
}
