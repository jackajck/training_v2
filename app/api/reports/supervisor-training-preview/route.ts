import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

interface TrainingRecord {
  course_name: string;
  position_name: string;
  status: string;
  completion_date: string | null;
  expiration_date: string | null;
}

interface EmployeeData {
  supervisor_name: string;
  employee_name: string;
  badge_id: string | null;
  positions: string[] | null;
  training_records: TrainingRecord[] | null;
}

export async function GET(request: Request) {
  try {
    // Check authentication
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth');

    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Get badge_id from query params
    const { searchParams } = new URL(request.url);
    const badgeId = searchParams.get('badge_id') || '40081749';

    // Query to get specific employee's data
    const data = await sql`
      WITH employee_supervisor AS (
        SELECT DISTINCT
          e.employee_id,
          e.employee_name,
          e.badge_id,
          COALESCE(e.leader, 'No Supervisor Assigned') as supervisor_name
        FROM employees e
        WHERE e.is_active = true
          AND e.badge_id = ${badgeId}
        ORDER BY supervisor_name, e.employee_name
      ),
      employee_positions_data AS (
        SELECT
          e.employee_id,
          array_agg(DISTINCT p.position_name) as positions
        FROM employees e
        LEFT JOIN employee_positions ep ON e.employee_id = ep.employee_id
        LEFT JOIN positions p ON ep.position_id = p.position_id AND p.is_active = true
        WHERE e.is_active = true
          AND e.badge_id = ${badgeId}
        GROUP BY e.employee_id
      ),
      training_requirements AS (
        SELECT
          erc.employee_id,
          erc.course_id,
          erc.course_name,
          erc.position_name,
          et.completion_date,
          et.expiration_date,
          CASE
            WHEN et.completion_date IS NULL THEN 'MISSING'
            WHEN et.expiration_date IS NULL THEN 'CURRENT'
            WHEN et.expiration_date < NOW() THEN 'EXPIRED'
            ELSE 'CURRENT'
          END as status
        FROM (
          SELECT DISTINCT
            e.employee_id,
            p.position_name,
            c.course_id,
            c.course_name,
            c.duration_months
          FROM employees e
          JOIN employee_positions ep ON e.employee_id = ep.employee_id
          JOIN positions p ON ep.position_id = p.position_id
          JOIN position_courses pc ON p.position_id = pc.position_id
          JOIN courses c ON pc.course_id = c.course_id
          WHERE e.is_active = true
            AND p.is_active = true
            AND c.is_active = true
            AND e.badge_id = ${badgeId}
        ) erc
        LEFT JOIN employee_training et ON
          erc.employee_id = et.employee_id AND
          erc.course_id = et.course_id AND
          et.completion_date = (
            SELECT MAX(completion_date)
            FROM employee_training
            WHERE employee_id = erc.employee_id AND course_id = erc.course_id
          )
      )
      SELECT
        es.supervisor_name,
        es.employee_name,
        es.badge_id,
        epd.positions,
        json_agg(
          json_build_object(
            'course_name', tr.course_name,
            'position_name', tr.position_name,
            'status', tr.status,
            'completion_date', tr.completion_date,
            'expiration_date', tr.expiration_date
          )
        ) FILTER (WHERE tr.course_name IS NOT NULL) as training_records
      FROM employee_supervisor es
      LEFT JOIN employee_positions_data epd ON es.employee_id = epd.employee_id
      LEFT JOIN training_requirements tr ON es.employee_id = tr.employee_id
      GROUP BY es.supervisor_name, es.employee_name, es.badge_id, epd.positions
      ORDER BY es.supervisor_name, es.employee_name
    `;

    // Transform data for UI display
    const previewData = (data as EmployeeData[]).flatMap((employee) => {
      const positions = employee.positions ? employee.positions.join(', ') : 'No positions assigned';

      if (!employee.training_records || employee.training_records.length === 0) {
        return [{
          supervisor: employee.supervisor_name,
          employeeName: employee.employee_name,
          badgeId: employee.badge_id || '',
          positions: positions,
          courseName: 'No training requirements',
          positionRequirement: '',
          status: 'N/A',
          completionDate: '',
          expirationDate: ''
        }];
      }

      return employee.training_records.map((training) => ({
        supervisor: employee.supervisor_name,
        employeeName: employee.employee_name,
        badgeId: employee.badge_id || '',
        positions: positions,
        courseName: training.course_name,
        positionRequirement: training.position_name,
        status: training.status === 'CURRENT' ? 'Up to date' :
                training.status === 'EXPIRED' ? 'Expired' : 'Missing',
        completionDate: training.completion_date ?
          new Date(training.completion_date).toLocaleDateString() : '',
        expirationDate: training.expiration_date ?
          new Date(training.expiration_date).toLocaleDateString() : 'No expiration'
      }));
    });

    return NextResponse.json({
      success: true,
      data: previewData,
      count: previewData.length,
      badgeId: badgeId
    });

  } catch (error) {
    console.error('Error generating preview:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
