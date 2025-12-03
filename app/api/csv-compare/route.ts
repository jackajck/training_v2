import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';

interface CSVRow {
  requirement: string;
  associate: string;
  status: string;
  expireDate: string;
  courseId: string | null;
}

function parseCSV(content: string): CSVRow[] {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/);
  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const matches = line.match(/(?:^|,)("(?:[^"]*(?:""[^"]*)*)"|[^,]*)/g);
    if (!matches || matches.length < 4) continue;

    const fields = matches.map(m => {
      let val = m.startsWith(',') ? m.slice(1) : m;
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      return val.trim();
    });

    const requirement = fields[0];
    const idMatch = requirement.match(/\((\d+)\)\s*$/);

    rows.push({
      requirement,
      associate: fields[1],
      status: fields[2],
      expireDate: fields[3],
      courseId: idMatch ? idMatch[1] : null
    });
  }

  return rows;
}

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
    // Read CSV
    const csvPath = path.join(process.cwd(), 'course_compare.csv');
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({ error: 'CSV file not found' }, { status: 404 });
    }

    const content = fs.readFileSync(csvPath, 'utf-8');
    const allRows = parseCSV(content);

    // Filter for this employee
    const searchLower = employeeName.toLowerCase();
    const employeeRows = allRows.filter(r => r.associate.toLowerCase().includes(searchLower));

    if (employeeRows.length === 0) {
      return NextResponse.json({
        found: false,
        message: `No records found in CSV for "${employeeName}"`,
        suggestions: [...new Set(allRows.map(r => r.associate))]
          .filter(n => n.toLowerCase().includes(searchLower.split(',')[0]?.toLowerCase() || ''))
          .slice(0, 10)
      });
    }

    const exactName = employeeRows[0].associate;

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
        message: 'Employee found in CSV but NOT in our database'
      });
    }

    const employee = dbEmployee[0];

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

    // Analyze each CSV row
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

    for (const row of employeeRows) {
      const tCode = extractTCode(row.requirement);
      const isRequired = row.courseId ? requiredCourses.has(row.courseId) : false;

      if (!row.courseId) {
        notFound.push({
          courseId: null,
          courseName: row.requirement,
          tCode,
          csvStatus: row.status,
          csvExpiration: row.expireDate,
          isRequired: false,
          reason: 'No course ID in requirement'
        });
        continue;
      }

      if (!courseSet.has(row.courseId)) {
        courseNotInDb.push({
          courseId: row.courseId,
          courseName: row.requirement,
          tCode,
          csvStatus: row.status,
          csvExpiration: row.expireDate,
          isRequired
        });
        continue;
      }

      // Check exact match
      if (dbTrainingSet.has(row.courseId)) {
        const dbInfo = dbTrainingMap.get(row.courseId);
        exactMatches.push({
          courseId: row.courseId,
          courseName: row.requirement,
          tCode,
          csvStatus: row.status,
          csvExpiration: row.expireDate,
          dbExpiration: formatDate(dbInfo?.expiration || null),
          isRequired
        });
        continue;
      }

      // Check group match
      const groupInfo = courseToGroup.get(row.courseId);
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
              courseId: row.courseId,
              courseName: row.requirement,
              tCode,
              csvStatus: row.status,
              csvExpiration: row.expireDate,
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
        courseId: row.courseId,
        courseName: row.requirement,
        tCode,
        csvStatus: row.status,
        csvExpiration: row.expireDate,
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
