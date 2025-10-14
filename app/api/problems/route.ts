import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    // 1. Employees with most expired certificates (top 50) - ACTIVE ONLY
    const employeesWithExpired = await sql`
      SELECT
        e.employee_id,
        e.badge_id,
        e.employee_name,
        e.is_active,
        COUNT(CASE WHEN ets.status = 'EXPIRED' THEN 1 END)::integer as expired_count,
        COUNT(CASE WHEN ets.status = 'NOT_COMPLETED' THEN 1 END)::integer as missing_count,
        COUNT(CASE WHEN ets.status IN ('CURRENT', 'COMPLETED', 'EXPIRING_SOON') THEN 1 END)::integer as valid_count,
        COUNT(*)::integer as total_required,
        STRING_AGG(DISTINCT ets.position_name, ', ' ORDER BY ets.position_name) as positions
      FROM employees e
      JOIN employee_training_status ets ON e.employee_id = ets.employee_id
      WHERE e.is_active = true
      GROUP BY e.employee_id, e.badge_id, e.employee_name, e.is_active
      HAVING COUNT(CASE WHEN ets.status = 'EXPIRED' THEN 1 END) > 0
      ORDER BY expired_count DESC, missing_count DESC
      LIMIT 50
    `;

    // 2. Employees with NO positions assigned - ACTIVE ONLY
    const employeesNoPositions = await sql`
      SELECT
        e.employee_id,
        e.badge_id,
        e.employee_name,
        e.is_active,
        e.created_at
      FROM employees e
      LEFT JOIN employee_positions ep ON e.employee_id = ep.employee_id
      WHERE ep.position_id IS NULL
        AND e.is_active = true
      ORDER BY e.created_at DESC
      LIMIT 100
    `;

    // 3. Positions where most ACTIVE employees have expired training
    const problematicPositions = await sql`
      SELECT
        p.position_id,
        p.position_name,
        p.is_active,
        COUNT(DISTINCT ep.employee_id)::integer as total_employees,
        COUNT(DISTINCT CASE WHEN ets.status = 'EXPIRED' THEN ets.employee_id END)::integer as employees_with_expired,
        COUNT(DISTINCT CASE WHEN ets.status = 'NOT_COMPLETED' THEN ets.employee_id END)::integer as employees_missing,
        ROUND(
          100.0 * COUNT(DISTINCT CASE WHEN ets.status = 'EXPIRED' THEN ets.employee_id END) /
          NULLIF(COUNT(DISTINCT ep.employee_id), 0),
          1
        ) as percent_expired
      FROM positions p
      JOIN employee_positions ep ON p.position_id = ep.position_id
      JOIN employees e ON ep.employee_id = e.employee_id
      JOIN employee_training_status ets ON e.employee_id = ets.employee_id
        AND ets.position_name = p.position_name
      WHERE e.is_active = true
      GROUP BY p.position_id, p.position_name, p.is_active
      HAVING COUNT(DISTINCT ep.employee_id) > 0
        AND COUNT(DISTINCT CASE WHEN ets.status = 'EXPIRED' THEN ets.employee_id END) > 0
      ORDER BY percent_expired DESC, employees_with_expired DESC
      LIMIT 30
    `;

    // 4. Courses that are frequently expired for ACTIVE employees (might indicate incorrect duration)
    const problematicCourses = await sql`
      SELECT
        c.course_id,
        c.course_name,
        c.duration_months,
        c.is_active,
        COUNT(*)::integer as total_completions,
        COUNT(CASE WHEN ets.expiration_date < CURRENT_TIMESTAMP THEN 1 END)::integer as expired_count,
        COUNT(CASE WHEN ets.expiration_date IS NULL THEN 1 END)::integer as no_expiration_count,
        ROUND(
          100.0 * COUNT(CASE WHEN ets.expiration_date < CURRENT_TIMESTAMP THEN 1 END) /
          NULLIF(COUNT(*), 0),
          1
        ) as percent_expired
      FROM courses c
      JOIN employee_training_status ets ON c.course_name = ets.course_name
      JOIN employees e ON ets.employee_id = e.employee_id
      WHERE e.is_active = true
      GROUP BY c.course_id, c.course_name, c.duration_months, c.is_active
      HAVING COUNT(CASE WHEN ets.expiration_date < CURRENT_TIMESTAMP THEN 1 END) > 5
      ORDER BY percent_expired DESC, expired_count DESC
      LIMIT 30
    `;

    return NextResponse.json({
      success: true,
      data: {
        employeesWithExpired,
        employeesNoPositions,
        problematicPositions,
        problematicCourses
      }
    });

  } catch (error) {
    console.error('Error fetching problems:', error);
    return NextResponse.json(
      { error: 'Failed to fetch problems' },
      { status: 500 }
    );
  }
}
