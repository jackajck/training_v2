# Training Tracker - Work Log

This document tracks significant changes and updates to the Training Tracker application. Use this log to understand what queries and features need to be aware of when adding new functionality.

---

## 2025-10-29: Position Inactive/Active Toggle Feature

### Overview
Added ability to toggle positions as inactive/active, similar to employees and courses. When a position is inactive, it means that position no longer exists in the organization and all associated training requirements become irrelevant.

### Business Logic
- **Active Position**: Position is currently in use, employees can be assigned to it, requirements are calculated
- **Inactive Position**: Position no longer exists in the organization
  - Employees who have this position assigned still keep the assignment
  - BUT the training requirements from this position are **completely ignored** in calculations
  - Position doesn't appear in search/add position workflows
  - Think of it as "this role is deprecated/no longer exists"

### Database
- Table: `positions`
- Column: `is_active` (boolean, already exists)
- Default: `true`

### Files Modified

#### 1. UI Changes
- **File**: `/app/jobs/page.tsx`
  - Added toggle switch next to position name in middle column
  - Toggle allows admin to activate/deactivate positions
  - Shows active status visually

#### 2. API Changes
- **File**: `/app/api/positions/toggle-active/route.ts` (NEW)
  - POST endpoint to toggle position active status
  - Updates `positions.is_active` column
  - Returns success/error response

#### 3. Query Updates - IMPORTANT FOR FUTURE REFERENCE

When working with positions, these queries need to respect `is_active`:

##### Queries that MUST filter inactive positions:
1. **Adding positions to employees** (`/app/api/positions/list/route.ts` when used in add-position modal)
   - Should only show `WHERE is_active = true`

2. **Employee requirements calculation** (`employee_required_courses` view or related queries)
   - Must exclude requirements from inactive positions
   - Join condition should include `AND positions.is_active = true`

##### Queries that SHOULD show all positions (active + inactive):
1. **Admin position management** (`/app/jobs/page.tsx`)
   - Shows all positions so admin can reactivate if needed

2. **Position details page - employees list** (`/app/jobs/page.tsx` right column)
   - When viewing a specific position, shows ALL employees who have that position
   - Even if position is inactive, you can still see who had it assigned

### Implementation Details

#### Toggle UI Pattern
Following the same pattern as employees and courses:
- Toggle switch on the right side of position header
- Green = Active, Red = Inactive
- Confirmation dialog before toggling
- Updates UI immediately after successful API call

#### API Endpoint Pattern
```typescript
POST /api/positions/toggle-active
Body: { position_id: string, is_active: boolean }
Returns: { success: boolean, message: string }
```

### Testing Checklist
- [ ] Toggle position to inactive
- [ ] Verify position doesn't appear when adding positions to employee
- [ ] Verify requirements from inactive position don't show in employee training list
- [ ] Verify position can be toggled back to active
- [ ] Verify requirements reappear when position reactivated

### Future Considerations

**Other areas that might need updates when working with positions:**
1. Reporting/metrics pages - should probably filter to active positions only
2. Bulk operations - consider whether to include inactive positions
3. Position search functionality - add filter option for active/inactive
4. Dashboard widgets showing position counts - clarify if showing active only
5. Any scheduled jobs or background tasks that process positions

**Note**: When adding new features that query positions, always consider:
- Should this feature respect `is_active`?
- Document the decision in this log
- Add comments in code explaining the choice

---

### Database View Status
**GOOD NEWS**: The `employee_required_courses` view (defined in `/python-migrations/schema_positions.sql:127`) **already filters** for active positions:
```sql
WHERE e.is_active = true AND p.is_active = true
```

This means any query using this view will automatically respect the position `is_active` status. No database changes needed!

### Verification Completed
- ✅ Database view `employee_required_courses` filters inactive positions
- ✅ Toggle UI added to `/app/jobs/page.tsx`
- ✅ API endpoint created at `/app/api/positions/toggle-active/route.ts`
- ✅ Positions list API updated to support `active_only` parameter
- ✅ Add position modal updated to only show active positions
- ✅ **UI Fix**: Employee details API now filters out inactive positions from display (`/app/api/employees/[badge_id]/route.ts:42`)

### Next Session TODO
- Test the feature end-to-end
- Consider adding audit log for position status changes
- Monitor for any edge cases in production

---

## 2025-10-29: Training Record Notes Feature

### Overview
Added ability to add optional notes/comments to training records when creating them.

### Database Changes
- **Table**: `employee_training`
- **New Column**: `notes TEXT` (nullable)
- **Migration**: `/python-migrations/add_notes_to_training.sql`
- **Migration Script**: `/new-application/scripts/add-notes-migration.ts` (already executed)

### Files Modified

#### 1. Database Migration
- **File**: `/python-migrations/add_notes_to_training.sql` (NEW)
- **File**: `/new-application/scripts/add-notes-migration.ts` (NEW)
- Added `notes` column to `employee_training` table
- Migration executed successfully

#### 2. API Changes
- **File**: `/app/api/employees/add-training/route.ts`
- Added `notes` parameter to request body
- Updated INSERT statement to include notes field
- Notes are optional (saved as null if not provided)

#### 3. UI Changes
- **File**: `/app/employees/page.tsx`
- Added `notes` field to `addTrainingForm` state
- Added textarea for notes in "Add Training" slide-out panel
- Textarea appears after expiration date field
- Includes placeholder text and helper text
- Notes are submitted with training record

### Usage
When adding a training record to an employee:
1. Select course
2. Enter completion date
3. Set duration/expiration
4. **NEW**: Optionally add notes/comments in the textarea
5. Submit training record

Notes are saved with the training record and can be used for:
- Recording where training was completed
- Adding context about the certification
- Noting special circumstances
- Any other relevant comments

### Accordion Table View (Added same session)
- **File**: `/app/employees/page.tsx`
- Training records table is now clickable/expandable
- Click any row to expand and show notes
- Chevron icon rotates to indicate expanded state
- Expanded row shows notes or "No notes recorded" if empty
- Click again to collapse
- Changes to different employee resets expansion

**Implementation Details**:
- Added `expandedTrainingRow` state to track which row is open
- Added chevron icon in Status column
- Rows are cursor-pointer and hoverable
- Expanded section has darker background (bg-gray-900)
- Notes displayed with whitespace preserved (whitespace-pre-wrap)
- Updated API to return `notes` field in training records (`/app/api/employees/[badge_id]/route.ts:68,77`)

### UI Improvements (Added same session)
**Job Codes Visible**:
- Removed asterisk masking from job codes (`/app/employees/page.tsx:421`)
- Job codes now display actual values in employee details header

**Column Width Adjustments**:
- Adjusted employees page column widths to prevent horizontal scrolling
- Left column (Search): col-span-3 → col-span-2 (narrower)
- Middle column (Employee Info): col-span-4 (unchanged)
- Right column (Training): col-span-5 → col-span-6 (wider)
- Grid maintains 12-column layout: 2 + 4 + 6 = 12

### Accordion Functionality Added to Raw User Page (Added same session)
**Applied same accordion pattern to Raw User tab**:
- **File**: `/app/raw-user/page.tsx`
- Added `expandedCertificateRow` state
- Added `notes` field to Certificate interface
- Made certificate table rows clickable/expandable
- Chevron icon in Training ID column rotates on expand
- Expanded section shows notes or "No notes recorded"
- Click row to expand/collapse
- Changing employees resets expansion

**API Updated**:
- **File**: `/app/api/employees/certificates/route.ts`
- Added `notes` field to SELECT query (line 47)
- Notes now returned with certificate data

**Pattern Consistency**:
- Same UX as employees page training table
- Cursor pointer, hover effects
- Dark background (bg-gray-900) for expanded section
- Whitespace preserved for multi-line notes

---

## 2025-12-02: Course Groups Feature Implementation

### Overview
Implemented course groups to allow equivalent courses with different IDs to satisfy the same training requirement. For example, if a position requires course 99939 (T717 Concepts...) but an employee has course 14350 (T717 Machines...), the system now recognizes these as equivalent because they're both in the T717 group.

### The Problem
Previously, the system matched training requirements by **exact course ID only**. This caused issues when:
1. A position requires course **99939** (`T717 Concepts and Techniques of Machine Safeguarding`)
2. An employee has completed course **14350** (`T717 Machines and Machine Guarding`)
3. Both are "T717" courses, but the system showed **"Missing"** because IDs don't match

### The Solution
Group courses by their T-code prefix. When checking if an employee satisfies a requirement:
1. Look up if the required course belongs to an enabled group (e.g., T717)
2. If yes, check if the employee has **ANY** course in that group
3. Use the **latest expiration date** across all courses in the group

### Database Changes

#### New Tables (created previously)
```sql
course_groups
├── group_id (PK, SERIAL)
├── group_code (VARCHAR, e.g., "T717")
├── group_name (VARCHAR)
├── is_enabled (BOOLEAN, DEFAULT false) -- NEW COLUMN ADDED TODAY
└── created_at (TIMESTAMP)

course_group_members
├── group_id (FK)
└── course_id (FK)
```

#### Migration Script
- **File**: `/scripts/add-course-groups-enabled.ts`
- Added `is_enabled` column to `course_groups` table
- Allows selective enabling of course groups
- Run with: `npx tsx scripts/add-course-groups-enabled.ts`

#### Enable Script
- **File**: `/scripts/enable-course-groups.ts`
- Enables all course groups that have position requirements
- Run with: `npx tsx scripts/enable-course-groups.ts`
- **Result**: 59 total groups, all enabled

### Files Modified

#### 1. Employee Lookup API - Group Matching Logic
- **File**: `/app/api/employees/[badge_id]/route.ts`
- Added CTEs for group matching:
  - `required_course_groups` - finds enabled groups for required courses
  - `employee_group_training` - finds employee's training in enabled groups
- Query now tries exact match first, falls back to group match
- Returns `match_type` ('exact' or 'group'), `group_code`, `matched_course_id`, `matched_course_name`
- Uses **latest expiration date** when multiple courses in group (`ORDER BY expiration_date DESC NULLS LAST`)

#### 2. Employee Page UI - Match Type Indicator
- **File**: `/app/employees/page.tsx`
- Updated `TrainingRecord` interface to include new fields:
  ```typescript
  match_type: 'exact' | 'group' | null;
  group_code: string | null;
  matched_course_id: string | null;
  matched_course_name: string | null;
  ```
- Added purple badge showing group match info in training table
- Expanded row shows detailed group match explanation when applicable:
  - Required course name
  - Actual course the employee has
  - Explanation that both belong to same group

### How Matching Works

#### Exact Match (Priority 1)
```
Position requires course_id = 99939
Employee has course_id = 99939
Result: MATCH (exact) → Uses that course's expiration
```

#### Group Match (Priority 2 - Only if no exact match)
```
Position requires course_id = 99939
→ 99939 belongs to enabled group "T717"
→ T717 group contains: [99939, 14350, 13512]

Employee has course_id = 14350 (but NOT 99939)
→ 14350 is in T717 group
Result: MATCH (group) → Uses 14350's expiration date
```

### UI Display

#### Training Table
- Shows purple badge: `T717 Group` with `via 14350`
- Indicates the requirement was satisfied via group matching

#### Expanded Row (click to expand)
- Purple highlighted box showing:
  - "Group Match (T717)"
  - Required: [original course name]
  - Has: [actual course employee completed]
  - Explanation text

### Scripts Created

| Script | Purpose | Command |
|--------|---------|---------|
| `scripts/add-course-groups-enabled.ts` | Add is_enabled column | `npx tsx scripts/add-course-groups-enabled.ts` |
| `scripts/enable-course-groups.ts` | Enable groups with position requirements | `npx tsx scripts/enable-course-groups.ts` |
| `scripts/export-course-groups.ts` | Export groups to Excel for review | `npx tsx scripts/export-course-groups.ts` |

### Current State
- **59 course groups** in database
- **All 59 enabled** for group matching
- Groups are based on T-code prefix (T717, T697, etc.)
- Only groups with 2+ courses were created

### Important Notes

1. **Exact match takes priority** - Group matching only used when no exact match exists
2. **Latest expiration wins** - When matching via group, uses furthest-out expiration date
3. **is_enabled flag** - Groups can be disabled individually if needed (rollback)
4. **Not all similar courses should be grouped** - e.g., T506B (broad) vs T506B1 (subset) are intentionally separate

### Rollback Plan
If issues arise:
```sql
UPDATE course_groups SET is_enabled = false;
```
System reverts to exact ID matching only.

---

## 2025-12-02: CSV Training Import System

### Overview
Built a system to import/update training records from `course_compare.csv` to fill in missing expiration dates and add missing training records.

### The Problem
- Many training records in our database had `NULL` expiration dates
- The external system (CSV) had the correct expiration dates
- Some training records existed in CSV but not in our database at all

### The Solution
Created an import script with the following logic:
1. **If we have a training record with NULL expiration** → Update with CSV's expiration date
2. **If we already have an expiration date** → Leave it alone (don't override)
3. **If we're missing the record entirely** → Import it from CSV

### Script Created
- **File**: `/scripts/import-csv-training.ts`
- **Preview mode**: `npx tsx scripts/import-csv-training.ts --preview`
- **Import mode**: `npx tsx scripts/import-csv-training.ts --import`

### Import Results (2025-12-02)
```
Records UPDATED (added expiration to NULL): 1,835
Records INSERTED (missing entirely): 55
Skipped - already has expiration: 22,573
Skipped - no expiration in CSV (n/a): 4,731
Skipped - employee not found: 648
```

### How It Works

1. **Parses CSV** - Handles BOM, quotes, line endings
2. **Extracts course ID** - From requirement string like `...(13458)`
3. **Parses expiration date** - Converts `MM/DD/YYYY` to `YYYY-MM-DD`, skips `n/a`
4. **Bulk loads data** - Loads all employees, courses, and training records into memory
5. **Processes each row** - Determines if update, insert, or skip
6. **Applies changes** - Only in `--import` mode

### CSV Format Expected
```csv
Requirement,Associate,Current Status,Expire Date
SPPIVT T111 ESD...(13458),"Abbott,Michael C",Active,4/21/2026
```

### Key Design Decisions

1. **Never override existing expiration dates** - Only fills in NULL values
2. **For new inserts, completion date = expiration - 1 year** - Reasonable assumption
3. **Notes field set to "Imported from course_compare.csv"** - For audit trail
4. **Skips courses not in our database** - Won't create orphan records
5. **Skips inactive employees** - Only processes active employees

### Verification Example
Before import - Abbott T717:
```
13512: completion 2023-01-25, expiration: NULL
```

After import:
```
13512: completion 2023-01-25, expiration: 2026-01-25
```

---

## 2025-12-02: Course Compare Report & Missing Courses Import

### Overview
Created a report script that compares the external `course_compare.csv` against our database to verify which training records we have, which we're missing, and which are satisfied via course group matching.

### The Problem
Need a way to audit our database against the external system's training data to:
1. Verify we have the same training records
2. Identify gaps where we're missing records
3. See where course group matching is working (equivalent courses)
4. Flag any expiration date discrepancies

### The Solution
Created an Excel report generator that:
1. Reads each row from `course_compare.csv`
2. Checks if employee exists in our database
3. Checks for exact course ID match
4. If no exact match, checks for group match (equivalent course in same T-code group)
5. Compares expiration dates (with 2-day tolerance for timezone issues)
6. Outputs color-coded Excel file

### Script Created
- **File**: `/scripts/course-compare-report.ts`
- **Run with**: `npx tsx scripts/course-compare-report.ts`
- **Output**: `course-compare-report-YYYY-MM-DD.xlsx`

### Match Statuses

| Status | Color | Meaning |
|--------|-------|---------|
| Exact Match | Green | We have this exact course ID for this employee |
| Group Match | Purple | We have an equivalent course from the same T-code group |
| Not Found | Red | We don't have this course or any equivalent |
| Employee Not Found | Yellow | Employee doesn't exist in our database |

### Excel Output Structure

**Sheet 1: Course Compare**
- Original CSV columns: Requirement, Associate, Current Status, Expire Date
- New columns:
  - **Match Status**: One of the four statuses above
  - **Match Details**: Additional info (e.g., "Has 14350 (T717)" for group matches, "Different Exp" for date mismatches)
  - **DB Expiration**: Only populated if our expiration differs by more than 2 days

**Sheet 2: Summary**
- Quick stats showing counts for each match status

### First Run Results (2025-12-02)
```
Total Records: 33,640
  Exact Match: 29,988 (89%)
  Group Match: 5
  Not Found: 3,068
  Employee Not Found: 579
```

### Key Design Decisions

1. **2-day date tolerance** - Dates within 2 days are considered matching (handles timezone differences)
2. **Group matching uses enabled groups only** - Respects the `is_enabled` flag on course_groups
3. **Latest expiration used for group matches** - If employee has multiple courses in a group, uses the furthest-out expiration
4. **Color-coded output** - Easy visual scanning of results

### Use Cases

1. **Audit after CSV import** - Verify import was successful
2. **Identify missing training** - Find records in external system we don't have
3. **Validate course groups** - See group matching in action
4. **Spot-check expiration dates** - Find discrepancies between systems

### Files Created

| File | Purpose |
|------|---------|
| `scripts/course-compare-report.ts` | Report generator script |
| `course-compare-report-2025-12-02.xlsx` | Output file (regenerated on each run) |

---

## 2025-12-02: Missing Courses Import

### The Problem
After running the course compare report, we discovered **3,068 "Not Found"** records. Investigation revealed:
- **2,912** were because the course ID didn't exist in our `courses` table at all
- The CSV had courses (like T717 Recertification - 14351) that we never imported
- Even though we had T717 as a group, the specific course ID wasn't in our database, so group matching couldn't work

### The Solution
Created a script to:
1. Find all courses in `course_compare.csv` that don't exist in our `courses` table
2. Extract the T-code from the course name (e.g., "T717", "T684A")
3. Add the courses to the `courses` table
4. Add them to the appropriate T-code group (creating new groups if needed)

### Script Created
- **File**: `/scripts/add-missing-courses.ts`
- **Preview mode**: `npx tsx scripts/add-missing-courses.ts --preview`
- **Import mode**: `npx tsx scripts/add-missing-courses.ts --import`

### Import Results
```
Courses added to courses table: 105
New T-code groups created: 42 (total now: 102)
Course-group memberships added: 82 (total now: 225)
Courses without T-code (not grouped): 23
```

### Impact on Course Compare Report

| Status | Before | After | Change |
|--------|--------|-------|--------|
| Exact Match | 29,988 | 29,988 | - |
| Group Match | 5 | 1,408 | **+1,403** |
| Not Found | 3,068 | 1,665 | **-1,403** |
| Employee Not Found | 579 | 579 | - |

**1,403 records** that were "Not Found" are now resolved via group matching!

### Remaining "Not Found" Analysis

The remaining 1,665 "Not Found" records are **legitimate gaps** - the CSV says the employee has the training, but our database doesn't have a record for them.

**Top courses with missing records:**

| Course ID | T-Code | Count | Description |
|-----------|--------|-------|-------------|
| 13535 | T142A | 106 | PMR Proficiency Assessment |
| 13536 | T142C | 106 | Preliminary Review Board Training |
| 10458 | N/A | 67 | EH&S Cardinal Rules Awareness |
| 9962 | N/A | 67 | RTX Quality Cardinal Rules |
| 13902 | T684A | 66 | Lock Wiring/Safety Wiring Installation |

**Summary:**
- Total "Not Found" records: 1,665
- Unique courses: 169
- Unique employees: 486

These represent real discrepancies between the external system (CSV) and our database that may need to be imported or investigated.

### Analysis Scripts Created

| File | Purpose |
|------|---------|
| `scripts/add-missing-courses.ts` | Add missing courses and assign to groups |
| `scripts/analyze-not-found.ts` | Basic breakdown of not found reasons |
| `scripts/analyze-not-found-details.ts` | Detailed analysis by course, employee, T-code |

### Worklog Reorganization
- Moved `WORKLOG.md` from `/docs/` to `/docs/worklog/` folder for better organization

---

## 2025-12-02: Custom Reports Page - Quick Downloads

### Overview
Added a "Quick Downloads" section to the Custom Reports page for pre-generated static reports.

### Changes Made
- **File**: `/app/custom-reports/page.tsx`
  - Added `StaticReport` interface
  - Added `staticReports` array for configurable static downloads
  - Added "Quick Downloads" section above the dynamic reports
  - Green download button links directly to static Excel files

### File Locations
- Static reports served from: `/public/reports/`
- Report documentation: `/docs/course-compare-report/`

### How to Add New Static Reports
1. Generate the Excel file
2. Copy to `/public/reports/`
3. Add entry to `staticReports` array in `page.tsx`:
```typescript
{
  id: "report-id",
  title: "Report Title",
  description: "Description here",
  filename: "filename.xlsx",
  generatedDate: "YYYY-MM-DD"
}
```

---

## Documentation References

- **Course Groups Proposal**: `/docs/COURSE_GROUPS_PROPOSAL.md`
- **Course Compare Report**: `/docs/COURSE_COMPARE_REPORT.md`
- **Export for Review**: `course-groups-review-2025-12-02.xlsx`
- **Worklog**: Moved to `/docs/worklog/WORKLOG.md`
