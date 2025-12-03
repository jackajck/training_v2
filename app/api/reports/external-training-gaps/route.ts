import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import ExcelJS from 'exceljs';

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

    // Get all external training records
    const externalRows = await sql`
      SELECT associate_name, requirement, course_id, status, expire_date
      FROM external_training
      ORDER BY associate_name, requirement
    ` as { associate_name: string; requirement: string; course_id: string | null; status: string; expire_date: string }[];

    // Get all employees
    const employees = await sql`
      SELECT employee_id, employee_name, is_active
      FROM employees
    ` as { employee_id: number; employee_name: string; is_active: boolean }[];

    const employeeMap = new Map<string, { employee_id: number; is_active: boolean }>();
    employees.forEach(emp => {
      employeeMap.set(emp.employee_name.toLowerCase(), {
        employee_id: emp.employee_id,
        is_active: emp.is_active
      });
    });

    // Get all courses
    const courses = await sql`
      SELECT course_id, course_name
      FROM courses
    ` as { course_id: string; course_name: string }[];

    const courseSet = new Set<string>();
    const courseNameMap = new Map<string, string>();
    courses.forEach(c => {
      courseSet.add(c.course_id);
      courseNameMap.set(c.course_id, c.course_name);
    });

    // Get all training records with expiration
    const trainingRecords = await sql`
      SELECT et.employee_id, et.course_id, et.expiration_date
      FROM employee_training et
    ` as { employee_id: number; course_id: string; expiration_date: string | null }[];

    // Create a map of employee_id|course_id -> expiration for quick lookup
    const trainingMap = new Map<string, string | null>();
    trainingRecords.forEach(tr => {
      trainingMap.set(`${tr.employee_id}|${tr.course_id}`, tr.expiration_date);
    });

    // Get course groups for group matching
    const courseGroups = await sql`
      SELECT cg.group_id, cg.group_code, cgm.course_id
      FROM course_groups cg
      JOIN course_group_members cgm ON cg.group_id = cgm.group_id
      WHERE cg.is_enabled = true
    ` as { group_id: number; group_code: string; course_id: string }[];

    const courseToGroup = new Map<string, { groupId: number; groupCode: string }>();
    const groupToCourses = new Map<number, Set<string>>();
    courseGroups.forEach(cg => {
      courseToGroup.set(cg.course_id, { groupId: cg.group_id, groupCode: cg.group_code });
      if (!groupToCourses.has(cg.group_id)) {
        groupToCourses.set(cg.group_id, new Set());
      }
      groupToCourses.get(cg.group_id)!.add(cg.course_id);
    });

    // Process all records
    interface ResultRow {
      employeeName: string;
      isActive: boolean | null; // null if employee not in our DB
      courseId: string | null;
      courseName: string;
      externalStatus: string;
      externalExpiration: string;
      matchType: 'Exact' | 'Group' | 'Not Found' | 'Employee Not in DB' | 'Course Not in DB';
      groupCode?: string;
      matchedCourseId?: string;
      dbExpiration?: string;
    }

    const results: ResultRow[] = [];

    for (const row of externalRows) {
      const empLower = row.associate_name.toLowerCase();
      const employee = employeeMap.get(empLower);

      // Employee not in our DB
      if (!employee) {
        results.push({
          employeeName: row.associate_name,
          isActive: null,
          courseId: row.course_id,
          courseName: row.requirement,
          externalStatus: row.status,
          externalExpiration: row.expire_date,
          matchType: 'Employee Not in DB'
        });
        continue;
      }

      // No course ID in external data
      if (!row.course_id) {
        results.push({
          employeeName: row.associate_name,
          isActive: employee.is_active,
          courseId: null,
          courseName: row.requirement,
          externalStatus: row.status,
          externalExpiration: row.expire_date,
          matchType: 'Not Found'
        });
        continue;
      }

      // Course doesn't exist in our DB
      if (!courseSet.has(row.course_id)) {
        results.push({
          employeeName: row.associate_name,
          isActive: employee.is_active,
          courseId: row.course_id,
          courseName: row.requirement,
          externalStatus: row.status,
          externalExpiration: row.expire_date,
          matchType: 'Course Not in DB'
        });
        continue;
      }

      // Check for exact match
      const exactKey = `${employee.employee_id}|${row.course_id}`;
      if (trainingMap.has(exactKey)) {
        const expDate = trainingMap.get(exactKey);
        results.push({
          employeeName: row.associate_name,
          isActive: employee.is_active,
          courseId: row.course_id,
          courseName: row.requirement,
          externalStatus: row.status,
          externalExpiration: row.expire_date,
          matchType: 'Exact',
          dbExpiration: expDate ? new Date(expDate).toLocaleDateString() : 'No expiration'
        });
        continue;
      }

      // Check for group match
      const groupInfo = courseToGroup.get(row.course_id);
      if (groupInfo) {
        const groupCourses = groupToCourses.get(groupInfo.groupId);
        if (groupCourses) {
          let foundMatch = false;
          for (const gc of groupCourses) {
            const groupKey = `${employee.employee_id}|${gc}`;
            if (trainingMap.has(groupKey)) {
              const expDate = trainingMap.get(groupKey);
              results.push({
                employeeName: row.associate_name,
                isActive: employee.is_active,
                courseId: row.course_id,
                courseName: row.requirement,
                externalStatus: row.status,
                externalExpiration: row.expire_date,
                matchType: 'Group',
                groupCode: groupInfo.groupCode,
                matchedCourseId: gc,
                dbExpiration: expDate ? new Date(expDate).toLocaleDateString() : 'No expiration'
              });
              foundMatch = true;
              break;
            }
          }
          if (foundMatch) continue;
        }
      }

      // Not found - course exists but employee doesn't have it
      results.push({
        employeeName: row.associate_name,
        isActive: employee.is_active,
        courseId: row.course_id,
        courseName: row.requirement,
        externalStatus: row.status,
        externalExpiration: row.expire_date,
        matchType: 'Not Found'
      });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('External Training Compare');

    // Define colors
    const colors = {
      header: 'FF1F4788',
      green: 'FF22C55E',
      purple: 'FF9333EA',
      orange: 'FFF97316',
      red: 'FFEF4444',
      gray: 'FF6B7280'
    };

    // Headers
    const headers = [
      'Employee Name',
      'Active',
      'Course ID',
      'Course Name',
      'Match Status',
      'Group Code',
      'Matched Course',
      'External Status',
      'External Expiration',
      'DB Expiration'
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.header }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Column widths
    worksheet.columns = [
      { width: 30 },  // Employee Name
      { width: 10 },  // Active
      { width: 12 },  // Course ID
      { width: 60 },  // Course Name
      { width: 18 },  // Match Status
      { width: 12 },  // Group Code
      { width: 15 },  // Matched Course
      { width: 15 },  // External Status
      { width: 18 },  // External Expiration
      { width: 18 }   // DB Expiration
    ];

    // Add data rows
    for (const r of results) {
      const row = worksheet.addRow([
        r.employeeName,
        r.isActive === null ? 'N/A' : (r.isActive ? 'Yes' : 'No'),
        r.courseId || 'N/A',
        r.courseName,
        r.matchType,
        r.groupCode || '',
        r.matchedCourseId || '',
        r.externalStatus,
        r.externalExpiration,
        r.dbExpiration || ''
      ]);

      // Color the Active column
      const activeCell = row.getCell(2);
      if (r.isActive === true) {
        activeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
        activeCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else if (r.isActive === false) {
        activeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.red } };
        activeCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else {
        activeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.gray } };
        activeCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }
      activeCell.alignment = { horizontal: 'center' };

      // Color the Match Status column
      const matchCell = row.getCell(5);
      let matchColor = colors.gray;
      if (r.matchType === 'Exact') matchColor = colors.green;
      else if (r.matchType === 'Group') matchColor = colors.purple;
      else if (r.matchType === 'Not Found') matchColor = colors.orange;
      else if (r.matchType === 'Course Not in DB' || r.matchType === 'Employee Not in DB') matchColor = colors.red;

      matchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: matchColor } };
      matchCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      matchCell.alignment = { horizontal: 'center' };
    }

    // Add borders
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

    // Enable auto-filter
    worksheet.autoFilter = {
      from: 'A1',
      to: 'J1'
    };

    // Freeze the header row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [{ width: 30 }, { width: 15 }];

    summarySheet.addRow(['External Training Compare Report']);
    summarySheet.getCell('A1').font = { bold: true, size: 16 };
    summarySheet.mergeCells('A1:B1');

    summarySheet.addRow(['Generated:', new Date().toLocaleString()]);
    summarySheet.addRow([]);
    summarySheet.addRow(['Total Records:', results.length]);

    // Count by match type
    const exactCount = results.filter(r => r.matchType === 'Exact').length;
    const groupCount = results.filter(r => r.matchType === 'Group').length;
    const notFoundCount = results.filter(r => r.matchType === 'Not Found').length;
    const courseNotInDbCount = results.filter(r => r.matchType === 'Course Not in DB').length;
    const empNotInDbCount = results.filter(r => r.matchType === 'Employee Not in DB').length;

    summarySheet.addRow([]);
    summarySheet.addRow(['Match Type Breakdown:']);
    summarySheet.getCell('A6').font = { bold: true };

    const exactRow = summarySheet.addRow(['Exact Match (Green)', exactCount]);
    exactRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
    exactRow.getCell(1).font = { color: { argb: 'FFFFFFFF' } };

    const groupRow = summarySheet.addRow(['Group Match (Purple)', groupCount]);
    groupRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.purple } };
    groupRow.getCell(1).font = { color: { argb: 'FFFFFFFF' } };

    const notFoundRow = summarySheet.addRow(['Not Found (Orange)', notFoundCount]);
    notFoundRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.orange } };
    notFoundRow.getCell(1).font = { color: { argb: 'FFFFFFFF' } };

    const courseNotInDbRow = summarySheet.addRow(['Course Not in DB (Red)', courseNotInDbCount]);
    courseNotInDbRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.red } };
    courseNotInDbRow.getCell(1).font = { color: { argb: 'FFFFFFFF' } };

    const empNotInDbRow = summarySheet.addRow(['Employee Not in DB (Red)', empNotInDbCount]);
    empNotInDbRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.red } };
    empNotInDbRow.getCell(1).font = { color: { argb: 'FFFFFFFF' } };

    summarySheet.addRow([]);
    summarySheet.addRow(['Accounted For (Exact + Group):', exactCount + groupCount]);
    summarySheet.addRow(['Gaps (Not Found):', notFoundCount]);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="external-training-compare-${new Date().toISOString().split('T')[0]}.xlsx"`
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
