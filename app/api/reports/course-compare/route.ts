import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import ExcelJS from 'exceljs';

interface EmployeeRecord {
  employee_name: string;
  badge_id: string | null;
  is_active: boolean;
}

interface CourseRecord {
  course_id: string;
  course_name: string;
}

interface TrainingRecord {
  course_id: string;
  completion_date: string | null;
  expiration_date: string | null;
}

// Extract course code prefix like "SPPIVT T111" or "EHSBBPOCCWB"
function extractCourseCode(requirement: string): string | null {
  const match = requirement.match(/^([A-Z]+(?:\s+T?\d+[A-Z]?)?)/i);
  return match ? match[1].trim() : null;
}

// Extract course name without the trailing ID
function extractCourseName(requirement: string): string {
  return requirement.replace(/\(\d+\)$/, '').trim();
}

// Fuzzy match course names (normalize spaces, case-insensitive)
function normalizeCourseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
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

    // Get all external training records from database
    const externalRows = await sql`
      SELECT associate_name, requirement, course_id, status, expire_date
      FROM external_training
      ORDER BY associate_name, requirement
    `;

    // Get all employees from database
    const employees = await sql`
      SELECT employee_name, badge_id, is_active
      FROM employees
    ` as EmployeeRecord[];

    // Create lookup map for employees (case-insensitive)
    const employeeMap = new Map<string, EmployeeRecord>();
    employees.forEach(emp => {
      employeeMap.set(emp.employee_name.toLowerCase(), emp);
    });

    // Get all courses from database
    const courses = await sql`
      SELECT course_id, course_name
      FROM courses
    ` as CourseRecord[];

    // Create lookup maps for courses
    const courseByIdMap = new Map<string, CourseRecord>();
    const courseByNameMap = new Map<string, CourseRecord>();
    const courseByCodeMap = new Map<string, CourseRecord>();
    courses.forEach(course => {
      courseByIdMap.set(course.course_id, course);
      courseByNameMap.set(normalizeCourseName(course.course_name), course);
      const code = extractCourseCode(course.course_name);
      if (code) {
        courseByCodeMap.set(code.toLowerCase(), course);
      }
    });

    // Get all training records
    interface TrainingQueryResult {
      employee_id: number;
      course_id: string;
      completion_date: string | null;
      expiration_date: string | null;
      employee_name: string;
    }

    const trainingRecords = await sql`
      SELECT et.employee_id, et.course_id, et.completion_date, et.expiration_date, e.employee_name
      FROM employee_training et
      JOIN employees e ON et.employee_id = e.employee_id
    ` as TrainingQueryResult[];

    // Create training lookup: employee_name_lower + course_id -> training record
    const trainingMap = new Map<string, TrainingRecord>();
    trainingRecords.forEach((tr) => {
      const key = `${tr.employee_name.toLowerCase()}|${tr.course_id}`;
      const existing = trainingMap.get(key);
      if (!existing || (tr.completion_date && (!existing.completion_date || tr.completion_date > existing.completion_date))) {
        trainingMap.set(key, {
          course_id: tr.course_id,
          completion_date: tr.completion_date,
          expiration_date: tr.expiration_date
        });
      }
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Course Comparison');
    const summarySheet = workbook.addWorksheet('Summary');

    // Define colors
    const colors = {
      header: 'FF1F4788',
      green: 'FF22C55E',
      orange: 'FFFFA500',
      red: 'FFEF4444',
      gray: 'FF6B7280',
      lightGray: 'FFE5E7EB'
    };

    // Add header row
    const headers = [
      'Requirement',
      'Associate',
      'Current Status',
      'Expire Date',
      '', // Blank separator column
      'Employee Active',
      'Found in DB',
      'Course Match',
      'DB Course Name',
      'DB Completion Date',
      'DB Expiration Date',
      'DB Status'
    ];

    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.header }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Set column widths
    worksheet.columns = [
      { width: 60 },  // Requirement
      { width: 25 },  // Associate
      { width: 15 },  // Current Status
      { width: 15 },  // Expire Date
      { width: 3 },   // Blank separator
      { width: 15 },  // Employee Active
      { width: 12 },  // Found in DB
      { width: 15 },  // Course Match
      { width: 60 },  // DB Course Name
      { width: 18 },  // DB Completion Date
      { width: 18 },  // DB Expiration Date
      { width: 12 }   // DB Status
    ];

    // Statistics counters
    let totalRows = 0;
    let coursesMatched = 0;
    let coursesNotMatched = 0;
    let trainingCurrent = 0;
    let trainingExpired = 0;
    let trainingMissing = 0;

    const uniqueEmployees = new Set<string>();
    const notFoundEmployees = new Set<string>();
    const activeEmployees = new Set<string>();
    const inactiveEmployees = new Set<string>();

    // Process each external row
    for (const extRow of externalRows) {
      const row = extRow as { associate_name: string; requirement: string; course_id: string | null; status: string; expire_date: string };
      totalRows++;
      const associateLower = row.associate_name.toLowerCase();
      uniqueEmployees.add(associateLower);

      // Look up employee
      const employee = employeeMap.get(associateLower);
      const foundInDb = employee ? 'Yes' : 'No';
      let employeeActive = 'Not Found';

      if (employee) {
        employeeActive = employee.is_active ? 'Yes' : 'No';
        if (employee.is_active) {
          activeEmployees.add(associateLower);
        } else {
          inactiveEmployees.add(associateLower);
        }
      } else {
        notFoundEmployees.add(row.associate_name);
      }

      // Look up course - try by ID first, then by code prefix, then by full name
      const extCourseId = row.course_id;
      const extCourseCode = extractCourseCode(row.requirement);
      const extCourseName = extractCourseName(row.requirement);

      let matchedCourse: CourseRecord | undefined;
      let courseMatchType = 'No';

      if (extCourseId && courseByIdMap.has(extCourseId)) {
        matchedCourse = courseByIdMap.get(extCourseId);
        courseMatchType = 'Yes (ID)';
        coursesMatched++;
      } else if (extCourseCode && courseByCodeMap.has(extCourseCode.toLowerCase())) {
        matchedCourse = courseByCodeMap.get(extCourseCode.toLowerCase());
        courseMatchType = 'Yes (Code)';
        coursesMatched++;
      } else {
        const normalizedExtName = normalizeCourseName(extCourseName);
        if (courseByNameMap.has(normalizedExtName)) {
          matchedCourse = courseByNameMap.get(normalizedExtName);
          courseMatchType = 'Yes (Name)';
          coursesMatched++;
        } else {
          coursesNotMatched++;
        }
      }

      // Look up training record
      let dbCompletionDate = '';
      let dbExpirationDate = '';
      let dbStatus = '';

      if (employee && matchedCourse) {
        const trainingKey = `${associateLower}|${matchedCourse.course_id}`;
        const training = trainingMap.get(trainingKey);

        if (training) {
          dbCompletionDate = training.completion_date
            ? new Date(training.completion_date).toLocaleDateString()
            : '';
          dbExpirationDate = training.expiration_date
            ? new Date(training.expiration_date).toLocaleDateString()
            : 'No expiration';

          if (!training.completion_date) {
            dbStatus = 'Missing';
            trainingMissing++;
          } else if (training.expiration_date && new Date(training.expiration_date) < new Date()) {
            dbStatus = 'Expired';
            trainingExpired++;
          } else {
            dbStatus = 'Current';
            trainingCurrent++;
          }
        } else {
          dbStatus = 'Missing';
          trainingMissing++;
        }
      }

      // Add data row
      const dataRow = worksheet.addRow([
        row.requirement,
        row.associate_name,
        row.status,
        row.expire_date,
        '', // Blank separator
        employeeActive,
        foundInDb,
        courseMatchType,
        matchedCourse?.course_name || '',
        dbCompletionDate,
        dbExpirationDate,
        dbStatus
      ]);

      // Style the separator column
      dataRow.getCell(5).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colors.lightGray }
      };

      // Color code Employee Active column
      const activeCell = dataRow.getCell(6);
      if (employeeActive === 'Yes') {
        activeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
        activeCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else if (employeeActive === 'No') {
        activeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.red } };
        activeCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else {
        activeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.gray } };
        activeCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }

      // Color code Found in DB column
      const foundCell = dataRow.getCell(7);
      if (foundInDb === 'Yes') {
        foundCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
        foundCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else {
        foundCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.red } };
        foundCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }

      // Color code Course Match column
      const matchCell = dataRow.getCell(8);
      if (courseMatchType.startsWith('Yes')) {
        matchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
        matchCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else {
        matchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.orange } };
        matchCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }

      // Color code DB Status column
      const statusCell = dataRow.getCell(12);
      if (dbStatus === 'Current') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
        statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else if (dbStatus === 'Expired') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.orange } };
        statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      } else if (dbStatus === 'Missing') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.red } };
        statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }

      // Center alignment for status columns
      [6, 7, 8, 12].forEach(col => {
        dataRow.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
      });
    }

    // Add borders to all cells in main worksheet
    worksheet.eachRow((row) => {
      row.eachCell((cell, colNumber) => {
        if (colNumber !== 5) { // Skip separator column
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        }
      });
    });

    // Build Summary Sheet
    summarySheet.columns = [
      { width: 35 },
      { width: 15 },
      { width: 50 }
    ];

    // Title
    const titleRow = summarySheet.addRow(['External Training Comparison Summary']);
    titleRow.font = { bold: true, size: 16 };
    summarySheet.mergeCells('A1:C1');

    summarySheet.addRow(['Generated:', new Date().toLocaleString()]);
    summarySheet.addRow([]);

    // Overall Stats
    const statsHeader = summarySheet.addRow(['Overall Statistics', 'Count', 'Details']);
    statsHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    statsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.header } };

    summarySheet.addRow(['Total Records', totalRows, '']);
    summarySheet.addRow(['Unique Employees', uniqueEmployees.size, '']);
    summarySheet.addRow([]);

    // Employee Stats
    const empHeader = summarySheet.addRow(['Employee Statistics', 'Count', 'Percentage']);
    empHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    empHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.header } };

    const foundCount = uniqueEmployees.size - notFoundEmployees.size;
    const foundPct = (foundCount / uniqueEmployees.size * 100).toFixed(1);
    const notFoundPct = (notFoundEmployees.size / uniqueEmployees.size * 100).toFixed(1);
    const activePct = foundCount > 0 ? (activeEmployees.size / foundCount * 100).toFixed(1) : '0';
    const inactivePct = foundCount > 0 ? (inactiveEmployees.size / foundCount * 100).toFixed(1) : '0';

    summarySheet.addRow(['Employees Found in DB', foundCount, `${foundPct}%`]);
    summarySheet.addRow(['  - Active', activeEmployees.size, `${activePct}% of found`]);
    summarySheet.addRow(['  - Inactive', inactiveEmployees.size, `${inactivePct}% of found`]);
    summarySheet.addRow(['Employees NOT Found in DB', notFoundEmployees.size, `${notFoundPct}%`]);
    summarySheet.addRow([]);

    // Course Stats
    const courseHeader = summarySheet.addRow(['Course Matching Statistics', 'Count', 'Percentage']);
    courseHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    courseHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.header } };

    const matchedPct = (coursesMatched / totalRows * 100).toFixed(1);
    const notMatchedPct = (coursesNotMatched / totalRows * 100).toFixed(1);

    summarySheet.addRow(['Courses Matched', coursesMatched, `${matchedPct}%`]);
    summarySheet.addRow(['Courses NOT Matched', coursesNotMatched, `${notMatchedPct}%`]);
    summarySheet.addRow([]);

    // Training Status Stats
    const trainingHeader = summarySheet.addRow(['Training Status (where matched)', 'Count', 'Percentage']);
    trainingHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    trainingHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.header } };

    const trainingTotal = trainingCurrent + trainingExpired + trainingMissing;
    if (trainingTotal > 0) {
      summarySheet.addRow(['Current', trainingCurrent, `${(trainingCurrent / trainingTotal * 100).toFixed(1)}%`]);
      summarySheet.addRow(['Expired', trainingExpired, `${(trainingExpired / trainingTotal * 100).toFixed(1)}%`]);
      summarySheet.addRow(['Missing', trainingMissing, `${(trainingMissing / trainingTotal * 100).toFixed(1)}%`]);
    } else {
      summarySheet.addRow(['No training data matched', '', '']);
    }

    summarySheet.addRow([]);
    summarySheet.addRow([]);

    // List employees not found
    if (notFoundEmployees.size > 0) {
      const notFoundHeader = summarySheet.addRow(['Employees Not Found in Database']);
      notFoundHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      notFoundHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.red } };
      summarySheet.mergeCells(`A${notFoundHeader.number}:C${notFoundHeader.number}`);

      const sortedNotFound = Array.from(notFoundEmployees).sort();
      sortedNotFound.forEach(name => {
        summarySheet.addRow([name]);
      });
    }

    // Add borders to summary sheet
    summarySheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return as downloadable file
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
