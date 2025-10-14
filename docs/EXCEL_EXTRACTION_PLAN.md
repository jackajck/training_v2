# Excel Extraction Plan - 700 Sheet Parser

## Overview

This document outlines the strategy for parsing a massive Excel file containing ~700 sheets that define job-to-course requirements. This is **Script 1** from the Database Migration Plan.

---

## Excel File Structure

### File Characteristics
- **Total sheets**: ~700 sheets
- **Organization**: Each sheet groups jobs that need similar courses
- **Common pattern**: Multiple jobs → one course (90% of sheets)
- **Exception pattern**: Multiple jobs → multiple courses (10% of sheets)

### Typical Sheet Layout

```
Rows 1-14/20:  [Junk data - varies by sheet, ignore]
...
Row X, Column F: "job description" ← MARKER 1
Row X+1:         Job 1 (columns A-F: job_id, job_name, other data)
Row X+2:         Job 2
Row X+3:         Job 3
Row X+4:         Job 4
Row X+5:         Job 5
Row X+6:         [BLANK ROW]
Row X+7, Column F: "courses" or "required courses" ← MARKER 2
Row X+8:         Course ABC (columns A-F: course_name, reference_number/course_id, description, other data)
Row X+9:         Course DEF (some sheets have multiple)
Row X+10:        Course GHI
```

### Key Patterns

1. **Junk rows at top**: First ~14-20 rows contain metadata, titles, etc. - not consistent across sheets, so can't rely on row numbers

2. **Job section marker**: Column F contains "job description" (or similar text - need to confirm exact wording)

3. **Job table**:
   - Starts after marker row
   - Columns A-F contain job data
   - Key columns: job_id, job_name
   - Other columns contain data we don't need
   - Continues until blank row

4. **Blank row separator**: One completely blank row separates jobs from courses

5. **Course section marker**: After blank row, column F contains "courses" or "required courses"

6. **Course table**:
   - Starts after marker row
   - Columns A-F contain course data
   - Key columns: course_name, reference_number (course_id), description
   - Other columns contain data we don't need
   - Usually 1 course, sometimes multiple
   - Continues until end of data or next blank section

### Sheet Logic

**Each sheet represents**: "These jobs need these courses"

**Example Sheet 1** (Safety Training):
- Jobs: Welder, Fitter, Assembler, Inspector
- Course: Safety Training SPPIVT
- **Result**: All 4 jobs need Safety Training

**Example Sheet 55** (Blueprint Reading):
- Jobs: Welder, Engineer, Designer
- Course: Blueprint Reading SPPIVT
- **Result**: All 3 jobs need Blueprint Reading

**Example Sheet 200** (Vision Testing):
- Jobs: Quality Inspector, Final Inspector
- Courses: Vision Test Basic, Vision Test Advanced
- **Result**: Both jobs need both vision courses

### Cross-Sheet Job Aggregation

**Critical insight**: Same job appears on multiple sheets

Example - "Welder" job might appear on:
- Sheet 1: Safety Training
- Sheet 23: Welding Certification
- Sheet 55: Blueprint Reading
- Sheet 89: Hazmat Awareness
- Sheet 120: First Aid

**Final result**: Welder job requires ALL 5 courses

---

## Data To Extract

### From Each Sheet

1. **Jobs** (from job section):
   - `job_id` - Unique identifier
   - `job_name` - Job title
   - Ignore other columns

2. **Courses** (from course section):
   - `course_id` - Reference number / requirement ID
   - `course_name` - Course title
   - `course_description` - Course description (if available)
   - Ignore other columns
   - **Note**: Duration NOT in Excel - comes from project_zeus.csv later

3. **Job-Course Mappings**:
   - For each job on sheet + each course on sheet → create mapping
   - Store as (job_id, course_id) tuple

### Aggregation Across All Sheets

After processing all sheets:

1. **Unique Jobs**: De-duplicate jobs by job_id
   - If same job_id appears on multiple sheets, keep one record
   - Job name should be consistent across sheets (validate this)

2. **Unique Courses**: De-duplicate courses by course_id
   - If same course_id appears on multiple sheets, keep one record
   - Course name/description should be consistent (validate this)

3. **All Job-Course Mappings**: De-duplicate mappings
   - Remove duplicate (job_id, course_id) pairs
   - Result: Complete list of which jobs need which courses

---

## Extraction Algorithm

### High-Level Flow

```python
# Initialize storage
all_jobs = {}           # {job_id: {name, ...}}
all_courses = {}        # {course_id: {name, description, ...}}
job_course_mappings = set()  # {(job_id, course_id), ...}

# Process each sheet
for sheet in workbook.sheets:
    try:
        # Step 1: Find job section marker
        job_marker_row = find_marker_in_column(sheet, column='F',
                                                keywords=['job description', 'job descriptions'])

        # Step 2: Extract jobs until blank row
        jobs_on_sheet = extract_jobs(sheet, start_row=job_marker_row + 1)

        # Step 3: Find course section marker (after blank row)
        course_marker_row = find_marker_in_column(sheet, column='F',
                                                   keywords=['courses', 'required courses'],
                                                   start_from=job_marker_row + len(jobs_on_sheet) + 2)

        # Step 4: Extract courses until end
        courses_on_sheet = extract_courses(sheet, start_row=course_marker_row + 1)

        # Step 5: Store unique jobs and courses
        for job in jobs_on_sheet:
            all_jobs[job['job_id']] = job

        for course in courses_on_sheet:
            all_courses[course['course_id']] = course

        # Step 6: Create all job-course mappings for this sheet
        for job in jobs_on_sheet:
            for course in courses_on_sheet:
                job_course_mappings.add((job['job_id'], course['course_id']))

        print(f"✓ Sheet '{sheet.name}': {len(jobs_on_sheet)} jobs, {len(courses_on_sheet)} courses")

    except Exception as e:
        print(f"✗ Error processing sheet '{sheet.name}': {e}")
        # Log and continue to next sheet

# Write results to database
write_jobs_to_db(all_jobs)
write_courses_to_db(all_courses)
write_job_courses_to_db(job_course_mappings)

print(f"\nTotal: {len(all_jobs)} unique jobs, {len(all_courses)} unique courses, {len(job_course_mappings)} mappings")
```

### Helper Functions

#### 1. Find Marker in Column

```python
def find_marker_in_column(sheet, column, keywords, start_from=1):
    """
    Searches column for any of the keywords (case-insensitive).
    Returns row number where found.
    """
    col_idx = column_letter_to_index(column)  # 'F' -> 5

    for row_idx in range(start_from, sheet.max_row + 1):
        cell_value = sheet.cell(row_idx, col_idx).value

        if cell_value and isinstance(cell_value, str):
            cell_lower = cell_value.lower().strip()
            for keyword in keywords:
                if keyword.lower() in cell_lower:
                    return row_idx

    raise ValueError(f"Marker not found in column {column}")
```

#### 2. Extract Jobs

```python
def extract_jobs(sheet, start_row):
    """
    Extracts job records from start_row until blank row.
    Returns list of job dictionaries.
    """
    jobs = []
    current_row = start_row

    while current_row <= sheet.max_row:
        # Check if row is blank (all cells in A-F are empty)
        if is_row_blank(sheet, current_row, col_range=('A', 'F')):
            break

        # Extract job data from columns A-F
        job_id = sheet.cell(current_row, 1).value  # Column A (adjust as needed)
        job_name = sheet.cell(current_row, 2).value  # Column B (adjust as needed)

        # Skip if essential data is missing
        if not job_id or not job_name:
            current_row += 1
            continue

        jobs.append({
            'job_id': str(job_id).strip(),
            'job_name': str(job_name).strip()
        })

        current_row += 1

    return jobs
```

#### 3. Extract Courses

```python
def extract_courses(sheet, start_row):
    """
    Extracts course records from start_row until end of data.
    Returns list of course dictionaries.
    """
    courses = []
    current_row = start_row

    while current_row <= sheet.max_row:
        # Check if row is blank
        if is_row_blank(sheet, current_row, col_range=('A', 'F')):
            break

        # Extract course data from columns A-F
        course_name = sheet.cell(current_row, 1).value  # Column A (adjust)
        course_id = sheet.cell(current_row, 2).value  # Column B (adjust) - reference number
        course_desc = sheet.cell(current_row, 3).value  # Column C (adjust)

        # Skip if essential data is missing
        if not course_id:
            current_row += 1
            continue

        courses.append({
            'course_id': str(course_id).strip(),
            'course_name': str(course_name).strip() if course_name else '',
            'course_description': str(course_desc).strip() if course_desc else ''
        })

        current_row += 1

    return courses
```

#### 4. Check if Row is Blank

```python
def is_row_blank(sheet, row_idx, col_range):
    """
    Checks if all cells in specified column range are empty.
    col_range: tuple like ('A', 'F')
    """
    start_col = column_letter_to_index(col_range[0])
    end_col = column_letter_to_index(col_range[1])

    for col_idx in range(start_col, end_col + 1):
        cell_value = sheet.cell(row_idx, col_idx).value
        if cell_value is not None and str(cell_value).strip():
            return False

    return True
```

---

## Edge Cases & Error Handling

### Expected Issues

1. **Marker not found**: Some sheets might not have "job description" or "courses" in column F
   - Solution: Try multiple keyword variations
   - Log sheets that fail and review manually

2. **Inconsistent column positions**: Job ID might be in column A on some sheets, column B on others
   - Solution: After getting actual file, determine if columns are consistent
   - May need to search for data in multiple columns

3. **Malformed data**: Empty cells, merged cells, unexpected formatting
   - Solution: Robust null checking, skip rows with missing critical data
   - Log warnings for data quality issues

4. **Duplicate mappings within sheet**: Same job listed multiple times on one sheet
   - Solution: De-duplicate within sheet processing
   - Shouldn't affect final result since we use set() for mappings

5. **Inconsistent job names**: "Welder" vs "WELDER" vs "Welder I"
   - Solution: Use job_id as primary key, not job_name
   - Validate that same job_id always has same job_name (or pick first occurrence)

6. **Missing courses**: Sheet has jobs but no course section
   - Solution: Log warning, skip sheet
   - May indicate sheet should be ignored

7. **Multiple tables per sheet**: More complex structure than expected
   - Solution: After reviewing actual file, adjust algorithm
   - May need to search for multiple occurrences of markers

### Validation Checks

After extraction, validate:

1. **Job counts reasonable**: ~50-200 unique jobs expected?
2. **Course counts match sheets**: ~700 courses if ~700 sheets
3. **No empty IDs**: All jobs and courses have IDs
4. **Mapping counts reasonable**: Thousands of mappings expected
5. **Sample spot checks**: Pick known job, verify courses make sense

### Logging Strategy

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('excel_extraction.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# In code:
logger.info(f"Processing sheet: {sheet.name}")
logger.warning(f"Missing course marker on sheet: {sheet.name}")
logger.error(f"Failed to process sheet {sheet.name}: {error}")
```

---

## Technology Stack

### Required Libraries

```bash
pip install openpyxl pandas psycopg2-binary python-dotenv
```

### Library Usage

- **openpyxl**: Read Excel file (.xlsx format)
  - Low-level access to cells, rows, columns
  - Good for custom parsing logic

- **pandas**: Optional, for data manipulation
  - Can use if table structure becomes more predictable

- **psycopg2**: PostgreSQL database connection
  - Insert extracted data into Neon database

- **python-dotenv**: Load database credentials from .env file

### Alternative: XlsxWriter
If file is .xls (old format), may need `xlrd` library instead of `openpyxl`

---

## Script Structure

### File: `extract_excel_to_db.py`

```python
#!/usr/bin/env python3
"""
Script 1: Excel Extraction
Parses 700-sheet Excel file and populates jobs, courses, and job_courses tables.
"""

import openpyxl
import psycopg2
from psycopg2.extras import execute_batch
import logging
from pathlib import Path
import os
from dotenv import load_dotenv

# Configuration
load_dotenv()
DATABASE_URL = os.getenv('DATABASE_URL')
EXCEL_FILE_PATH = 'path/to/700-sheet-file.xlsx'

# Setup logging
logging.basicConfig(...)
logger = logging.getLogger(__name__)

# Database connection
def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

# Helper functions
def find_marker_in_column(sheet, column, keywords, start_from=1):
    # Implementation...

def extract_jobs(sheet, start_row):
    # Implementation...

def extract_courses(sheet, start_row):
    # Implementation...

def is_row_blank(sheet, row_idx, col_range):
    # Implementation...

# Database write functions
def write_jobs_to_db(jobs_dict, conn):
    with conn.cursor() as cur:
        job_list = [(job_id, job_data['job_name'])
                    for job_id, job_data in jobs_dict.items()]
        execute_batch(cur,
            "INSERT INTO jobs (job_id, job_name) VALUES (%s, %s) ON CONFLICT (job_id) DO NOTHING",
            job_list
        )
    conn.commit()

def write_courses_to_db(courses_dict, conn):
    with conn.cursor() as cur:
        course_list = [(c_id, c_data['course_name'], c_data['course_description'])
                       for c_id, c_data in courses_dict.items()]
        execute_batch(cur,
            "INSERT INTO courses (course_id, course_name, course_description) VALUES (%s, %s, %s) ON CONFLICT (course_id) DO NOTHING",
            course_list
        )
    conn.commit()

def write_job_courses_to_db(mappings, conn):
    with conn.cursor() as cur:
        mapping_list = list(mappings)
        execute_batch(cur,
            "INSERT INTO job_courses (job_id, course_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            mapping_list
        )
    conn.commit()

# Main processing
def main():
    logger.info(f"Opening Excel file: {EXCEL_FILE_PATH}")
    workbook = openpyxl.load_workbook(EXCEL_FILE_PATH, read_only=True, data_only=True)

    all_jobs = {}
    all_courses = {}
    job_course_mappings = set()

    total_sheets = len(workbook.sheetnames)
    logger.info(f"Processing {total_sheets} sheets...")

    for idx, sheet_name in enumerate(workbook.sheetnames, 1):
        sheet = workbook[sheet_name]
        logger.info(f"[{idx}/{total_sheets}] Processing: {sheet_name}")

        try:
            # Extract data from this sheet
            job_marker_row = find_marker_in_column(sheet, 'F', ['job description', 'job descriptions'])
            jobs_on_sheet = extract_jobs(sheet, job_marker_row + 1)

            course_marker_row = find_marker_in_column(
                sheet, 'F',
                ['courses', 'required courses'],
                start_from=job_marker_row + len(jobs_on_sheet) + 2
            )
            courses_on_sheet = extract_courses(sheet, course_marker_row + 1)

            # Store unique records
            for job in jobs_on_sheet:
                all_jobs[job['job_id']] = job

            for course in courses_on_sheet:
                all_courses[course['course_id']] = course

            # Create mappings
            for job in jobs_on_sheet:
                for course in courses_on_sheet:
                    job_course_mappings.add((job['job_id'], course['course_id']))

            logger.info(f"  ✓ {len(jobs_on_sheet)} jobs, {len(courses_on_sheet)} courses")

        except Exception as e:
            logger.error(f"  ✗ Error: {e}")
            continue

    workbook.close()

    # Write to database
    logger.info("Writing to database...")
    conn = get_db_connection()

    write_jobs_to_db(all_jobs, conn)
    logger.info(f"  ✓ Inserted {len(all_jobs)} unique jobs")

    write_courses_to_db(all_courses, conn)
    logger.info(f"  ✓ Inserted {len(all_courses)} unique courses")

    write_job_courses_to_db(job_course_mappings, conn)
    logger.info(f"  ✓ Inserted {len(job_course_mappings)} job-course mappings")

    conn.close()
    logger.info("Done!")

if __name__ == '__main__':
    main()
```

---

## Testing Strategy

### Phase 1: Single Sheet Test
1. Copy one representative sheet to new Excel file
2. Run script on single-sheet file
3. Verify correct extraction
4. Adjust column mappings as needed

### Phase 2: Sample Sheets Test
1. Copy 10-20 diverse sheets to test file
2. Include edge cases (multiple courses, unusual formatting)
3. Run script and validate output
4. Check for duplicate handling

### Phase 3: Full File Test
1. Run on complete 700-sheet file
2. Monitor for errors/warnings
3. Review log file for any issues
4. Validate final counts

### Manual Validation
1. Pick 5 random jobs, verify their required courses make sense
2. Pick 5 random courses, verify which jobs need them
3. Check for any obvious missing data
4. Compare against known job requirements (ask domain expert)

---

## Timeline Estimate

- **Get actual file and analyze structure**: 1 hour
- **Write helper functions**: 2 hours
- **Write main processing loop**: 2 hours
- **Write database insertion logic**: 1 hour
- **Test on single sheet**: 1 hour
- **Debug and adjust**: 2-3 hours
- **Test on sample sheets**: 1 hour
- **Run full extraction**: 30 minutes
- **Validation**: 1 hour

**Total**: ~12-14 hours of development + testing

---

## Success Criteria

Script should:
- ✅ Process all 700 sheets without crashing
- ✅ Extract ~700 unique courses (approximate)
- ✅ Extract all unique jobs (likely 50-200)
- ✅ Create thousands of job-course mappings
- ✅ Handle blank rows correctly
- ✅ De-duplicate jobs and courses across sheets
- ✅ Log all errors and warnings
- ✅ Populate 3 database tables: jobs, courses, job_courses

---

## Next Steps After Extraction

Once this script completes:

1. ✅ Validate data quality in database
2. → Run **Script 2**: Process project_zeus.csv to add durations and training history
3. → Run **Script 3**: Upload employee data
4. → Build web application on top of populated database

---

## Open Questions (Needs Actual File)

- ⏳ Exact text of job section marker in column F?
- ⏳ Exact column positions for job_id and job_name?
- ⏳ Exact text of course section marker?
- ⏳ Exact column positions for course_id, course_name, course_description?
- ⏳ Are column positions consistent across all 700 sheets?
- ⏳ Any sheets with completely different structure?
- ⏳ File format: .xlsx or .xls?

**Action**: Get file tomorrow, analyze 5-10 sample sheets, update this document with exact details.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-08
**Status**: Awaiting actual Excel file for column mapping verification
