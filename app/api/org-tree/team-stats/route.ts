import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const leader = searchParams.get('leader');

    if (!leader) {
      return NextResponse.json(
        { error: 'Leader parameter is required' },
        { status: 400 }
      );
    }

    // Get total team members
    const teamCount = await sql`
      SELECT COUNT(*) as count
      FROM employees
      WHERE leader = ${leader}
        AND is_active = true
    `;

    const totalMembers = parseInt(teamCount[0].count) || 0;

    // Get all training records for employees under this leader
    // Includes Q course assignment info to filter out "not needed" Q courses
    const allTraining = await sql`
      WITH team_members AS (
        SELECT employee_id
        FROM employees
        WHERE leader = ${leader}
          AND is_active = true
      ),
      course_requirements AS (
        SELECT DISTINCT
          erc.employee_id,
          erc.course_id,
          erc.course_name,
          erc.duration_months
        FROM employee_required_courses erc
        JOIN team_members tm ON erc.employee_id = tm.employee_id
      )
      SELECT
        cr.employee_id,
        cr.course_id,
        cr.course_name,
        et.expiration_date,
        et.training_id,
        eqc.is_needed as q_is_needed,
        CASE
            WHEN et.training_id IS NULL THEN 'Never Completed'
            WHEN et.expiration_date IS NULL THEN 'Completed (No Expiration)'
            WHEN et.expiration_date < CURRENT_DATE THEN 'Expired'
            ELSE 'Valid'
        END as status
      FROM course_requirements cr
      LEFT JOIN LATERAL (
          SELECT employee_id, course_id, expiration_date, training_id
          FROM employee_training et2
          WHERE et2.employee_id = cr.employee_id
            AND et2.course_id = cr.course_id
          ORDER BY completion_date DESC
          LIMIT 1
      ) et ON true
      LEFT JOIN employee_q_courses eqc ON cr.employee_id = eqc.employee_id AND cr.course_id = eqc.course_id
    `;

    // Helper to check if a course is a Q course
    const isQCourse = (courseName: string) => {
      return courseName && (courseName.includes('QOP') || courseName.includes('QCD'));
    };

    // Filter out Q courses that are marked as "not needed"
    // Q courses default to NOT needed (is_needed must be true to count)
    const neededTraining = (allTraining as { course_name: string; q_is_needed: boolean | null; status: string; expiration_date: string | null }[]).filter((t) => {
      if (!isQCourse(t.course_name)) return true; // Non-Q courses always count
      return t.q_is_needed === true; // Q courses only count if explicitly marked as needed
    });

    // Calculate stats
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    const expiredCount = neededTraining.filter((t) =>
      t.status === 'Expired' || t.status === 'Never Completed'
    ).length;

    const expiring30Count = neededTraining.filter((t) => {
      if (!t.expiration_date || t.status === 'Expired' || t.status === 'Never Completed') return false;
      const expDate = new Date(t.expiration_date);
      return expDate > now && expDate <= thirtyDaysFromNow;
    }).length;

    const expiring90Count = neededTraining.filter((t) => {
      if (!t.expiration_date || t.status === 'Expired' || t.status === 'Never Completed') return false;
      const expDate = new Date(t.expiration_date);
      return expDate > thirtyDaysFromNow && expDate <= ninetyDaysFromNow;
    }).length;

    return NextResponse.json({
      success: true,
      totalMembers,
      expiredCount,
      expiring30Count,
      expiring90Count
    });

  } catch (error) {
    console.error('Error fetching team stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team stats' },
      { status: 500 }
    );
  }
}
