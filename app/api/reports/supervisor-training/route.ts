import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import ExcelJS from 'exceljs';

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

export async function GET() {
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
    // Query to get all active employees with their supervisors, positions, and training status
    const data = await sql`
      WITH employee_supervisor AS (
        SELECT DISTINCT
          e.employee_id,
          e.employee_name,
          e.badge_id,
          COALESCE(e.leader, 'No Supervisor Assigned') as supervisor_name
        FROM employees e
        WHERE e.is_active = true
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
          WHERE e.is_active = true AND p.is_active = true AND c.is_active = true
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

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Training Status by Supervisor');

    // Define colors
    const colors = {
      header: 'FF1F4788', // Dark blue
      current: 'FF22C55E', // Green - Up to date
      expired: 'FFFFA500', // Orange - Expired
      missing: 'FFEF4444' // Red - Missing
    };

    // Add header row
    const headerRow = worksheet.addRow([
      'Supervisor',
      'Employee Name',
      'Badge ID',
      'Positions',
      'Course Name',
      'Position Requirement',
      'Status',
      'Completion Date',
      'Expiration Date'
    ]);

    // Style header
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.header }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Set column widths
    worksheet.columns = [
      { width: 25 }, // Supervisor
      { width: 25 }, // Employee Name
      { width: 12 }, // Badge ID
      { width: 30 }, // Positions
      { width: 35 }, // Course Name
      { width: 30 }, // Position Requirement
      { width: 15 }, // Status
      { width: 15 }, // Completion Date
      { width: 15 }  // Expiration Date
    ];

    // Group data by supervisor
    const groupedData: Record<string, EmployeeData[]> = {};
    (data as EmployeeData[]).forEach((row) => {
      if (!groupedData[row.supervisor_name]) {
        groupedData[row.supervisor_name] = [];
      }
      groupedData[row.supervisor_name].push(row);
    });

    // Add data rows
    Object.entries(groupedData).forEach(([supervisor, employees]) => {
      employees.forEach((employee, empIndex: number) => {
        const positions = employee.positions ? employee.positions.join(', ') : 'No positions assigned';

        if (!employee.training_records || employee.training_records.length === 0) {
          // Employee has no training requirements
          const row = worksheet.addRow([
            supervisor, // Fill supervisor on every row for filtering
            employee.employee_name,
            employee.badge_id || '',
            positions,
            'No training requirements',
            '',
            'N/A',
            '',
            ''
          ]);

          row.alignment = { vertical: 'top' };
        } else {
          // Employee has training requirements
          employee.training_records!.forEach((training, trainingIndex: number) => {
            const statusText = training.status === 'CURRENT' ? 'Up to date' :
                             training.status === 'EXPIRED' ? 'Expired' :
                             'Missing';

            const completionDate = training.completion_date ?
              new Date(training.completion_date).toLocaleDateString() : '';
            const expirationDate = training.expiration_date ?
              new Date(training.expiration_date).toLocaleDateString() : 'No expiration';

            const row = worksheet.addRow([
              supervisor, // Fill supervisor on every row for filtering
              employee.employee_name, // Fill employee name on every row for filtering
              employee.badge_id || '', // Fill badge ID on every row for filtering
              positions, // Fill positions on every row for filtering
              training.course_name,
              training.position_name,
              statusText,
              completionDate,
              expirationDate
            ]);

            // Apply color coding based on status
            let fillColor: string;
            switch (training.status) {
              case 'CURRENT':
                fillColor = colors.current;
                break;
              case 'EXPIRED':
                fillColor = colors.expired;
                break;
              case 'MISSING':
                fillColor = colors.missing;
                break;
              default:
                fillColor = 'FFFFFFFF';
            }

            // Apply fill color to status cell
            const statusCell = row.getCell(7);
            statusCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: fillColor }
            };
            statusCell.font = {
              color: { argb: 'FFFFFFFF' },
              bold: true
            };
            statusCell.alignment = { horizontal: 'center', vertical: 'middle' };

            row.alignment = { vertical: 'top' };
          });
        }
      });
    });

    // Add borders to all cells
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Add legend at the bottom
    worksheet.addRow([]);
    worksheet.addRow(['Legend:', '', '', '', '', '', '', '', '']);

    const legendRows = [
      ['', 'Green (Up to date)', 'Training is current and not expired'],
      ['', 'Orange (Expired)', 'Training has expired'],
      ['', 'Red (Missing)', 'Training has not been completed']
    ];

    legendRows.forEach((legendRow, index) => {
      const row = worksheet.addRow(legendRow);
      const colorCell = row.getCell(2);

      let legendColor: string;
      if (index === 0) legendColor = colors.current;
      else if (index === 1) legendColor = colors.expired;
      else legendColor = colors.missing;

      colorCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: legendColor }
      };
      colorCell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true
      };
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="training-status-by-supervisor-${new Date().toISOString().split('T')[0]}.xlsx"`
      }
    });

  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
