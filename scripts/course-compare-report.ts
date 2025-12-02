/**
 * Course Compare Report
 *
 * Takes course_compare.csv and checks if each training record exists in our database.
 * Outputs an Excel file with original columns plus match status.
 *
 * Match statuses:
 * - Exact Match: We have this exact course ID for this employee
 * - Group Match: We have an equivalent course from the same T-code group
 * - Not Found: We don't have this course or any equivalent
 * - Employee Not Found: Employee doesn't exist in our database
 *
 * Run with: npx tsx scripts/course-compare-report.ts
 */

import { neon } from '@neondatabase/serverless';
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

const sql = neon(process.env.DATABASE_URL!);

// Tolerance for date comparison (in days)
const DATE_TOLERANCE_DAYS = 2;

interface CSVRow {
  requirement: string;
  associate: string;
  status: string;
  expireDate: string;
  courseId: string | null;
  parsedExpiration: Date | null;
}

interface MatchResult {
  status: 'Exact Match' | 'Group Match' | 'Not Found' | 'Employee Not Found';
  matchDetails: string;
  dbExpiration: string;
}

function parseCSV(content: string): CSVRow[] {
  // Handle BOM
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const lines = content.split(/\r?\n/);
  const rows: CSVRow[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV with quotes
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
    const expireDate = fields[3];

    // Extract course ID from requirement (number in parentheses at end)
    const idMatch = requirement.match(/\((\d+)\)\s*$/);
    const courseId = idMatch ? idMatch[1] : null;

    // Parse expiration date
    let parsedExpiration: Date | null = null;
    if (expireDate && expireDate.toLowerCase() !== 'n/a' && expireDate !== '') {
      const dateMatch = expireDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dateMatch) {
        const [, month, day, year] = dateMatch;
        parsedExpiration = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
    }

    rows.push({
      requirement,
      associate: fields[1],
      status: fields[2],
      expireDate,
      courseId,
      parsedExpiration
    });
  }

  return rows;
}

function datesMatch(date1: Date | null, date2: Date | null): boolean {
  if (!date1 || !date2) return false;
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= DATE_TOLERANCE_DAYS;
}

function formatDate(date: Date | null): string {
  if (!date) return '';
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

async function generateReport() {
  console.log('=== Course Compare Report ===\n');

  // Read CSV
  const csvPath = path.join(process.cwd(), 'course_compare.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('Error: course_compare.csv not found in current directory');
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);
  console.log(`Parsed ${rows.length} rows from CSV\n`);

  // Load employees
  console.log('Loading employees...');
  const employees = await sql`SELECT employee_id, employee_name FROM employees`;
  const employeeMap = new Map<string, number>();
  employees.forEach((e: any) => {
    // Store by lowercase name for case-insensitive matching
    employeeMap.set(e.employee_name.toLowerCase(), e.employee_id);
  });
  console.log(`Loaded ${employees.length} employees`);

  // Load all training records with expiration dates
  console.log('Loading training records...');
  const training = await sql`
    SELECT employee_id, course_id, expiration_date
    FROM employee_training
  `;
  // Map: "employeeId-courseId" -> latest expiration date
  const trainingMap = new Map<string, Date | null>();
  training.forEach((t: any) => {
    const key = `${t.employee_id}-${t.course_id}`;
    const expDate = t.expiration_date ? new Date(t.expiration_date) : null;
    const existing = trainingMap.get(key);
    // Keep the latest expiration date
    if (!existing || (expDate && (!existing || expDate > existing))) {
      trainingMap.set(key, expDate);
    }
  });
  console.log(`Loaded ${training.length} training records`);

  // Load enabled course groups
  console.log('Loading course groups...');
  const courseGroups = await sql`
    SELECT cg.group_id, cg.group_code, cgm.course_id
    FROM course_groups cg
    JOIN course_group_members cgm ON cg.group_id = cgm.group_id
    WHERE cg.is_enabled = true
  `;

  // Map: course_id -> { group_id, group_code }
  const courseToGroup = new Map<string, { groupId: number; groupCode: string }>();
  // Map: group_id -> Set of course_ids
  const groupToCourses = new Map<number, Set<string>>();

  courseGroups.forEach((cg: any) => {
    courseToGroup.set(cg.course_id, { groupId: cg.group_id, groupCode: cg.group_code });
    if (!groupToCourses.has(cg.group_id)) {
      groupToCourses.set(cg.group_id, new Set());
    }
    groupToCourses.get(cg.group_id)!.add(cg.course_id);
  });
  console.log(`Loaded ${courseGroups.length} course group mappings\n`);

  // Process each row
  console.log('Processing rows...');
  const results: { row: CSVRow; match: MatchResult }[] = [];

  let exactCount = 0;
  let groupCount = 0;
  let notFoundCount = 0;
  let employeeNotFoundCount = 0;

  for (const row of rows) {
    let match: MatchResult = {
      status: 'Not Found',
      matchDetails: '',
      dbExpiration: ''
    };

    // Check if we can find the employee
    const employeeId = employeeMap.get(row.associate.toLowerCase());
    if (!employeeId) {
      match.status = 'Employee Not Found';
      employeeNotFoundCount++;
      results.push({ row, match });
      continue;
    }

    // Skip if no course ID could be extracted
    if (!row.courseId) {
      notFoundCount++;
      results.push({ row, match });
      continue;
    }

    // Check for exact match
    const exactKey = `${employeeId}-${row.courseId}`;
    const exactExpiration = trainingMap.get(exactKey);

    if (trainingMap.has(exactKey)) {
      // Exact match found
      match.status = 'Exact Match';
      exactCount++;

      // Check if expiration dates differ
      if (row.parsedExpiration && exactExpiration) {
        if (!datesMatch(row.parsedExpiration, exactExpiration)) {
          match.matchDetails = 'Different Exp';
          match.dbExpiration = formatDate(exactExpiration);
        }
      } else if (row.parsedExpiration && !exactExpiration) {
        match.matchDetails = 'DB has no exp';
        match.dbExpiration = 'n/a';
      } else if (!row.parsedExpiration && exactExpiration) {
        match.matchDetails = 'CSV has no exp';
        match.dbExpiration = formatDate(exactExpiration);
      }
    } else {
      // No exact match - check for group match
      const courseGroup = courseToGroup.get(row.courseId);

      if (courseGroup) {
        // Course is in an enabled group - check if employee has any course from this group
        const groupCourses = groupToCourses.get(courseGroup.groupId);

        if (groupCourses) {
          let foundGroupMatch = false;
          let matchedCourseId = '';
          let matchedExpiration: Date | null = null;

          for (const groupCourseId of groupCourses) {
            const groupKey = `${employeeId}-${groupCourseId}`;
            if (trainingMap.has(groupKey)) {
              foundGroupMatch = true;
              const exp = trainingMap.get(groupKey);
              // Keep the one with latest expiration
              if (!matchedExpiration || (exp && exp > matchedExpiration)) {
                matchedCourseId = groupCourseId;
                matchedExpiration = exp;
              }
            }
          }

          if (foundGroupMatch) {
            match.status = 'Group Match';
            match.matchDetails = `Has ${matchedCourseId} (${courseGroup.groupCode})`;
            groupCount++;

            // Check if expiration dates differ
            if (row.parsedExpiration && matchedExpiration) {
              if (!datesMatch(row.parsedExpiration, matchedExpiration)) {
                match.matchDetails += ', Different Exp';
                match.dbExpiration = formatDate(matchedExpiration);
              }
            }
          } else {
            notFoundCount++;
          }
        } else {
          notFoundCount++;
        }
      } else {
        notFoundCount++;
      }
    }

    results.push({ row, match });
  }

  console.log(`\nProcessed ${results.length} rows`);
  console.log(`  Exact Match: ${exactCount}`);
  console.log(`  Group Match: ${groupCount}`);
  console.log(`  Not Found: ${notFoundCount}`);
  console.log(`  Employee Not Found: ${employeeNotFoundCount}`);

  // Create Excel workbook
  console.log('\nGenerating Excel file...');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Course Compare');

  // Headers
  const headers = [
    'Requirement',
    'Associate',
    'Current Status',
    'Expire Date',
    'Match Status',
    'Match Details',
    'DB Expiration'
  ];

  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4788' }
  };

  // Column widths
  sheet.columns = [
    { width: 70 },  // Requirement
    { width: 25 },  // Associate
    { width: 15 },  // Current Status
    { width: 12 },  // Expire Date
    { width: 18 },  // Match Status
    { width: 30 },  // Match Details
    { width: 15 }   // DB Expiration
  ];

  // Add data rows
  for (const { row, match } of results) {
    const dataRow = sheet.addRow([
      row.requirement,
      row.associate,
      row.status,
      row.expireDate,
      match.status,
      match.matchDetails,
      match.dbExpiration
    ]);

    // Color-code the Match Status column
    const statusCell = dataRow.getCell(5);
    switch (match.status) {
      case 'Exact Match':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD4EDDA' }  // Light green
        };
        break;
      case 'Group Match':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE2D5F1' }  // Light purple
        };
        break;
      case 'Not Found':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8D7DA' }  // Light red
        };
        break;
      case 'Employee Not Found':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF3CD' }  // Light yellow
        };
        break;
    }

    // Highlight if there's a date difference
    if (match.matchDetails.includes('Different Exp')) {
      dataRow.getCell(6).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF3CD' }  // Light yellow
      };
      dataRow.getCell(7).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF3CD' }  // Light yellow
      };
    }
  }

  // Add borders
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Add summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [{ width: 30 }, { width: 15 }];

  const summaryData = [
    ['Course Compare Report Summary', ''],
    ['', ''],
    ['Total Records', results.length],
    ['', ''],
    ['Match Status', 'Count'],
    ['Exact Match', exactCount],
    ['Group Match', groupCount],
    ['Not Found', notFoundCount],
    ['Employee Not Found', employeeNotFoundCount],
    ['', ''],
    ['Date Tolerance', `${DATE_TOLERANCE_DAYS} days`],
    ['', ''],
    ['Generated', new Date().toLocaleString()]
  ];

  summaryData.forEach((rowData, idx) => {
    const row = summarySheet.addRow(rowData);
    if (idx === 0) {
      row.font = { bold: true, size: 14 };
    } else if (idx === 4) {
      row.font = { bold: true };
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4788' }
      };
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }
  });

  // Save the file
  const filename = `course-compare-report-${new Date().toISOString().split('T')[0]}.xlsx`;
  await workbook.xlsx.writeFile(filename);
  console.log(`\n✓ Excel file created: ${filename}`);
}

generateReport()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  });
