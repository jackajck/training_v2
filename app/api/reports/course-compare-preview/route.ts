import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';
import { readFile } from 'fs/promises';
import path from 'path';

interface CSVRow {
  requirement: string;
  associate: string;
  currentStatus: string;
  expireDate: string;
}

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

// Extract course ID from CSV requirement string like "SPPIVT T111 ESD and FOD Training (OL)(13458)"
function extractCourseId(requirement: string): string | null {
  const match = requirement.match(/\((\d+)\)$/);
  return match ? match[1] : null;
}

// Extract course code prefix like "SPPIVT T111" or "EHSBBPOCCWB"
function extractCourseCode(requirement: string): string | null {
  // Match patterns like "SPPIVT T111", "EHSBBPOCCWB", "RTXQUALCARDWB"
  const match = requirement.match(/^([A-Z]+(?:\s+T?\d+[A-Z]?)?)/i);
  return match ? match[1].trim() : null;
}

// Parse CSV content
function parseCSV(content: string): CSVRow[] {
  const rows: CSVRow[] = [];

  // Remove BOM if present and normalize line endings
  const cleanContent = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = cleanContent.split('\n');

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Skip summary rows
    if (line.includes('Overall Requirement Summary')) continue;

    // Parse CSV with quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    if (fields.length >= 4 && fields[0] && fields[1]) {
      rows.push({
        requirement: fields[0],
        associate: fields[1].replace(/"/g, ''),
        currentStatus: fields[2] || '',
        expireDate: fields[3] || ''
      });
    }
  }

  return rows;
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

    // Get employee name from query params (for preview filtering)
    const { searchParams } = new URL(request.url);
    const filterName = searchParams.get('name') || 'Abbott,Michael C';

    // Read CSV file
    const csvPath = path.join(process.cwd(), 'course_compare.csv');
    const csvContent = await readFile(csvPath, 'utf-8');
    const allCsvRows = parseCSV(csvContent);

    // Filter to just the specified employee for preview
    const csvRows = allCsvRows.filter(row =>
      row.associate.toLowerCase() === filterName.toLowerCase()
    );

    // Get employee from database
    const employees = await sql`
      SELECT employee_name, badge_id, is_active
      FROM employees
      WHERE LOWER(employee_name) = LOWER(${filterName})
    ` as EmployeeRecord[];

    const employee = employees[0];

    // Get all courses from database
    const courses = await sql`
      SELECT course_id, course_name
      FROM courses
    ` as CourseRecord[];

    // Create lookup maps for courses
    const courseByIdMap = new Map<string, CourseRecord>();
    const courseByCodeMap = new Map<string, CourseRecord>();
    courses.forEach(course => {
      courseByIdMap.set(course.course_id, course);
      // Also index by course code prefix
      const code = extractCourseCode(course.course_name);
      if (code) {
        courseByCodeMap.set(code.toLowerCase(), course);
      }
    });

    // Get training records for this employee
    const trainingRecords = employee ? await sql`
      SELECT et.course_id, et.completion_date, et.expiration_date
      FROM employee_training et
      JOIN employees e ON et.employee_id = e.employee_id
      WHERE LOWER(e.employee_name) = LOWER(${filterName})
    ` : [];

    // Create training lookup by course_id
    const trainingMap = new Map<string, TrainingRecord>();
    (trainingRecords as { course_id: string; completion_date: string | null; expiration_date: string | null }[]).forEach(tr => {
      const existing = trainingMap.get(tr.course_id);
      if (!existing || (tr.completion_date && (!existing.completion_date || tr.completion_date > existing.completion_date))) {
        trainingMap.set(tr.course_id, {
          course_id: tr.course_id,
          completion_date: tr.completion_date,
          expiration_date: tr.expiration_date
        });
      }
    });

    // Process each CSV row
    const previewData = csvRows.map(csvRow => {
      // Look up course - try by ID first, then by course code
      const csvCourseId = extractCourseId(csvRow.requirement);
      const csvCourseCode = extractCourseCode(csvRow.requirement);

      let matchedCourse: CourseRecord | undefined;
      let courseMatchType = 'No';

      if (csvCourseId && courseByIdMap.has(csvCourseId)) {
        matchedCourse = courseByIdMap.get(csvCourseId);
        courseMatchType = 'Yes (ID)';
      } else if (csvCourseCode && courseByCodeMap.has(csvCourseCode.toLowerCase())) {
        matchedCourse = courseByCodeMap.get(csvCourseCode.toLowerCase());
        courseMatchType = 'Yes (Code)';
      }

      // Look up training record
      let dbCompletionDate = '';
      let dbExpirationDate = '';
      let dbStatus = '';

      if (employee && matchedCourse) {
        const training = trainingMap.get(matchedCourse.course_id);

        if (training) {
          dbCompletionDate = training.completion_date
            ? new Date(training.completion_date).toLocaleDateString()
            : '';
          dbExpirationDate = training.expiration_date
            ? new Date(training.expiration_date).toLocaleDateString()
            : 'No expiration';

          if (!training.completion_date) {
            dbStatus = 'Missing';
          } else if (training.expiration_date && new Date(training.expiration_date) < new Date()) {
            dbStatus = 'Expired';
          } else {
            dbStatus = 'Current';
          }
        } else {
          dbStatus = 'Missing';
        }
      }

      return {
        requirement: csvRow.requirement,
        associate: csvRow.associate,
        currentStatus: csvRow.currentStatus,
        expireDate: csvRow.expireDate,
        employeeActive: employee ? (employee.is_active ? 'Yes' : 'No') : 'Not Found',
        foundInDb: employee ? 'Yes' : 'No',
        courseMatch: courseMatchType,
        dbCourseName: matchedCourse?.course_name || '',
        dbCompletionDate,
        dbExpirationDate,
        dbStatus
      };
    });

    return NextResponse.json({
      success: true,
      data: previewData,
      count: previewData.length,
      filterName,
      employeeFound: !!employee,
      badgeId: employee?.badge_id || null
    });

  } catch (error) {
    console.error('Error generating preview:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
