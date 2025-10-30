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
