import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'expired';
    const countOnly = searchParams.get('countOnly') === 'true';
    const download = searchParams.get('download') === 'true';

    let results;
    let totalCount;

    switch (period) {
      case 'expired':
        if (countOnly) {
          const countResult = await sql`
            SELECT COUNT(DISTINCT et.training_id) as count
            FROM employee_training et
            JOIN employees e ON et.employee_id = e.employee_id
            JOIN courses c ON et.course_id = c.course_id
            -- Only show if course is currently required by their active positions
            WHERE et.expiration_date IS NOT NULL
              AND et.expiration_date < CURRENT_DATE
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
          `;
          return NextResponse.json({
            success: true,
            count: parseInt(countResult[0].count)
          });
        }

        if (download) {
          results = await sql`
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
              AND et.expiration_date < CURRENT_DATE
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              -- Only show if course is currently required by their active positions
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
            GROUP BY et.training_id, e.badge_id, e.employee_name, et.course_id, c.course_name, et.completion_date, et.expiration_date
            ORDER BY et.expiration_date ASC
          `;
        } else {
          results = await sql`
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
              AND et.expiration_date < CURRENT_DATE
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              -- Only show if course is currently required by their active positions
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
            GROUP BY et.training_id, e.badge_id, e.employee_name, et.course_id, c.course_name, et.completion_date, et.expiration_date
            ORDER BY et.expiration_date ASC
            LIMIT 100
          `;
        }
        break;

      case '7days':
        if (countOnly) {
          const countResult = await sql`
            SELECT COUNT(DISTINCT et.training_id) as count
            FROM employee_training et
            JOIN employees e ON et.employee_id = e.employee_id
            JOIN courses c ON et.course_id = c.course_id
            WHERE et.expiration_date IS NOT NULL
              AND et.expiration_date >= CURRENT_DATE
              AND et.expiration_date <= CURRENT_DATE + INTERVAL '7 days'
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
          `;
          return NextResponse.json({
            success: true,
            count: parseInt(countResult[0].count)
          });
        }

        if (download) {
          results = await sql`
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
              AND et.expiration_date >= CURRENT_DATE
              AND et.expiration_date <= CURRENT_DATE + INTERVAL '7 days'
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
            GROUP BY et.training_id, e.badge_id, e.employee_name, et.course_id, c.course_name, et.completion_date, et.expiration_date
            ORDER BY et.expiration_date ASC
          `;
        } else {
          results = await sql`
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
              AND et.expiration_date >= CURRENT_DATE
              AND et.expiration_date <= CURRENT_DATE + INTERVAL '7 days'
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
            GROUP BY et.training_id, e.badge_id, e.employee_name, et.course_id, c.course_name, et.completion_date, et.expiration_date
            ORDER BY et.expiration_date ASC
            LIMIT 100
          `;
        }
        break;

      case '30days':
        if (countOnly) {
          const countResult = await sql`
            SELECT COUNT(DISTINCT et.training_id) as count
            FROM employee_training et
            JOIN employees e ON et.employee_id = e.employee_id
            JOIN courses c ON et.course_id = c.course_id
            WHERE et.expiration_date IS NOT NULL
              AND et.expiration_date >= CURRENT_DATE
              AND et.expiration_date <= CURRENT_DATE + INTERVAL '30 days'
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
          `;
          return NextResponse.json({
            success: true,
            count: parseInt(countResult[0].count)
          });
        }

        if (download) {
          results = await sql`
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
              AND et.expiration_date >= CURRENT_DATE
              AND et.expiration_date <= CURRENT_DATE + INTERVAL '30 days'
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
            GROUP BY et.training_id, e.badge_id, e.employee_name, et.course_id, c.course_name, et.completion_date, et.expiration_date
            ORDER BY et.expiration_date ASC
          `;
        } else {
          results = await sql`
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
              AND et.expiration_date >= CURRENT_DATE
              AND et.expiration_date <= CURRENT_DATE + INTERVAL '30 days'
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
            GROUP BY et.training_id, e.badge_id, e.employee_name, et.course_id, c.course_name, et.completion_date, et.expiration_date
            ORDER BY et.expiration_date ASC
            LIMIT 100
          `;
        }
        break;

      case '90days':
        if (countOnly) {
          const countResult = await sql`
            SELECT COUNT(DISTINCT et.training_id) as count
            FROM employee_training et
            JOIN employees e ON et.employee_id = e.employee_id
            JOIN courses c ON et.course_id = c.course_id
            WHERE et.expiration_date IS NOT NULL
              AND et.expiration_date >= CURRENT_DATE
              AND et.expiration_date <= CURRENT_DATE + INTERVAL '90 days'
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
          `;
          return NextResponse.json({
            success: true,
            count: parseInt(countResult[0].count)
          });
        }

        if (download) {
          results = await sql`
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
              AND et.expiration_date >= CURRENT_DATE
              AND et.expiration_date <= CURRENT_DATE + INTERVAL '90 days'
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
            GROUP BY et.training_id, e.badge_id, e.employee_name, et.course_id, c.course_name, et.completion_date, et.expiration_date
            ORDER BY et.expiration_date ASC
          `;
        } else {
          results = await sql`
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
              AND et.expiration_date >= CURRENT_DATE
              AND et.expiration_date <= CURRENT_DATE + INTERVAL '90 days'
              AND e.is_active = TRUE
              AND c.is_active = TRUE
              AND EXISTS (
                SELECT 1 FROM employee_required_courses erc
                WHERE erc.employee_id = e.employee_id
                  AND erc.course_id = et.course_id
              )
            GROUP BY et.training_id, e.badge_id, e.employee_name, et.course_id, c.course_name, et.completion_date, et.expiration_date
            ORDER BY et.expiration_date ASC
            LIMIT 100
          `;
        }
        break;

      default:
        return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
    }

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
