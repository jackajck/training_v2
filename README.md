# Training Tracker

A Next.js application for managing employee training certifications, tracking compliance, and generating reports.

## Overview

Training Tracker helps organizations:
- Track employee training certifications and expiration dates
- Manage required courses for different positions/jobs
- Monitor training compliance across the organization
- Generate reports for audits and management review
- Compare external training data against internal records

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon recommended)

### Environment Variables

Create a `.env.local` file:

```env
DATABASE_URL=your_database_url
APP_PASSWORD=your_admin_password
EMPLOYEE_PASSWORD=your_employee_password
```

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_PASSWORD` | Admin login password (full access) |
| `EMPLOYEE_PASSWORD` | Employee login password (read-only) |

### Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Application Pages

### Dashboard (`/`)
Main dashboard showing key metrics, expiring certifications, and employees needing attention.

### Employees (`/employees`)
Search and manage employees. View/edit employee details, assigned positions, and training records.

### Courses (`/courses`)
Manage training courses. Add new courses, set expiration periods, and view course details.

### Jobs/Positions (`/jobs`)
Manage job positions and their required training courses. Assign courses to positions.

### Needs Attention (`/needs-attention`)
View employees with missing or expired training that requires immediate attention.

### Metrics (`/metrics`)
Training compliance metrics and statistics across the organization.

### Org Tree (`/org-tree`)
Organizational hierarchy view showing managers and their teams with training status.

### Custom Reports (`/custom-reports`)
Generate and download Excel reports:
- **Training Status by Supervisor** - Training compliance by team
- **External Training Compare** - Compare external records against database

### CSV Compare (`/csv-compare`)
Compare external training data against internal database records. Search by employee name.

### Worklog (`/worklog`)
Development changelog showing recent updates and features.

### Admin Pages
| Route | Description |
|-------|-------------|
| `/new-employee` | Add a new employee |
| `/new-course` | Add a new training course |
| `/new-position` | Add a new job position |
| `/raw-user` | Raw database view of employee data |

### Authentication
| Route | Description |
|-------|-------------|
| `/login` | Admin login |
| `/employee-view` | Employee self-service view |
| `/employee-view/login` | Employee login |

---

## API Routes

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Admin login |
| `/api/auth/logout` | POST | Admin logout |
| `/api/auth/employee/login` | POST | Employee login |
| `/api/auth/employee/logout` | POST | Employee logout |

### Employees
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/employees/search` | GET | Search employees by name/badge |
| `/api/employees/all` | GET | Get all employees |
| `/api/employees/[badge_id]` | GET | Get employee by badge ID |
| `/api/employees/create` | POST | Create new employee |
| `/api/employees/toggle-active` | POST | Activate/deactivate employee |
| `/api/employees/add-position` | POST | Assign position to employee |
| `/api/employees/remove-position` | POST | Remove position from employee |
| `/api/employees/add-training` | POST | Add training record |
| `/api/employees/certificates` | GET | Get employee certificates |

### Courses
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/courses/list` | GET | List all courses |
| `/api/courses/create` | POST | Create new course |
| `/api/courses/[course_id]` | GET/PUT | Get or update course |

### Positions
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/positions/list` | GET | List all positions |
| `/api/positions/create` | POST | Create new position |
| `/api/positions/[position_id]` | GET/PUT | Get or update position |
| `/api/positions/toggle-active` | POST | Activate/deactivate position |
| `/api/positions/add-course` | POST | Add required course to position |
| `/api/positions/remove-course` | POST | Remove course from position |

### Jobs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/jobs/list` | GET | List all jobs |
| `/api/jobs/[job_code]` | GET | Get job by code |
| `/api/jobs/add-course` | POST | Add course to job |
| `/api/jobs/remove-course` | POST | Remove course from job |

### Training
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/training/expiring` | GET | Get expiring certifications |
| `/api/training/extend` | POST | Extend certificate expiration |

### Reports
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reports/supervisor-training` | GET | Download supervisor training report (Excel) |
| `/api/reports/supervisor-training-preview` | GET | Preview supervisor training data |
| `/api/reports/course-compare` | GET | Download external training comparison (Excel) |
| `/api/reports/course-compare-preview` | GET | Preview comparison for one employee |
| `/api/reports/course-compare-names` | GET | Get list of names in external data |

### Organization
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/org-tree/team` | GET | Get team hierarchy |
| `/api/org-tree/team-full` | GET | Get full team data |
| `/api/org-tree/team-stats` | GET | Get team training stats |
| `/api/org-tree/team-with-stats` | GET | Team hierarchy with stats |
| `/api/org-tree/training-overview` | GET | Training overview by manager |
| `/api/managers/list` | GET | List all managers |

### Other
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/metrics` | GET | Get training metrics |
| `/api/problems` | GET | Get compliance problems |
| `/api/csv-compare` | GET | Compare employee against external data |
| `/api/worklog` | GET | Get worklog entries |

---

## Project Structure

```
new-application/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/          # Authentication endpoints
│   │   ├── courses/       # Course management
│   │   ├── employees/     # Employee management
│   │   ├── jobs/          # Job/position management
│   │   ├── managers/      # Manager queries
│   │   ├── metrics/       # Metrics endpoint
│   │   ├── org-tree/      # Organization hierarchy
│   │   ├── positions/     # Position management
│   │   ├── problems/      # Compliance issues
│   │   ├── reports/       # Report generation
│   │   ├── training/      # Training records
│   │   └── worklog/       # Worklog API
│   ├── courses/           # Courses page
│   ├── csv-compare/       # CSV comparison page
│   ├── custom-reports/    # Reports page
│   ├── employees/         # Employees page
│   ├── employee-view/     # Employee self-service
│   ├── jobs/              # Jobs/positions page
│   ├── login/             # Admin login
│   ├── metrics/           # Metrics page
│   ├── needs-attention/   # Attention needed page
│   ├── new-course/        # Add course page
│   ├── new-employee/      # Add employee page
│   ├── new-position/      # Add position page
│   ├── org-tree/          # Org hierarchy page
│   ├── raw-user/          # Raw data view
│   ├── worklog/           # Worklog page
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Dashboard
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── LayoutWrapper.tsx  # Layout wrapper
│   └── Sidebar.tsx        # Navigation sidebar
├── docs/                  # Documentation
│   └── worklog/           # Worklog markdown files
├── lib/                   # Utilities
│   └── db.ts              # Database connection
├── scripts/               # Utility scripts
│   ├── create-external-training-table.ts
│   └── import-external-training.ts
├── public/                # Static assets
├── middleware.ts          # Auth middleware
├── next.config.ts         # Next.js config
└── package.json           # Dependencies
```

---

## Database Tables

| Table | Description |
|-------|-------------|
| `employees` | Employee records (badge_id, name, supervisor, etc.) |
| `courses` | Training courses (course_id, name, expiration_months) |
| `positions` | Job positions |
| `employee_positions` | Employee-position assignments |
| `position_courses` | Required courses per position |
| `employee_training` | Training completion records |
| `course_groups` | Groups of equivalent courses |
| `course_group_members` | Courses in each group |
| `external_training` | External training data (from CSV import) |

---

## Scripts

### Import External Training Data

```bash
# Create the external_training table
npx tsx scripts/create-external-training-table.ts

# Import data from course_compare.csv
npx tsx scripts/import-external-training.ts
```

---

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (Neon)
- **Styling**: Tailwind CSS
- **Reports**: ExcelJS
