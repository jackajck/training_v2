import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

function extractTCode(courseName: string): string | null {
  const match = courseName.match(/\b(T\d+[A-Z]?)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const employeeName = searchParams.get('name');

  if (!employeeName) {
    return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 });
  }

  try {
    // Search external_training table for matching records
    const searchLower = employeeName.toLowerCase();

    // Get matching records from external_training
    const externalRows = await sql`
      SELECT associate_name, requirement, course_id, status, expire_date
      FROM external_training
      WHERE LOWER(associate_name) LIKE ${`%${searchLower}%`}
      ORDER BY associate_name, requirement
    `;

    if (externalRows.length === 0) {
      // Get suggestions
      const suggestions = await sql`
        SELECT DISTINCT associate_name
        FROM external_training
        WHERE LOWER(associate_name) LIKE ${`%${searchLower.split(',')[0]}%`}
        LIMIT 10
      `;

      return NextResponse.json({
        found: false,
        message: `No records found in external training data for "${employeeName}"`,
        suggestions: (suggestions as { associate_name: string }[]).map(s => s.associate_name)
      });
    }

    const exactName = (externalRows[0] as { associate_name: string }).associate_name;

    // Filter to only this exact associate
    const employeeRows = (externalRows as { associate_name: string; requirement: string; course_id: string | null; status: string; expire_date: string }[]).filter(
      r => r.associate_name.toLowerCase() === exactName.toLowerCase()
    );

    // Find employee in our DB
    const dbEmployee = await sql`
      SELECT employee_id, employee_name, is_active
      FROM employees
      WHERE LOWER(employee_name) = LOWER(${exactName})
    `;

    if (dbEmployee.length === 0) {
      return NextResponse.json({
        found: true,
        csvName: exactName,
        csvRecordCount: employeeRows.length,
        inDatabase: false,
        message: 'Employee found in external data but NOT in our database'
      });
    }

    const employee = dbEmployee[0] as { employee_id: number; employee_name: string; is_active: boolean };

    // Get employee's training from our DB
    const dbTraining = await sql`
      SELECT et.course_id, c.course_name, et.expiration_date
      FROM employee_training et
      JOIN courses c ON et.course_id = c.course_id
      WHERE et.employee_id = ${employee.employee_id}
    `;

    const dbTrainingSet = new Set<string>();
    const dbTrainingMap = new Map<string, { name: string; expiration: string | null }>();
    for (const t of dbTraining) {
      const row = t as { course_id: string; course_name: string; expiration_date: string | null };
      dbTrainingSet.add(row.course_id);
      dbTrainingMap.set(row.course_id, {
        name: row.course_name,
        expiration: row.expiration_date
      });
    }

    // Load course groups
    const courseGroups = await sql`
      SELECT cg.group_id, cg.group_code, cgm.course_id
      FROM course_groups cg
      JOIN course_group_members cgm ON cg.group_id = cgm.group_id
      WHERE cg.is_enabled = true
    `;
    const courseToGroup = new Map<string, { groupId: number; groupCode: string }>();
    const groupToCourses = new Map<number, Set<string>>();
    for (const cg of courseGroups) {
      const row = cg as { group_id: number; group_code: string; course_id: string };
      courseToGroup.set(row.course_id, { groupId: row.group_id, groupCode: row.group_code });
      if (!groupToCourses.has(row.group_id)) {
        groupToCourses.set(row.group_id, new Set());
      }
      groupToCourses.get(row.group_id)!.add(row.course_id);
    }

    // Load position requirements
    const positionCourses = await sql`
      SELECT DISTINCT pc.course_id
      FROM position_courses pc
      JOIN positions p ON pc.position_id = p.position_id
      WHERE p.is_active = true
    `;
    const requiredCourses = new Set<string>();
    for (const pc of positionCourses) {
      const row = pc as { course_id: string };
      requiredCourses.add(row.course_id);
    }

    // Load courses table
    const courses = await sql`SELECT course_id FROM courses`;
    const courseSet = new Set<string>();
    for (const c of courses) {
      const row = c as { course_id: string };
      courseSet.add(row.course_id);
    }

    // Analyze each external row
    interface MatchRecord {
      courseId: string | null;
      courseName: string;
      tCode: string | null;
      csvStatus: string;
      csvExpiration: string;
      dbExpiration?: string;
      isRequired: boolean;
      groupCode?: string;
      matchedCourseId?: string;
      matchedCourseName?: string | null;
      inGroup?: boolean;
      reason?: string;
    }

    const exactMatches: MatchRecord[] = [];
    const groupMatches: MatchRecord[] = [];
    const notFound: MatchRecord[] = [];
    const courseNotInDb: MatchRecord[] = [];

    for (const r of employeeRows) {
      const tCode = extractTCode(r.requirement);
      const isRequired = r.course_id ? requiredCourses.has(r.course_id) : false;

      if (!r.course_id) {
        notFound.push({
          courseId: null,
          courseName: r.requirement,
          tCode,
          csvStatus: r.status,
          csvExpiration: r.expire_date,
          isRequired: false,
          reason: 'No course ID in requirement'
        });
        continue;
      }

      if (!courseSet.has(r.course_id)) {
        courseNotInDb.push({
          courseId: r.course_id,
          courseName: r.requirement,
          tCode,
          csvStatus: r.status,
          csvExpiration: r.expire_date,
          isRequired
        });
        continue;
      }

      // Check exact match
      if (dbTrainingSet.has(r.course_id)) {
        const dbInfo = dbTrainingMap.get(r.course_id);
        exactMatches.push({
          courseId: r.course_id,
          courseName: r.requirement,
          tCode,
          csvStatus: r.status,
          csvExpiration: r.expire_date,
          dbExpiration: formatDate(dbInfo?.expiration || null),
          isRequired
        });
        continue;
      }

      // Check group match
      const groupInfo = courseToGroup.get(r.course_id);
      if (groupInfo) {
        const groupCourses = groupToCourses.get(groupInfo.groupId);
        if (groupCourses) {
          let matchedCourse: string | null = null;
          let matchedCourseName: string | null = null;
          for (const gc of groupCourses) {
            if (dbTrainingSet.has(gc)) {
              matchedCourse = gc;
              matchedCourseName = dbTrainingMap.get(gc)?.name || null;
              break;
            }
          }
          if (matchedCourse) {
            const dbInfo = dbTrainingMap.get(matchedCourse);
            groupMatches.push({
              courseId: r.course_id,
              courseName: r.requirement,
              tCode,
              csvStatus: r.status,
              csvExpiration: r.expire_date,
              groupCode: groupInfo.groupCode,
              matchedCourseId: matchedCourse,
              matchedCourseName,
              dbExpiration: formatDate(dbInfo?.expiration || null),
              isRequired
            });
            continue;
          }
        }
      }

      // Not found
      notFound.push({
        courseId: r.course_id,
        courseName: r.requirement,
        tCode,
        csvStatus: r.status,
        csvExpiration: r.expire_date,
        isRequired,
        inGroup: !!groupInfo,
        groupCode: groupInfo?.groupCode,
        reason: 'No training record in database'
      });
    }

    // Calculate summary stats
    const totalRequired = exactMatches.filter(m => m.isRequired).length +
                          groupMatches.filter(m => m.isRequired).length;
    const missingRequired = notFound.filter(n => n.isRequired).length;
    const rogueCount = notFound.filter(n => !n.isRequired).length + courseNotInDb.length;

    return NextResponse.json({
      found: true,
      csvName: exactName,
      inDatabase: true,
      employee: {
        id: employee.employee_id,
        name: employee.employee_name,
        isActive: employee.is_active
      },
      summary: {
        csvRecords: employeeRows.length,
        dbRecords: dbTraining.length,
        exactMatches: exactMatches.length,
        groupMatches: groupMatches.length,
        notFound: notFound.length,
        courseNotInDb: courseNotInDb.length,
        totalMatched: exactMatches.length + groupMatches.length,
        requiredMatched: totalRequired,
        requiredMissing: missingRequired,
        rogueCount
      },
      records: {
        exactMatches,
        groupMatches,
        notFound,
        courseNotInDb
      }
    });

  } catch (error) {
    console.error('CSV Compare error:', error);
    return NextResponse.json({ error: 'Failed to analyze employee' }, { status: 500 });
  }
}
