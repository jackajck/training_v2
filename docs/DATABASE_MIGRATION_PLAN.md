# Training Tracker Database Migration Plan

## Table of Contents
1. [Current State](#current-state)
2. [Problems with Current Structure](#problems-with-current-structure)
3. [New Database Structure](#new-database-structure)
4. [How Tables Link Together](#how-tables-link-together)
5. [Data Sources](#data-sources)
6. [Migration Strategy](#migration-strategy)
7. [Key Concepts](#key-concepts)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Benefits of New Structure](#benefits-of-new-structure)

---

## Current State

The current Training Tracker uses a **single-table architecture** with the `project_zeus` table:

| Column | Type | Description |
|--------|------|-------------|
| `EMPLID` | varchar | Employee badge ID |
| `NAME` | varchar | Employee name |
| `REQUIREMENT` | varchar/bigint | Training course requirement ID |
| `NAME.1` | varchar | Training course name |
| `EFFECTIVE_DATE` | timestamp | Date training was completed |
| `ExpirationDate` | timestamp | Date training expires |
| `DURATION` | integer | Validity period in months |
| `SEQUENCE` | integer | Record sequence number |
| `employee_is_active` | boolean | Employee active/inactive status |
| `course_is_active` | boolean | Course active/inactive status |

### Current Data Structure
- Each employee has multiple rows (one per training certification)
- All data is denormalized (employee info repeated on every row)
- No job-based logic (can't determine required courses per job)
- No course relationship tracking

---

## Problems with Current Structure

1. **No job-based requirements**: Can't automatically determine which courses are required for specific roles (e.g., "All welders need these 10 courses")

2. **Data redundancy**: Employee name and info repeated on every training record row

3. **No course relationships**: Can't track if one course supersedes another

4. **Limited flexibility**: Hard to add new features like:
   - Job title changes
   - Course requirement updates
   - Organizational hierarchy

5. **Data came from export**: Built from Collins training data export during company separation, lacks underlying business logic

---

## New Database Structure

### Table 1: `employees`
Stores unique employee records.

| Column | Type | Description |
|--------|------|-------------|
| `badge_id` | varchar (PK) | Employee badge ID (formerly EMPLID) |
| `employee_name` | varchar | Employee full name |
| `job_id` | integer (FK) | Links to jobs table |
| `is_active` | boolean | Active/inactive status |

**Primary Key**: `badge_id`
**Foreign Key**: `job_id` references `jobs(job_id)`

---

### Table 2: `courses`
Stores all available training courses.

| Column | Type | Description |
|--------|------|-------------|
| `course_id` | varchar (PK) | Course requirement ID (formerly REQUIREMENT) |
| `course_name` | varchar | Course name |
| `course_description` | text | Course description |
| `duration_months` | integer | Validity period (0 = non-expiring) |
| `is_active` | boolean | Active/inactive status |

**Primary Key**: `course_id`

---

### Table 3: `jobs`
Stores job titles/positions.

| Column | Type | Description |
|--------|------|-------------|
| `job_id` | integer (PK) | Unique job identifier |
| `job_name` | varchar | Job title (e.g., "Welder", "Manager") |
| `is_active` | boolean | Active/inactive status |

**Primary Key**: `job_id` (auto-increment)

---

### Table 4: `job_courses` (Junction Table)
Defines which courses are required for each job.

| Column | Type | Description |
|--------|------|-------------|
| `job_id` | integer (FK) | Links to jobs table |
| `course_id` | varchar (FK) | Links to courses table |

**Primary Key**: Composite (`job_id`, `course_id`)
**Foreign Keys**:
- `job_id` references `jobs(job_id)`
- `course_id` references `courses(course_id)`

**Purpose**: Maps many-to-many relationship between jobs and courses.

---

### Table 5: `employee_training`
Historical record of completed training.

| Column | Type | Description |
|--------|------|-------------|
| `training_id` | integer (PK) | Unique training record ID |
| `employee_id` | varchar (FK) | Employee who completed training |
| `course_id` | varchar (FK) | Course that was completed |
| `completion_date` | timestamp | When training was completed |
| `expiration_date` | timestamp | When training expires (NULL if non-expiring) |

**Primary Key**: `training_id` (auto-increment)
**Foreign Keys**:
- `employee_id` references `employees(badge_id)`
- `course_id` references `courses(course_id)`

**Purpose**: Tracks what training each employee has actually completed.

---

## How Tables Link Together

```
employees
   ↓ (many-to-one)
jobs ←→ job_courses ←→ courses
              ↑
              | (defines requirements)
              |
   employee_training (tracks completions)
         ↓
      courses
```

### Relationship Details

1. **Employee → Job**: Many-to-one
   - Many employees can have the same job title
   - Each employee has one current job
   - Example: 50 welders all have `job_id = 5`

2. **Job → Courses**: Many-to-many (via `job_courses`)
   - One job requires multiple courses
   - One course can be required by multiple jobs
   - Example: "Safety Training" required for both Welders and Managers

3. **Employee → Training Records**: One-to-many (via `employee_training`)
   - One employee has many training completion records
   - Example: John Smith has completed 15 different courses over his career

4. **Course → Training Records**: One-to-many
   - One course appears in many employee training records
   - Example: "Safety Training" completed by 200 employees

### Example Queries

**What courses does a Welder need?**
```sql
SELECT courses.*
FROM job_courses
JOIN courses ON job_courses.course_id = courses.course_id
WHERE job_courses.job_id = 5;  -- Welder job_id
```

**What courses has John Smith completed?**
```sql
SELECT courses.*, employee_training.completion_date, employee_training.expiration_date
FROM employee_training
JOIN courses ON employee_training.course_id = courses.course_id
WHERE employee_training.employee_id = '12345';  -- John's badge_id
```

**What courses does John still need?**
```sql
-- Get required courses for John's job
SELECT courses.*
FROM employees
JOIN job_courses ON employees.job_id = job_courses.job_id
JOIN courses ON job_courses.course_id = courses.course_id
WHERE employees.badge_id = '12345'
-- Exclude courses John has already completed
AND courses.course_id NOT IN (
    SELECT course_id
    FROM employee_training
    WHERE employee_id = '12345'
);
```

**What jobs require "Safety Training"?**
```sql
SELECT jobs.*
FROM job_courses
JOIN jobs ON job_courses.job_id = jobs.job_id
WHERE job_courses.course_id = 'SAFE101';
```

---

## Data Sources

### 1. 700-Sheet Excel File
- **Contents**: Job titles, job IDs, required courses per job
- **Structure**: Each sheet has tables with keyword markers
  - "employee" in column F marks start of job table
  - Tables below contain required courses for that job
- **Challenge**: Inconsistent positioning, ~700 sheets to parse
- **Provides data for**:
  - `jobs` table (job_id, job_name)
  - `courses` table (course_id, course_name, course_description) - **no duration**
  - `job_courses` junction table (which jobs require which courses)

### 2. project_zeus.csv (Historical Training Log)
- **Contents**: All training completions from old system
- **Columns**: EMPLID, NAME, REQUIREMENT, NAME.1, EFFECTIVE_DATE, ExpirationDate, DURATION, etc.
- **Provides data for**:
  - `employee_training` table (historical completions)
  - `courses` table (duration_months by matching REQUIREMENT → course_id)

### 3. Employee CSV
- **Contents**: Current employee list with badge IDs, names, job assignments
- **Structure**: Simple table with badge_id, name, job_id
- **Provides data for**:
  - `employees` table (badge_id, employee_name, job_id)

---

## Migration Strategy

### Script 1: Parse 700-Sheet Excel → Build Job/Course Structure

**Input**: Giant Excel file with 700+ sheets

**Process**:
1. Loop through each sheet
2. Search for keyword markers (e.g., "employee" in column F)
3. Extract job information (job_id, job_name)
4. Extract tables below markers showing required courses
5. Build unique list of courses (course_id, course_name, description)
6. Build job-to-course mappings

**Output**:
- Populate `jobs` table
- Populate `courses` table (without duration_months yet)
- Populate `job_courses` junction table

**Challenges**:
- Variable table positioning across sheets
- Some sheets have multiple tables
- Need robust keyword detection
- Handle edge cases and malformed data

**Technology**: Python with pandas, openpyxl

---

### Script 2: Process project_zeus.csv → Add Duration + Training History

**Input**: project_zeus.csv (historical training log)

**Process**:
1. Read CSV file
2. For each unique REQUIREMENT (course_id):
   - Match to existing course in `courses` table
   - UPDATE `duration_months` with DURATION value from CSV
3. For each row in CSV:
   - Map EMPLID → employee_id (badge_id)
   - Map REQUIREMENT → course_id
   - INSERT into `employee_training` table with completion and expiration dates

**Output**:
- UPDATE `courses` table (add duration_months)
- Populate `employee_training` table (all historical completions)

**Notes**:
- All courses will have duration because duration exists independently of completion
- This enriches the course data from Script 1
- Creates complete training history for all employees

**Technology**: Python with pandas, psycopg2 or SQLAlchemy

---

### Script 3: Upload Employee CSV → Create Employee Records

**Input**: Employee CSV (badge_id, name, job_id)

**Process**:
1. Read employee CSV
2. INSERT each row into `employees` table
3. Validate job_id references exist in `jobs` table

**Output**:
- Populate `employees` table

**Notes**:
- Simplest of the three scripts
- Straightforward CSV → database import
- Set `is_active = true` by default

**Technology**: Python with pandas, psycopg2 or SQLAlchemy

---

### Migration Execution Order

**Order matters! Run scripts in this sequence:**

1. **Script 1 first** - Creates base structure (jobs, courses, job_courses)
2. **Script 2 second** - Enriches courses with duration + adds training history
3. **Script 3 last** - Adds employees (requires jobs to exist for foreign key)

### Post-Migration Validation

After running all scripts, validate:

1. **Data counts**:
   - Number of employees matches employee CSV
   - Number of courses reasonable (~700-ish based on Excel sheets)
   - Number of jobs extracted correctly
   - Training records match project_zeus.csv row count

2. **Relationship integrity**:
   - All employees have valid job_id (or NULL if unknown)
   - All job_courses entries reference existing jobs and courses
   - All employee_training entries reference existing employees and courses

3. **Sample data checks**:
   - Pick a known employee, verify their training records migrated correctly
   - Pick a known job (e.g., Welder), verify required courses are correct
   - Check courses have correct duration values from Zeus CSV

4. **Edge cases**:
   - Non-expiring courses (duration = 0)
   - NULL expiration dates handled correctly
   - Inactive employees/courses marked appropriately

---

## Key Concepts

### Junction Tables Explained

**Problem**: How do you represent a many-to-many relationship?

**Bad Approach** (storing arrays):
```
jobs table:
job_id | job_name | required_courses
5      | Welder   | [101, 102, 103, 205, 301]  ← array
```

Issues:
- Can't easily query "which jobs need course 101?"
- Can't add metadata (is course required or optional?)
- Database can't enforce relationships
- Updating is messy

**Good Approach** (junction table):
```
jobs table:
job_id | job_name
5      | Welder
6      | Manager

courses table:
course_id | course_name
101       | Safety Training
102       | Welding Basics

job_courses table (JUNCTION):
job_id | course_id
5      | 101        ← Welders need Safety
5      | 102        ← Welders need Welding
6      | 101        ← Managers need Safety
```

Benefits:
- Easy queries in both directions
- Simple add/remove operations (one row)
- No data duplication
- Can add extra columns later (e.g., `is_required`, `priority`)

### Required vs. Completed Courses

**Required Courses** (what employee SHOULD have):
- Look up employee's current `job_id`
- Query `job_courses` for that job_id
- Result: "If you're a Welder, you need these 10 courses"

**Completed Courses** (what employee HAS done):
- Query `employee_training` for that employee_id
- Shows all courses completed with dates

**Missing Courses** (gap analysis):
- Required courses MINUS completed courses
- Shows what employee still needs

**Expiring Courses**:
- Query `employee_training` where `expiration_date` is approaching
- These need renewal

### Job Changes and Historical Data

**Scenario**: Employee was a Welder (10 welding courses), now promoted to Manager

**What happens**:
1. Update `employees.job_id` from Welder → Manager
2. System now checks Manager requirements (from `job_courses`)
3. Employee's old welding training stays in `employee_training` (historical record)
4. Old courses they don't need anymore become irrelevant
5. System identifies new courses they need for Manager role

**Key insight**: Historical training is preserved, but current requirements are based on current job. Old certifications don't get deleted, they just stop being relevant.

---

## Implementation Roadmap

### Phase 1: Migration Scripts Development
**Goal**: Build the three migration scripts

**Tasks**:
1. Set up development environment
   - Python 3.x
   - Libraries: pandas, openpyxl, psycopg2/SQLAlchemy
   - Neon database connection

2. Create database schema in Neon
   - Write SQL to create all 5 tables
   - Set up primary keys, foreign keys, indexes
   - Test constraints

3. Build Script 1: Excel Parser
   - Read Excel file with 700 sheets
   - Develop keyword detection logic
   - Extract jobs, courses, job_courses
   - Handle edge cases
   - Write to database
   - Add logging and error handling

4. Build Script 2: Zeus CSV Processor
   - Read project_zeus.csv
   - Update course durations
   - Create training history records
   - Handle NULL values for non-expiring courses
   - Add logging and error handling

5. Build Script 3: Employee CSV Uploader
   - Read employee CSV
   - Insert into employees table
   - Validate foreign keys
   - Add logging and error handling

**Deliverables**:
- 3 working Python scripts
- Database schema created in Neon
- Documentation for running scripts

---

### Phase 2: Data Migration
**Goal**: Populate Neon database with all data

**Tasks**:
1. Backup current `project_zeus` table
2. Run Script 1 (Excel → jobs/courses/job_courses)
3. Validate Script 1 output
4. Run Script 2 (Zeus CSV → durations + training history)
5. Validate Script 2 output
6. Run Script 3 (Employee CSV → employees)
7. Validate Script 3 output
8. Run comprehensive validation queries

**Deliverables**:
- Fully populated database
- Validation report
- List of any data issues found

---

### Phase 3: Validation & Testing
**Goal**: Ensure data integrity and correctness

**Tasks**:
1. Count validation (record counts match sources)
2. Relationship validation (all foreign keys valid)
3. Sample data spot checks (pick random employees/jobs)
4. Edge case verification (non-expiring courses, inactive records)
5. Query testing (test all common queries work)
6. Performance testing (ensure queries are fast enough)

**Deliverables**:
- Validation checklist
- List of issues found and resolved
- Performance baseline metrics

---

### Phase 4: Web Application Development
**Goal**: Build new UI on top of clean database structure

**Features to Build**:
1. **Employee Management**
   - Add/edit/delete employees
   - Assign job titles
   - Toggle active/inactive status
   - View employee training history
   - See what courses are missing

2. **Course Management**
   - Add/edit/delete courses
   - Set course details (name, description, duration)
   - Toggle active/inactive status
   - View which jobs require each course

3. **Job Management**
   - Add/edit/delete jobs
   - Assign/remove required courses for jobs
   - View all employees in a job
   - Toggle active/inactive status

4. **Training Assignment**
   - Assign training to employees
   - Bulk assignment by job title
   - Record completion dates
   - Calculate expiration dates automatically

5. **Reporting & Dashboards**
   - Expiring training dashboard (carry over from current app)
   - Gap analysis (who needs what training)
   - Compliance reports by job
   - Training history reports

**Technology**:
- Continue using Next.js, TypeScript, Tailwind CSS
- Update Drizzle ORM schema for new tables
- Rewrite API routes for new structure
- Redesign UI pages as needed

**Deliverables**:
- Updated web application
- All CRUD operations functional
- Migration from old UI complete

---

### Phase 5: Cutover & Decommission Old System
**Goal**: Switch to new system, retire old structure

**Tasks**:
1. Final data sync (any changes since migration)
2. User acceptance testing
3. Deploy updated application
4. Archive old `project_zeus` table (keep as backup)
5. Update documentation
6. Train users on new features

**Deliverables**:
- Live production system on new database structure
- Old data archived
- User documentation updated

---

## Benefits of New Structure

### 1. Job-Based Course Requirements
- **Before**: Couldn't determine what courses a job needs
- **After**: Each job has defined required courses via `job_courses`

### 2. Easy Job Changes
- **Before**: Manual tracking when employee changes roles
- **After**: Update one field (`employees.job_id`), system automatically knows new requirements

### 3. Course Management
- **Before**: Hard to see which jobs require a course
- **After**: Query `job_courses` to see all jobs requiring any course

### 4. Historical Data Preserved
- **Before**: Old training data mixed with current in single table
- **After**: `employee_training` is pure historical record, current requirements determined by job

### 5. No Data Redundancy
- **Before**: Employee name repeated on every training record row
- **After**: Employee info stored once in `employees` table

### 6. Flexible Reporting
- **Before**: Complex queries on denormalized data
- **After**: Simple JOINs across normalized tables

### 7. Easy CRUD Operations
- **Add employee**: One INSERT into `employees`
- **Add course to job**: One INSERT into `job_courses`
- **Change job requirements**: UPDATE rows in `job_courses`
- **Toggle inactive**: UPDATE one field, affects all related data

### 8. Scalability
- **Before**: Single huge table gets slower as data grows
- **After**: Indexed tables with relationships scale better

### 9. Data Integrity
- **Before**: No enforcement of relationships
- **After**: Foreign keys ensure data consistency

### 10. Future Features Enabled
- Course prerequisites
- Course superseding (e.g., "Welding 2.0" replaces "Welding 1.0")
- Organizational hierarchy
- Multi-site support
- Advanced reporting

---

## Next Steps

### Immediate
1. ✅ Review and approve this database design
2. ⏳ Create Neon database schema (SQL scripts)
3. ⏳ Set up Python development environment
4. ⏳ Start building Script 1 (Excel parser)

### Short Term
5. Complete all three migration scripts
6. Test scripts on sample data
7. Run full migration

### Medium Term
8. Validate migrated data
9. Begin web application updates
10. User testing

### Long Term
11. Launch new system
12. Decommission old structure
13. Add new features enabled by better structure

---

## Questions & Decisions

### Resolved
- ✅ Use `badge_id` as primary key in employees (no separate employee_id)
- ✅ Junction table approach for job-courses (not arrays)
- ✅ Separate migration into 3 scripts by data source
- ✅ Duration comes from project_zeus.csv, not Excel

### Open Questions
- ⏳ What should happen when a course is deleted that exists in training history?
- ⏳ Should there be a "notes" field on employee_training?
- ⏳ Do courses need versioning? (e.g., "Safety Training 2024" vs "Safety Training 2025")
- ⏳ Should inactive employees/courses be soft-deleted or hard-deleted?

---

## Appendix: SQL Schema

```sql
-- Create jobs table
CREATE TABLE jobs (
    job_id SERIAL PRIMARY KEY,
    job_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Create courses table
CREATE TABLE courses (
    course_id VARCHAR(50) PRIMARY KEY,
    course_name VARCHAR(255) NOT NULL,
    course_description TEXT,
    duration_months INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- Create employees table
CREATE TABLE employees (
    badge_id VARCHAR(50) PRIMARY KEY,
    employee_name VARCHAR(255) NOT NULL,
    job_id INTEGER REFERENCES jobs(job_id),
    is_active BOOLEAN DEFAULT TRUE
);

-- Create job_courses junction table
CREATE TABLE job_courses (
    job_id INTEGER REFERENCES jobs(job_id) ON DELETE CASCADE,
    course_id VARCHAR(50) REFERENCES courses(course_id) ON DELETE CASCADE,
    PRIMARY KEY (job_id, course_id)
);

-- Create employee_training table
CREATE TABLE employee_training (
    training_id SERIAL PRIMARY KEY,
    employee_id VARCHAR(50) REFERENCES employees(badge_id) ON DELETE CASCADE,
    course_id VARCHAR(50) REFERENCES courses(course_id),
    completion_date TIMESTAMP NOT NULL,
    expiration_date TIMESTAMP,
    UNIQUE (employee_id, course_id, completion_date)
);

-- Create indexes for common queries
CREATE INDEX idx_employees_job_id ON employees(job_id);
CREATE INDEX idx_employee_training_employee_id ON employee_training(employee_id);
CREATE INDEX idx_employee_training_course_id ON employee_training(course_id);
CREATE INDEX idx_employee_training_expiration ON employee_training(expiration_date);
CREATE INDEX idx_job_courses_job_id ON job_courses(job_id);
CREATE INDEX idx_job_courses_course_id ON job_courses(course_id);
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-08
**Author**: Training Tracker Migration Team
