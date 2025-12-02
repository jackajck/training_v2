import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'expired';
    const countOnly = searchParams.get('countOnly') === 'true';
    const download = searchParams.get('download') === 'true';

    // Validate period
    if (!['expired', '7days', '30days', '90days'].includes(period)) {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
    }

    if (countOnly) {
      // Count query with course group logic
      const countResult = await sql`
        WITH expiring_training AS (
          SELECT
            et.training_id,
            et.employee_id,
            et.course_id,
            et.expiration_date
          FROM employee_training et
          JOIN employees e ON et.employee_id = e.employee_id
          JOIN courses c ON et.course_id = c.course_id
          WHERE et.expiration_date IS NOT NULL
            AND e.is_active = TRUE
            AND c.is_active = TRUE
            AND EXISTS (
              SELECT 1 FROM employee_required_courses erc
              WHERE erc.employee_id = e.employee_id
                AND erc.course_id = et.course_id
            )
        ),
        -- For each expiring training, check if employee has valid training in same enabled group
        covered_by_group AS (
          SELECT DISTINCT ext.training_id
          FROM expiring_training ext
          -- Find if this course belongs to an enabled group
          JOIN course_group_members cgm ON ext.course_id = cgm.course_id
          JOIN course_groups cg ON cgm.group_id = cg.group_id AND cg.is_enabled = true
          -- Find if employee has ANY valid (non-expired) training in same group
          WHERE EXISTS (
            SELECT 1
            FROM employee_training et2
            JOIN course_group_members cgm2 ON et2.course_id = cgm2.course_id
            WHERE et2.employee_id = ext.employee_id
              AND cgm2.group_id = cg.group_id
              AND (et2.expiration_date IS NULL OR et2.expiration_date >= CURRENT_DATE)
          )
        )
        SELECT COUNT(DISTINCT et.training_id) as count
        FROM employee_training et
        JOIN employees e ON et.employee_id = e.employee_id
        JOIN courses c ON et.course_id = c.course_id
        WHERE et.expiration_date IS NOT NULL
          AND ${period === 'expired'
            ? sql`et.expiration_date < CURRENT_DATE`
            : period === '7days'
            ? sql`et.expiration_date >= CURRENT_DATE AND et.expiration_date <= CURRENT_DATE + INTERVAL '7 days'`
            : period === '30days'
            ? sql`et.expiration_date >= CURRENT_DATE AND et.expiration_date <= CURRENT_DATE + INTERVAL '30 days'`
            : sql`et.expiration_date >= CURRENT_DATE AND et.expiration_date <= CURRENT_DATE + INTERVAL '90 days'`
          }
          AND e.is_active = TRUE
          AND c.is_active = TRUE
          AND EXISTS (
            SELECT 1 FROM employee_required_courses erc
            WHERE erc.employee_id = e.employee_id
              AND erc.course_id = et.course_id
          )
          -- Exclude if covered by another valid course in the same enabled group
          AND et.training_id NOT IN (SELECT training_id FROM covered_by_group)
      `;
      return NextResponse.json({
        success: true,
        count: parseInt(countResult[0].count)
      });
    }

    // Full data query with course group logic
    const results = await sql`
      WITH expiring_training AS (
        SELECT
          et.training_id,
          et.employee_id,
          et.course_id,
          et.expiration_date
        FROM employee_training et
        JOIN employees e ON et.employee_id = e.employee_id
        JOIN courses c ON et.course_id = c.course_id
        WHERE et.expiration_date IS NOT NULL
          AND e.is_active = TRUE
          AND c.is_active = TRUE
          AND EXISTS (
            SELECT 1 FROM employee_required_courses erc
            WHERE erc.employee_id = e.employee_id
              AND erc.course_id = et.course_id
          )
      ),
      -- For each expiring training, check if employee has valid training in same enabled group
      covered_by_group AS (
        SELECT DISTINCT ext.training_id
        FROM expiring_training ext
        -- Find if this course belongs to an enabled group
        JOIN course_group_members cgm ON ext.course_id = cgm.course_id
        JOIN course_groups cg ON cgm.group_id = cg.group_id AND cg.is_enabled = true
        -- Find if employee has ANY valid (non-expired) training in same group
        WHERE EXISTS (
          SELECT 1
          FROM employee_training et2
          JOIN course_group_members cgm2 ON et2.course_id = cgm2.course_id
          WHERE et2.employee_id = ext.employee_id
            AND cgm2.group_id = cg.group_id
            AND (et2.expiration_date IS NULL OR et2.expiration_date >= CURRENT_DATE)
        )
      )
      SELECT
        et.training_id,
        e.badge_id,
        e.employee_name,
        et.course_id,
        c.course_name,
        et.completion_date,
        et.expiration_date,
        STRING_AGG(DISTINCT p.position_name, ', ') as positions
      FROM employee_training et
      JOIN employees e ON et.employee_id = e.employee_id
      JOIN courses c ON et.course_id = c.course_id
      LEFT JOIN employee_positions ep ON e.employee_id = ep.employee_id
      LEFT JOIN positions p ON ep.position_id = p.position_id
      WHERE et.expiration_date IS NOT NULL
        AND ${period === 'expired'
          ? sql`et.expiration_date < CURRENT_DATE`
          : period === '7days'
          ? sql`et.expiration_date >= CURRENT_DATE AND et.expiration_date <= CURRENT_DATE + INTERVAL '7 days'`
          : period === '30days'
          ? sql`et.expiration_date >= CURRENT_DATE AND et.expiration_date <= CURRENT_DATE + INTERVAL '30 days'`
          : sql`et.expiration_date >= CURRENT_DATE AND et.expiration_date <= CURRENT_DATE + INTERVAL '90 days'`
        }
        AND e.is_active = TRUE
        AND c.is_active = TRUE
        AND EXISTS (
          SELECT 1 FROM employee_required_courses erc
          WHERE erc.employee_id = e.employee_id
            AND erc.course_id = et.course_id
        )
        -- Exclude if covered by another valid course in the same enabled group
        AND et.training_id NOT IN (SELECT training_id FROM covered_by_group)
      GROUP BY et.training_id, e.badge_id, e.employee_name, et.course_id, c.course_name, et.completion_date, et.expiration_date
      ORDER BY et.expiration_date ASC
      ${download ? sql`` : sql`LIMIT 100`}
    `;

    return NextResponse.json({
      success: true,
      data: results,
      count: results.length
    });

  } catch (error) {
    console.error('Error fetching expiring training:', error);
    return NextResponse.json(
      { error: 'Failed to fetch training data' },
      { status: 500 }
    );
  }
}
