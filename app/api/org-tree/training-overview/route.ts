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

    // Get all training records for employees under this leader
    // This query gets all required courses with their completion status
    const allTraining = await sql`
      WITH team_members AS (
        SELECT employee_id, employee_name, badge_id
        FROM employees
        WHERE leader = ${leader}
          AND is_active = true
      ),
      course_requirements AS (
        SELECT DISTINCT
          erc.employee_id,
          tm.employee_name,
          tm.badge_id,
          erc.course_id,
          erc.course_name,
          erc.duration_months,
          STRING_AGG(DISTINCT erc.position_name, ', ' ORDER BY erc.position_name) as position_name
        FROM employee_required_courses erc
        JOIN team_members tm ON erc.employee_id = tm.employee_id
        GROUP BY erc.employee_id, tm.employee_name, tm.badge_id, erc.course_id, erc.course_name, erc.duration_months
      )
      SELECT
        cr.employee_id,
        cr.employee_name,
        cr.badge_id,
        cr.course_id,
        cr.course_name,
        cr.duration_months,
        cr.position_name,
        et.completion_date,
        et.expiration_date,
        et.training_id,
        et.notes,
        CASE
            WHEN et.training_id IS NULL THEN 'Never Completed'
            WHEN et.expiration_date IS NULL THEN 'Completed (No Expiration)'
            WHEN et.expiration_date < CURRENT_DATE THEN 'Expired'
            ELSE 'Valid'
        END as status
      FROM course_requirements cr
      LEFT JOIN LATERAL (
          SELECT employee_id, course_id, completion_date, expiration_date, training_id, notes
          FROM employee_training et2
          WHERE et2.employee_id = cr.employee_id
            AND et2.course_id = cr.course_id
          ORDER BY completion_date DESC
          LIMIT 1
      ) et ON true
      ORDER BY
          CASE
              WHEN et.training_id IS NULL THEN 1
              WHEN et.expiration_date < CURRENT_DATE THEN 2
              WHEN et.expiration_date IS NULL THEN 4
              ELSE 3
          END,
          cr.employee_name,
          cr.course_name
    `;

    // Filter into categories
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    const expired = allTraining.filter(t =>
      t.status === 'Expired' || t.status === 'Never Completed'
    );

    const expiring30 = allTraining.filter(t => {
      if (!t.expiration_date || t.status === 'Expired' || t.status === 'Never Completed') return false;
      const expDate = new Date(t.expiration_date);
      return expDate > now && expDate <= thirtyDaysFromNow;
    });

    const expiring90 = allTraining.filter(t => {
      if (!t.expiration_date || t.status === 'Expired' || t.status === 'Never Completed') return false;
      const expDate = new Date(t.expiration_date);
      return expDate > thirtyDaysFromNow && expDate <= ninetyDaysFromNow;
    });

    return NextResponse.json({
      success: true,
      expired: expired,
      expiring30: expiring30,
      expiring90: expiring90,
      total: allTraining.length
    });

  } catch (error) {
    console.error('Error fetching training overview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch training overview' },
      { status: 500 }
    );
  }
}
