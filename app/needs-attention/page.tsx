'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface EmployeeWithExpired {
  employee_id: number;
  badge_id: string;
  employee_name: string;
  is_active: boolean;
  expired_count: number;
  missing_count: number;
  valid_count: number;
  total_required: number;
  positions: string;
}

interface EmployeeNoPosition {
  employee_id: number;
  badge_id: string;
  employee_name: string;
  is_active: boolean;
  created_at: string;
}

interface ProblematicPosition {
  position_id: string;
  position_name: string;
  is_active: boolean;
  total_employees: number;
  employees_with_expired: number;
  employees_missing: number;
  percent_expired: number;
}

interface ProblematicCourse {
  course_id: string;
  course_name: string;
  duration_months: number;
  is_active: boolean;
  total_completions: number;
  expired_count: number;
  no_expiration_count: number;
  percent_expired: number;
}

type TabType = 'expired' | 'no-positions' | 'positions' | 'courses';

export default function NeedsAttentionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('expired');
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);
  const [employeesWithExpired, setEmployeesWithExpired] = useState<EmployeeWithExpired[]>([]);
  const [employeesNoPositions, setEmployeesNoPositions] = useState<EmployeeNoPosition[]>([]);
  const [problematicPositions, setProblematicPositions] = useState<ProblematicPosition[]>([]);
  const [problematicCourses, setProblematicCourses] = useState<ProblematicCourse[]>([]);

  // Helper function to format dates - extracts just the date portion to avoid timezone issues
  const formatLocalDate = (dateString: string | null | undefined): string => {
    if (!dateString || dateString === '' || dateString === 'null') return '';
    try {
      const dateStr = typeof dateString === 'string' ? dateString : dateString.toString();
      const datePart = dateStr.split('T')[0];
      const [year, month, day] = datePart.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('en-US');
    } catch (e) {
      console.error('Date formatting error:', e, dateString);
      return '';
    }
  };

  useEffect(() => {
    fetchProblems();
  }, []);

  const fetchProblems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/problems');
      const data = await res.json();

      if (data.success) {
        setEmployeesWithExpired(data.data.employeesWithExpired || []);
        setEmployeesNoPositions(data.data.employeesNoPositions || []);
        setProblematicPositions(data.data.problematicPositions || []);
        setProblematicCourses(data.data.problematicCourses || []);
      }
    } catch (error) {
      console.error('Error fetching problems:', error);
    } finally {
      setLoading(false);
    }
  };

  const navigateToEmployee = (badgeId: string) => {
    router.push(`/employees?badge_id=${badgeId}`);
  };

  const downloadCSV = <T,>(data: T[], filename: string, headers: string[], rowMapper: (item: T) => (string | number)[]) => {
    if (data.length === 0) {
      alert('No data to download');
      return;
    }

    // CSV rows
    const rows = data.map(rowMapper);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map((row: (string | number)[]) => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-80px)] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-gray-400">Analyzing database for issues...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'expired' as TabType, label: 'Expired Certificates', count: employeesWithExpired.length, color: 'red' },
    { id: 'no-positions' as TabType, label: 'No Positions', count: employeesNoPositions.length, color: 'yellow' },
    { id: 'positions' as TabType, label: 'Problematic Positions', count: problematicPositions.length, color: 'orange' },
    { id: 'courses' as TabType, label: 'Problematic Courses', count: problematicCourses.length, color: 'blue' },
  ];

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col overflow-hidden">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Needs Attention</h1>

        {/* Collapsible Explanation Section */}
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setIsExplanationOpen(!isExplanationOpen)}
            className="w-full p-4 flex items-center justify-between hover:bg-blue-900/40 transition-colors"
          >
            <h3 className="text-lg font-semibold text-blue-300">What are we looking for?</h3>
            <svg
              className={`w-5 h-5 text-blue-300 transition-transform ${isExplanationOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isExplanationOpen && (
            <div className="p-4 pt-0 space-y-2">
              <p className="text-sm text-gray-300">
                This page helps identify data quality issues from the database migration and ongoing operations.
                It focuses on <strong>active employees only</strong> to help you clean up incorrect assignments and outdated records.
              </p>
              <ul className="text-sm text-gray-300 space-y-1 ml-4 list-disc">
                <li><strong>Employees with many expired certs</strong> - May indicate they&apos;ve moved to different positions or have incorrect position assignments</li>
                <li><strong>Employees with no positions</strong> - Should be deleted or given proper position assignments</li>
                <li><strong>Positions with high expiration rates</strong> - May indicate the position is incorrectly assigned to many people</li>
                <li><strong>Courses with high expiration rates</strong> - May have incorrect duration settings from data migration</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab.label}
            <span className={`ml-2 px-2 py-0.5 rounded text-xs font-semibold ${
              activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Tab Content: Employees with Expired Certificates */}
        {activeTab === 'expired' && (
          <div className="bg-gray-800 rounded-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-red-400">
                  ⚠️ Employees with Expired Certificates ({employeesWithExpired.length})
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  These employees may no longer work here or have incorrect positions assigned
                </p>
              </div>
              <button
                onClick={() => downloadCSV(
                  employeesWithExpired,
                  'Employees_With_Expired_Certificates',
                  ['Employee Name', 'Badge ID', 'Status', 'Positions', 'Expired Count', 'Missing Count', 'Valid Count', 'Total Required'],
                  (emp) => [
                    emp.employee_name,
                    emp.badge_id,
                    emp.is_active ? 'Active' : 'Inactive',
                    emp.positions || 'No positions',
                    emp.expired_count,
                    emp.missing_count,
                    emp.valid_count,
                    emp.total_required
                  ]
                )}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors text-sm font-semibold whitespace-nowrap"
              >
                Download CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Employee</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Badge ID</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Positions</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-400 uppercase">Expired</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-400 uppercase">Missing</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-400 uppercase">Valid</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-400 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {employeesWithExpired.map((emp) => (
                    <tr
                      key={emp.employee_id}
                      onClick={() => navigateToEmployee(emp.badge_id)}
                      className="hover:bg-gray-700 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-white font-medium">{emp.employee_name}</td>
                      <td className="px-4 py-3 text-gray-300">{emp.badge_id}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          emp.is_active ? 'bg-gray-600 text-white' : 'bg-red-600 text-white'
                        }`}>
                          {emp.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {emp.positions || 'No positions'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-red-600 text-white rounded font-semibold">
                          {emp.expired_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-orange-600 text-white rounded font-semibold">
                          {emp.missing_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-green-400 font-semibold">
                        {emp.valid_count}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400">
                        {emp.total_required}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: Employees with No Positions */}
        {activeTab === 'no-positions' && (
          <div className="bg-gray-800 rounded-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-yellow-400">
                  ⚠️ Employees with No Positions ({employeesNoPositions.length})
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  These employees have no positions assigned and likely should be removed or updated
                </p>
              </div>
              <button
                onClick={() => downloadCSV(
                  employeesNoPositions,
                  'Employees_With_No_Positions',
                  ['Employee Name', 'Badge ID', 'Status', 'Created Date'],
                  (emp) => [
                    emp.employee_name,
                    emp.badge_id,
                    emp.is_active ? 'Active' : 'Inactive',
                    formatLocalDate(emp.created_at)
                  ]
                )}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors text-sm font-semibold whitespace-nowrap"
              >
                Download CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Employee</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Badge ID</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {employeesNoPositions.map((emp) => (
                    <tr
                      key={emp.employee_id}
                      onClick={() => navigateToEmployee(emp.badge_id)}
                      className="hover:bg-gray-700 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-white font-medium">{emp.employee_name}</td>
                      <td className="px-4 py-3 text-gray-300">{emp.badge_id}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          emp.is_active ? 'bg-gray-600 text-white' : 'bg-red-600 text-white'
                        }`}>
                          {emp.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {formatLocalDate(emp.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: Problematic Positions */}
        {activeTab === 'positions' && (
          <div className="bg-gray-800 rounded-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-orange-400">
                  📋 Positions with High Expiration Rates ({problematicPositions.length})
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  These positions have many employees with expired training - may indicate position assignment errors
                </p>
              </div>
              <button
                onClick={() => downloadCSV(
                  problematicPositions,
                  'Problematic_Positions',
                  ['Position Name', 'Position ID', 'Status', 'Total Employees', 'Employees with Expired', 'Percent Expired'],
                  (pos) => [
                    pos.position_name,
                    pos.position_id,
                    pos.is_active ? 'Active' : 'Inactive',
                    pos.total_employees,
                    pos.employees_with_expired,
                    `${pos.percent_expired}%`
                  ]
                )}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors text-sm font-semibold whitespace-nowrap"
              >
                Download CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Position</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-400 uppercase">Total Employees</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-400 uppercase">With Expired</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-400 uppercase">% Expired</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {problematicPositions.map((pos) => (
                    <tr key={pos.position_id} className="hover:bg-gray-700 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{pos.position_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          pos.is_active ? 'bg-gray-600 text-white' : 'bg-red-600 text-white'
                        }`}>
                          {pos.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-300">{pos.total_employees}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-orange-600 text-white rounded font-semibold">
                          {pos.employees_with_expired}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded font-semibold ${
                          pos.percent_expired >= 75 ? 'bg-red-600 text-white' :
                          pos.percent_expired >= 50 ? 'bg-orange-600 text-white' :
                          'bg-yellow-600 text-white'
                        }`}>
                          {pos.percent_expired}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: Problematic Courses */}
        {activeTab === 'courses' && (
          <div className="bg-gray-800 rounded-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-blue-400">
                  📚 Courses with High Expiration Rates ({problematicCourses.length})
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  These courses may have incorrect duration settings or data migration issues
                </p>
              </div>
              <button
                onClick={() => downloadCSV(
                  problematicCourses,
                  'Problematic_Courses',
                  ['Course Name', 'Course ID', 'Duration (Months)', 'Status', 'Total Completions', 'Expired Count', 'Percent Expired'],
                  (course) => [
                    course.course_name,
                    course.course_id,
                    course.duration_months ? course.duration_months : 'No expiration',
                    course.is_active ? 'Active' : 'Inactive',
                    course.total_completions,
                    course.expired_count,
                    `${course.percent_expired}%`
                  ]
                )}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors text-sm font-semibold whitespace-nowrap"
              >
                Download CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Course</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Duration</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-400 uppercase">Total</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-400 uppercase">Expired</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-400 uppercase">% Expired</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {problematicCourses.map((course) => (
                    <tr key={course.course_id} className="hover:bg-gray-700 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{course.course_name}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {course.duration_months ? `${course.duration_months} months` : 'No expiration'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          course.is_active ? 'bg-gray-600 text-white' : 'bg-red-600 text-white'
                        }`}>
                          {course.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-300">{course.total_completions}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-red-600 text-white rounded font-semibold">
                          {course.expired_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded font-semibold ${
                          course.percent_expired >= 75 ? 'bg-red-600 text-white' :
                          course.percent_expired >= 50 ? 'bg-orange-600 text-white' :
                          'bg-yellow-600 text-white'
                        }`}>
                          {course.percent_expired}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
