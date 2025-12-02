# Course Compare Report

**Generated:** 2025-12-02

This report compares training records from the external system (`course_compare.csv`) against our database to identify matches, gaps, and discrepancies.

---

## Summary

| Status | Count | Percentage |
|--------|-------|------------|
| **Exact Match** | 29,988 | 89.1% |
| **Group Match** | 1,408 | 4.2% |
| **Not Found** | 1,665 | 5.0% |
| **Employee Not Found** | 579 | 1.7% |
| **Total** | 33,640 | 100% |

---

## What Each Status Means

### Exact Match (29,988 records)
The employee has the **exact same course ID** in our database as listed in the CSV. This is a direct 1:1 match.

### Group Match (1,408 records)
The employee doesn't have the exact course ID, but has an **equivalent course** from the same T-code group.

**Example:**
- CSV says employee needs course **99939** (T717 Concepts and Techniques...)
- Our DB shows employee has course **14350** (T717 Machines and Machine Guarding)
- Both are in the **T717 group**, so requirement is satisfied

### Not Found (1,665 records)
The CSV says the employee has this training, but **we have no record of it** in our database - neither the exact course nor any equivalent from a course group.

### Employee Not Found (579 records)
The employee listed in the CSV **doesn't exist in our database**. These are likely former employees or people in a different system.

---

## Not Found Breakdown

### By Course (Top 15)

| Course ID | T-Code | Count | Description |
|-----------|--------|-------|-------------|
| 13535 | T142A | 106 | PMR Proficiency Assessment |
| 13536 | T142C | 106 | Preliminary Review Board Training |
| 10458 | - | 67 | EH&S Cardinal Rules Awareness |
| 9962 | - | 67 | RTX Quality Cardinal Rules |
| 13902 | T684A | 66 | Lock Wiring/Safety Wiring Installation |
| 15008 | T684A | 63 | Lock Wiring/Safety Wiring Evaluation |
| 14063 | T684A | 63 | Lock Wiring/Safety Wiring Installation (PARENT) |
| 13663 | T610A | 49 | Operating the Keyence VHX-5000 Microscope |
| 13850 | T673B | 45 | Barcode Verification (Webscan) |
| 13662 | T610 | 45 | Failure Analysis Lab Equipment |
| 14123 | T692C | 45 | Application of Conformal Coating |
| 14124 | T692C | 45 | Application of Conformal Coating |
| 14122 | T692C | 45 | Application of Conformal Coating |
| 13555 | T125 | 42 | Packing per PP-717 |
| 13849 | T673A | 39 | Barcode Verification (Dataman) |

### By T-Code (Top 15)

| T-Code | Records | Notes |
|--------|---------|-------|
| (No T-Code) | 252 | Courses without T-code prefix |
| T684A | 192 | Lock Wiring/Safety Wiring |
| T692C | 135 | Conformal Coating Application |
| T142A | 106 | PMR Proficiency Assessment |
| T142C | 106 | Preliminary Review Board |
| T692B | 80 | Conformal Coating Application |
| T610A | 49 | Keyence Microscope Operation |
| T673B | 45 | Barcode Verification (Webscan) |
| T610 | 45 | Failure Analysis Lab |
| T125 | 42 | Packing |
| T673A | 39 | Barcode Verification (Dataman) |
| T668 | 35 | Rivet/Swage Assembly |
| T670 | 24 | Solvac Solvent Vapor Degreaser |
| T580 | 18 | Swam-Blaster Operation |
| T633 | 18 | Clear Chem Film Touch Up |

### By Employee (Top 10)

| Employee | Missing Courses |
|----------|-----------------|
| Chen, Rui | 29 |
| marra, Sean | 17 |
| Mayo, Natasha Lynn | 14 |
| Sprague, Tracy | 14 |
| Davis, Juliane | 12 |
| Kittredge, William I | 12 |
| Segovia, Lorenzo | 12 |
| Stacey, Virgie | 12 |
| Bowen sr, Robert Andrew | 11 |
| Harlow, Anthony M | 11 |

---

## Files

| File | Description |
|------|-------------|
| `course-compare-report-2025-12-02.xlsx` | Full Excel report with all 33,640 records |

### Excel Columns

1. **Requirement** - Original course requirement from CSV
2. **Associate** - Employee name
3. **Current Status** - Status from external system
4. **Expire Date** - Expiration date from CSV
5. **Match Status** - Exact Match / Group Match / Not Found / Employee Not Found
6. **Match Details** - Additional info (e.g., which course matched for group matches)
7. **DB Expiration** - Our database's expiration date (only shown if different)

### Color Coding

| Color | Status |
|-------|--------|
| Green | Exact Match |
| Purple | Group Match |
| Red | Not Found |
| Yellow | Employee Not Found |

---

## How to Regenerate

```bash
cd new-application
npx tsx scripts/course-compare-report.ts
```

This will create a new `course-compare-report-YYYY-MM-DD.xlsx` file in the current directory.

---

## Related Scripts

| Script | Purpose |
|--------|---------|
| `scripts/course-compare-report.ts` | Generate the Excel report |
| `scripts/analyze-not-found.ts` | Basic analysis of "Not Found" cases |
| `scripts/analyze-not-found-details.ts` | Detailed breakdown by course/employee/T-code |
| `scripts/add-missing-courses.ts` | Add missing courses to database and groups |

---

## Next Steps

The 1,665 "Not Found" records represent real gaps. Options:

1. **Import missing training** - Create a script to import these records from the CSV
2. **Investigate specific courses** - Some may be old/deprecated training that doesn't need importing
3. **Review by employee** - Prioritize employees with the most missing records (e.g., Chen, Rui with 29 missing)
4. **Accept the gap** - If these aren't critical courses for compliance tracking
