import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// Extract variant type from requirement (PARENT, IL, OL, OJT)
function extractVariant(requirement: string): string {
  const variants: string[] = [];

  if (/\bPARENT\b/i.test(requirement)) variants.push('PARENT');
  if (/\bIL\b/.test(requirement)) variants.push('IL');
  if (/\bOL\b/.test(requirement)) variants.push('OL');
  if (/\bOJT\b/.test(requirement)) variants.push('OJT');

  return variants.length > 0 ? variants.join('/') : 'STANDARD';
}

interface CourseWithCount {
  course_id: string;
  requirement: string;
  variant: string;
  employee_count: number;
  // From course_cleanup table
  action: string;
  merge_into: string | null;
  rename_to: string | null;
  is_one_time: boolean | null;
  recert_months: number | null;
  notes: string | null;
  // Calculated cert duration info (from employee_training)
  cert_durations: { months: number; count: number }[];
  no_expiration_count: number;
  // From external_training (source CSV)
  ext_has_exp: number;
  ext_no_exp: number;
  ext_min_exp: string | null;
  ext_max_exp: string | null;
  // If this course was merged into another
  merged_into: string | null;
}

interface TCodeGroup {
  tCode: string;
  courses: CourseWithCount[];
  totalEmployees: number;
}

export async function GET() {
  try {
    // Get all courses from external_training with T-codes, joined with cleanup decisions
    // and employee counts
    const courses = await sql`
      SELECT
        et.course_id,
        et.requirement,
        COUNT(DISTINCT et.associate_name) as employee_count,
        COALESCE(cc.action, 'pending') as action,
        cc.merge_into,
        cc.rename_to,
        cc.is_one_time,
        cc.recert_months,
        cc.notes,
        cc.t_code
      FROM external_training et
      LEFT JOIN course_cleanup cc ON et.course_id = cc.course_id
      WHERE et.requirement ~ 'T[0-9]{3}'
      GROUP BY et.course_id, et.requirement, cc.action, cc.merge_into, cc.rename_to, cc.is_one_time, cc.recert_months, cc.notes, cc.t_code
      ORDER BY et.requirement
    `;

    // Get cert durations from employee_training (completion -> expiration difference)
    const certDurations = await sql`
      SELECT
        course_id,
        ROUND(EXTRACT(EPOCH FROM (expiration_date - completion_date)) / (30.44 * 24 * 60 * 60))::int as months,
        COUNT(*) as count
      FROM employee_training
      WHERE expiration_date IS NOT NULL
        AND completion_date IS NOT NULL
        AND expiration_date > completion_date
      GROUP BY course_id, months
      ORDER BY course_id, count DESC
    `;

    // Get count of trainings with no expiration (one-time courses)
    const noExpiration = await sql`
      SELECT
        course_id,
        COUNT(*) as count
      FROM employee_training
      WHERE expiration_date IS NULL
      GROUP BY course_id
    `;

    // Build a map of course_id -> duration info
    const durationMap: Record<string, { months: number; count: number }[]> = {};
    for (const row of certDurations) {
      if (!durationMap[row.course_id]) {
        durationMap[row.course_id] = [];
      }
      durationMap[row.course_id].push({
        months: Number(row.months),
        count: Number(row.count)
      });
    }

    // Map for no-expiration counts
    const noExpMap: Record<string, number> = {};
    for (const row of noExpiration) {
      noExpMap[row.course_id] = Number(row.count);
    }

    // Check for merged courses (old IDs that were consolidated)
    const mergedCourses = await sql`
      SELECT old_course_id, new_course_id FROM merged_courses
    `;
    const mergedMap: Record<string, string> = {};
    for (const row of mergedCourses) {
      mergedMap[row.old_course_id] = row.new_course_id;
    }

    // Get expiration info from external_training (the source CSV data)
    // Also get min/max expiration dates to show timeframe
    const extExpInfo = await sql`
      SELECT
        course_id,
        SUM(CASE WHEN expire_date = 'n/a' OR expiration_date IS NULL THEN 1 ELSE 0 END)::int as no_exp_count,
        SUM(CASE WHEN expire_date != 'n/a' AND expiration_date IS NOT NULL THEN 1 ELSE 0 END)::int as has_exp_count,
        MIN(expiration_date) as min_exp,
        MAX(expiration_date) as max_exp
      FROM external_training
      GROUP BY course_id
    `;
    const extExpMap: Record<string, { noExp: number; hasExp: number; minExp: string | null; maxExp: string | null }> = {};
    for (const row of extExpInfo) {
      extExpMap[row.course_id] = {
        noExp: Number(row.no_exp_count),
        hasExp: Number(row.has_exp_count),
        minExp: row.min_exp ? new Date(row.min_exp).toISOString().split('T')[0] : null,
        maxExp: row.max_exp ? new Date(row.max_exp).toISOString().split('T')[0] : null
      };
    }

    // Group by T-Code
    const tCodeGroups: Record<string, TCodeGroup> = {};

    for (const course of courses) {
      // Extract T-Code from requirement or use stored t_code
      const tCodeMatch = course.requirement.match(/\bT(\d{3}[A-Z]?)\b/);
      const tCode = course.t_code || (tCodeMatch ? `T${tCodeMatch[1]}` : null);
      if (!tCode) continue;

      if (!tCodeGroups[tCode]) {
        tCodeGroups[tCode] = {
          tCode,
          courses: [],
          totalEmployees: 0
        };
      }

      const extExp = extExpMap[course.course_id] || { noExp: 0, hasExp: 0 };
      const courseData: CourseWithCount = {
        course_id: course.course_id,
        requirement: course.requirement,
        variant: extractVariant(course.requirement),
        employee_count: Number(course.employee_count),
        action: course.action || 'pending',
        merge_into: course.merge_into,
        rename_to: course.rename_to,
        is_one_time: course.is_one_time,
        recert_months: course.recert_months,
        notes: course.notes,
        cert_durations: durationMap[course.course_id] || [],
        no_expiration_count: noExpMap[course.course_id] || 0,
        ext_has_exp: extExp.hasExp,
        ext_no_exp: extExp.noExp,
        ext_min_exp: extExp.minExp,
        ext_max_exp: extExp.maxExp,
        merged_into: mergedMap[course.course_id] || null
      };

      tCodeGroups[tCode].courses.push(courseData);
      tCodeGroups[tCode].totalEmployees += courseData.employee_count;
    }

    // Convert to array, filter to only multi-course groups, and sort by T-Code
    const groups = Object.values(tCodeGroups)
      .filter(g => g.courses.length > 1) // Only show T-Codes with multiple courses (duplicates to review)
      .sort((a, b) => {
        // Sort by numeric portion of T-Code
        const aNum = parseInt(a.tCode.replace(/\D/g, ''));
        const bNum = parseInt(b.tCode.replace(/\D/g, ''));
        return aNum - bNum;
      });

    // Summary stats
    const stats = {
      totalGroups: groups.length,
      totalCourses: groups.reduce((sum, g) => sum + g.courses.length, 0),
      multiCourseGroups: groups.filter(g => g.courses.length > 1).length,
      pendingReview: groups.reduce((sum, g) => sum + g.courses.filter(c => c.action === 'pending').length, 0),
      reviewed: groups.reduce((sum, g) => sum + g.courses.filter(c => c.action !== 'pending').length, 0)
    };

    return NextResponse.json({
      success: true,
      stats,
      groups
    });

  } catch (error) {
    console.error('Error fetching course groups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch course groups' },
      { status: 500 }
    );
  }
}

// POST - Update a course's cleanup decision
export async function POST(request: Request) {
  try {
    const { course_id, action, merge_into, rename_to, is_one_time, recert_months, notes } = await request.json();

    if (!course_id) {
      return NextResponse.json(
        { error: 'course_id is required' },
        { status: 400 }
      );
    }

    // Validate action
    const validActions = ['pending', 'keep', 'merge', 'delete'];
    if (action && !validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      );
    }

    await sql`
      UPDATE course_cleanup
      SET
        action = ${action},
        merge_into = ${merge_into},
        rename_to = ${rename_to},
        is_one_time = ${is_one_time},
        recert_months = ${recert_months},
        notes = ${notes},
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE course_id = ${course_id}
    `;

    return NextResponse.json({
      success: true,
      message: `Course ${course_id} updated`
    });

  } catch (error) {
    console.error('Error updating course:', error);
    return NextResponse.json(
      { error: 'Failed to update course' },
      { status: 500 }
    );
  }
}
