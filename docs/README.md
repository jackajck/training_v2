# New Training Tracker - Planning Phase

This folder contains planning documentation for the **next-generation Training Tracker** with proper relational database architecture.

## Documentation

### 📘 [DATABASE_MIGRATION_PLAN.md](./DATABASE_MIGRATION_PLAN.md)
Complete database design and migration strategy:
- New 5-table relational structure
- How tables link together
- Migration scripts overview (3 scripts)
- Implementation roadmap
- Benefits over old single-table approach

### 📗 [EXCEL_EXTRACTION_PLAN.md](./EXCEL_EXTRACTION_PLAN.md)
Detailed plan for Script 1 - parsing the 700-sheet Excel file:
- Excel file structure analysis
- Extraction algorithm
- Edge case handling
- Python code templates
- Testing strategy

## Key Improvements Over Old System

1. **Job-based requirements** - Know which courses each job needs
2. **Junction tables** - Proper many-to-many relationships
3. **Historical data** - Training history separated from current requirements
4. **Easy job changes** - Update employee job, system auto-calculates new requirements
5. **Scalability** - Normalized structure for complex reporting

## Current Status

**Phase**: Planning & Documentation ✅

**Next Steps**:
1. Get actual 700-sheet Excel file
2. Verify column mappings and marker keywords
3. Build Script 1 (Excel parser)
4. Build Script 2 (Zeus CSV processor)
5. Build Script 3 (Employee CSV uploader)
6. Run all migrations
7. Build new web application

## Architecture Overview

```
employees (people)
    ↓
jobs (job titles)
    ↓
job_courses (junction: which jobs need which courses)
    ↓
courses (training courses)
    ↓
employee_training (historical completions)
```

## Old System (Archived)

The original prototype is in `/archive` - still functional but limited by single-table design.

---

**Created**: October 8, 2025
**Status**: Planning Phase - Ready to begin implementation
