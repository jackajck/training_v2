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

    // Get all employees with the specified leader, including positions
    const team = await sql`
      SELECT
        e.employee_id,
        e.badge_id,
        e.employee_name,
        e.is_active,
        e.leader,
        e.role,
        e.created_at,
        STRING_AGG(p.position_name, ', ' ORDER BY p.position_name) as positions,
        STRING_AGG(p.position_id, ', ' ORDER BY p.position_id) as position_ids
      FROM employees e
      LEFT JOIN employee_positions ep ON e.employee_id = ep.employee_id
      LEFT JOIN positions p ON ep.position_id = p.position_id
      WHERE e.leader = ${leader}
        AND e.is_active = true
      GROUP BY e.employee_id, e.badge_id, e.employee_name, e.is_active, e.leader, e.role, e.created_at
      ORDER BY e.employee_name ASC
    `;

    // For each employee, get their training stats
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    // Helper to check if a course is a Q course
    const isQCourse = (courseName: string) => {
      return courseName && (courseName.includes('QOP') || courseName.includes('QCD'));
    };

    const teamWithStats = await Promise.all(
      team.map(async (employee) => {
        // Get all training records for this employee
        // Includes Q course assignment info to filter out "not needed" Q courses
        const training = await sql`
          WITH course_requirements AS (
            SELECT DISTINCT
              erc.employee_id,
              erc.course_id,
              erc.course_name,
              erc.duration_months
            FROM employee_required_courses erc
            WHERE erc.employee_id = ${employee.employee_id}
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

        // Filter out Q courses that are marked as "not needed"
        const neededTraining = (training as { course_name: string; q_is_needed: boolean | null; status: string; expiration_date: string | null }[]).filter((t) => {
          if (!isQCourse(t.course_name)) return true;
          return t.q_is_needed === true;
        });

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

        return {
          ...employee,
          expiredCount,
          expiring30Count,
          expiring90Count
        };
      })
    );

    return NextResponse.json({
      success: true,
      team: teamWithStats,
      count: teamWithStats.length
    });

  } catch (error) {
    console.error('Error fetching team members with stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team members with stats' },
      { status: 500 }
    );
  }
}
