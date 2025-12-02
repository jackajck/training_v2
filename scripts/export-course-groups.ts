/**
 * Export course groups to Excel for review
 *
 * Run with: npx tsx scripts/export-course-groups.ts
 */

import { neon } from '@neondatabase/serverless';
import ExcelJS from 'exceljs';

const sql = neon(process.env.DATABASE_URL!);

async function exportCourseGroups() {
  console.log('=== Exporting Course Groups to Excel ===\n');

  // Get all course groups with their members
  const groups = await sql`
    SELECT
      cg.group_code,
      cg.group_name,
      c.course_id,
      c.course_name,
      c.is_active,
      c.duration_months,
      (SELECT COUNT(*) FROM position_courses pc WHERE pc.course_id = c.course_id) as positions_requiring
    FROM course_groups cg
    JOIN course_group_members cgm ON cg.group_id = cgm.group_id
    JOIN courses c ON cgm.course_id = c.course_id
    ORDER BY cg.group_code, c.course_name
  `;

  // Get positions requiring each course in a group
  const positionsByCourse = await sql`
    SELECT
      c.course_id,
      STRING_AGG(DISTINCT p.position_name, ', ' ORDER BY p.position_name) as positions
    FROM courses c
    JOIN position_courses pc ON c.course_id = pc.course_id
    JOIN positions p ON pc.position_id = p.position_id
    WHERE c.course_id IN (SELECT course_id FROM course_group_members)
    GROUP BY c.course_id
  `;

  // Create lookup map
  const positionsMap: Record<string, string> = {};
  positionsByCourse.forEach((row: any) => {
    positionsMap[row.course_id] = row.positions;
  });

  // Get training counts per course (to see if anyone has taken these courses)
  const trainingCounts = await sql`
    SELECT
      c.course_id,
      COUNT(DISTINCT et.employee_id) as employee_count
    FROM courses c
    LEFT JOIN employee_training et ON c.course_id = et.course_id
    WHERE c.course_id IN (SELECT course_id FROM course_group_members)
    GROUP BY c.course_id
  `;

  // Create training count map
  const trainingCountMap: Record<string, number> = {};
  trainingCounts.forEach((row: any) => {
    trainingCountMap[row.course_id] = parseInt(row.employee_count) || 0;
  });

  console.log(`Found ${groups.length} course-group mappings\n`);

  // Create Excel workbook
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Detailed view
  const detailSheet = workbook.addWorksheet('Course Groups Detail');

  // Headers
  const detailHeaders = [
    'T-Code',
    'Group Name',
    'Course ID',
    'Course Name',
    'Active',
    'Duration (months)',
    'Positions Requiring This Course'
  ];

  const headerRow = detailSheet.addRow(detailHeaders);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4788' }
  };

  // Column widths
  detailSheet.columns = [
    { width: 12 },  // T-Code
    { width: 50 },  // Group Name
    { width: 12 },  // Course ID
    { width: 70 },  // Course Name
    { width: 10 },  // Active
    { width: 18 },  // Duration
    { width: 25 }   // Positions Requiring
  ];

  // Add data with alternating colors per group
  let currentGroup = '';
  let groupIndex = 0;
  const colors = ['FFFFFFFF', 'FFF3F4F6'];

  groups.forEach((row: any) => {
    if (row.group_code !== currentGroup) {
      currentGroup = row.group_code;
      groupIndex++;
    }

    const dataRow = detailSheet.addRow([
      row.group_code,
      row.group_name,
      row.course_id,
      row.course_name,
      row.is_active ? 'Yes' : 'No',
      row.duration_months || 'N/A',
      row.positions_requiring
    ]);

    // Alternate background per group
    dataRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors[groupIndex % 2] }
    };

    // Highlight if this course is required by positions
    if (parseInt(row.positions_requiring) > 0) {
      dataRow.getCell(7).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF3CD' }  // Yellow highlight
      };
      dataRow.getCell(7).font = { bold: true };
    }
  });

  // Add borders
  detailSheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // Sheet 2: Summary view
  const summarySheet = workbook.addWorksheet('Summary');

  // Group the data
  const groupSummary: Record<string, { name: string, courses: any[], hasPositionReq: boolean, positions: Set<string>, totalTrainingCount: number }> = {};
  groups.forEach((row: any) => {
    if (!groupSummary[row.group_code]) {
      groupSummary[row.group_code] = {
        name: row.group_name,
        courses: [],
        hasPositionReq: false,
        positions: new Set(),
        totalTrainingCount: 0
      };
    }
    groupSummary[row.group_code].courses.push(row);
    groupSummary[row.group_code].totalTrainingCount += trainingCountMap[row.course_id] || 0;
    if (parseInt(row.positions_requiring) > 0) {
      groupSummary[row.group_code].hasPositionReq = true;
      // Add positions for this course
      const positions = positionsMap[row.course_id];
      if (positions) {
        positions.split(', ').forEach((p: string) => groupSummary[row.group_code].positions.add(p));
      }
    }
  });

  const summaryHeaders = [
    'T-Code',
    'Group Name',
    '# Courses',
    'Course IDs',
    'Course Names',
    'Positions Requiring',
    'Employees With Training',
    'Status',
    'Decision (Group/Keep Separate)'
  ];

  const summaryHeaderRow = summarySheet.addRow(summaryHeaders);
  summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summaryHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4788' }
  };

  summarySheet.columns = [
    { width: 12 },  // T-Code
    { width: 50 },  // Group Name
    { width: 12 },  // # Courses
    { width: 25 },  // Course IDs
    { width: 80 },  // Course Names
    { width: 60 },  // Positions Requiring
    { width: 22 },  // Employees With Training
    { width: 30 },  // Status
    { width: 35 }   // Decision
  ];

  Object.entries(groupSummary).forEach(([code, data]) => {
    const courseIds = data.courses.map(c => c.course_id).join(', ');
    const courseNames = data.courses.map(c => c.course_name).join('\n');
    const courseCount = data.courses.length;

    // Get positions or show "None currently"
    const positionsList = data.positions.size > 0
      ? Array.from(data.positions).join('\n')
      : 'None currently';

    // Determine status based on positions and training
    let status: string;
    if (data.hasPositionReq) {
      status = 'NEEDS REVIEW - Position requires';
    } else if (data.totalTrainingCount > 0) {
      status = 'Has training, no position requirement';
    } else {
      status = 'Orphaned - No positions, no training';
    }

    const row = summarySheet.addRow([
      code,
      data.name,
      courseCount,
      courseIds,
      courseNames,
      positionsList,
      data.totalTrainingCount,
      status,
      ''  // Empty for decision
    ]);

    // Enable text wrap for course names and positions columns
    row.getCell(5).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(6).alignment = { wrapText: true, vertical: 'top' };

    // Highlight positions column
    if (data.hasPositionReq) {
      row.getCell(6).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF3CD' }  // Yellow - has position requirements
      };
      row.getCell(6).font = { bold: true };
    } else {
      row.getCell(6).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8E8E8' }  // Gray - no positions yet
      };
      row.getCell(6).font = { color: { argb: 'FF666666' } };
    }

    // Highlight status column based on status
    if (data.hasPositionReq) {
      row.getCell(8).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF3CD' }  // Yellow - needs review
      };
      row.getCell(8).font = { bold: true };
    } else if (data.totalTrainingCount > 0) {
      row.getCell(8).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD4EDDA' }  // Light green - has training but no position req
      };
    } else {
      row.getCell(8).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8D7DA' }  // Light red - orphaned
      };
      row.getCell(8).font = { color: { argb: 'FF721C24' } };
    }
  });

  // Add borders to summary
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

  // Sheet 3: Instructions
  const instrSheet = workbook.addWorksheet('Instructions');
  instrSheet.columns = [{ width: 100 }];

  const instructions = [
    'COURSE GROUPS REVIEW',
    '',
    'This spreadsheet shows all T-codes that have multiple courses in the database.',
    '',
    'WHY THIS MATTERS:',
    '- When a position requires course 99939 (T717 Concepts and Techniques...)',
    '- But an employee has course 14350 (T717 Machines and Machine Guarding...)',
    '- The system currently shows "Missing" even though they are the same T-code',
    '',
    'WHAT TO DECIDE:',
    '1. Review the "Summary" tab to see all T-codes with multiple courses',
    '2. Yellow highlighted rows have position requirements - these are the important ones',
    '3. In the "Notes/Action Needed" column, mark whether these courses should be treated as equivalent',
    '',
    'OPTIONS FOR EACH GROUP:',
    '- "Group" = Any course in this T-code satisfies the requirement (use latest expiration)',
    '- "Keep Separate" = These are truly different courses and should NOT be grouped',
    '- "Review" = Need more information to decide',
    '',
    'EXAMPLE - T717:',
    '- 99939: SPPIVT T717 Concepts and Techniques of Machine Safeguarding (OL)',
    '- 14350: SPPIVT T717 Machines and Machine Guarding (OL)',
    '- 13512: SPPIVT T717 Machines and Machine Guarding - PARENT',
    '',
    'If these are all equivalent, an employee with ANY of these should satisfy a T717 requirement.',
  ];

  instructions.forEach(line => {
    const row = instrSheet.addRow([line]);
    if (line === 'COURSE GROUPS REVIEW' || line.startsWith('WHY') || line.startsWith('WHAT') || line.startsWith('OPTIONS') || line.startsWith('EXAMPLE')) {
      row.font = { bold: true, size: 12 };
    }
  });

  // Save the file
  const filename = `course-groups-review-${new Date().toISOString().split('T')[0]}.xlsx`;
  await workbook.xlsx.writeFile(filename);
  console.log(`✓ Excel file created: ${filename}`);

  // Also show summary stats
  const withReqs = Object.values(groupSummary).filter(g => g.hasPositionReq).length;
  const withTrainingOnly = Object.values(groupSummary).filter(g => !g.hasPositionReq && g.totalTrainingCount > 0).length;
  const orphaned = Object.values(groupSummary).filter(g => !g.hasPositionReq && g.totalTrainingCount === 0).length;
  console.log(`\n=== Summary ===`);
  console.log(`Total T-code groups: ${Object.keys(groupSummary).length}`);
  console.log(`  - With position requirements: ${withReqs} (NEEDS REVIEW - yellow)`);
  console.log(`  - Has training, no position req: ${withTrainingOnly} (green)`);
  console.log(`  - Orphaned (no positions, no training): ${orphaned} (red)`);
}

exportCourseGroups()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
