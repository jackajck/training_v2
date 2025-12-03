import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

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

    // Get external training records from database for this employee
    const externalRows = await sql`
      SELECT associate_name, requirement, course_id, status, expire_date
      FROM external_training
      WHERE LOWER(associate_name) = LOWER(${filterName})
      ORDER BY requirement
    `;

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

    // Process each external row
    type ExternalRow = { requirement: string; course_id: string | null; status: string; expire_date: string; associate_name: string };
    const previewData = (externalRows as ExternalRow[]).map((row) => {
      // Look up course - try by ID first, then by course code
      const extCourseId = row.course_id;
      const extCourseCode = extractCourseCode(row.requirement);

      let matchedCourse: CourseRecord | undefined;
      let courseMatchType = 'No';

      if (extCourseId && courseByIdMap.has(extCourseId)) {
        matchedCourse = courseByIdMap.get(extCourseId);
        courseMatchType = 'Yes (ID)';
      } else if (extCourseCode && courseByCodeMap.has(extCourseCode.toLowerCase())) {
        matchedCourse = courseByCodeMap.get(extCourseCode.toLowerCase());
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
        requirement: row.requirement,
        associate: row.associate_name,
        currentStatus: row.status,
        expireDate: row.expire_date,
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
