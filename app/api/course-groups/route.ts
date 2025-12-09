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
        notes: course.notes
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
        action = COALESCE(${action}, action),
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
