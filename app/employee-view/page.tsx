'use client';

import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';

interface Employee {
  employee_id: number;
  badge_id: string;
  employee_name: string;
  positions: string;
  position_ids: string;
  is_active: boolean;
}

interface Position {
  position_id: string;
  position_name: string;
  job_code: string;
  is_active: boolean;
}

interface TrainingRecord {
  required_course_id: string;
  course_name: string;
  duration_months: number;
  position_name: string;
  completion_date: string | null;
  expiration_date: string | null;
  status: string;
  notes: string | null;
}

interface Course {
  course_id: string;
  course_name: string;
  duration_months: number;
  is_active: boolean;
}

export default function EmployeeViewPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [expandedTrainingRow, setExpandedTrainingRow] = useState<number | null>(null);
  const [positionCourses, setPositionCourses] = useState<{ [key: string]: Course[] }>({});

  // Helper function to format dates - extracts just the date portion to avoid timezone issues
  const formatLocalDate = (dateString: string | null | undefined): string => {
    if (!dateString || dateString === '' || dateString === 'null') return '';
    try {
      const dateStr = String(dateString);
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
    fetchEmployees();
  }, []);

  const fetchEmployees = async (query = '') => {
    setSearching(true);
    try {
      const url = query
        ? `/api/employees/search?q=${encodeURIComponent(query)}`
        : '/api/employees/search?limit=100';
      const res = await fetch(url);
      const data = await res.json();
      setSearchResults(data.data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.trim()) {
      fetchEmployees(searchQuery);
    } else {
      fetchEmployees();
    }
  };

  const handleSelectEmployee = async (employee: Employee) => {
    setSelectedEmployee(employee);
    setLoadingDetails(true);
    setExpandedTrainingRow(null);

    try {
      const res = await fetch(`/api/employees/${employee.badge_id}`);
      const data = await res.json();
      const employeePositions = data.positions || [];
      setPositions(employeePositions);
      setTrainingRecords(data.training || []);

      // Fetch courses for all positions
      const coursesPromises = employeePositions.map((pos: Position) =>
        fetch(`/api/positions/${pos.position_id}`)
          .then(res => res.json())
          .then(data => ({ position_id: pos.position_id, courses: data.courses || [] }))
          .catch(error => {
            console.error(`Error fetching courses for position ${pos.position_id}:`, error);
            return { position_id: pos.position_id, courses: [] };
          })
      );

      const coursesResults = await Promise.all(coursesPromises);
      const coursesMap: { [key: string]: Course[] } = {};
      coursesResults.forEach(result => {
        coursesMap[result.position_id] = result.courses;
      });
      setPositionCourses(coursesMap);
    } catch (error) {
      console.error('Error fetching employee details:', error);
      setPositions([]);
      setTrainingRecords([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/employee/logout', { method: 'POST' });
      router.push('/employee-view/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getCourseStatus = (courseId: string) => {
    const record = trainingRecords.find(r => r.required_course_id === courseId);
    if (!record) return null;
    return record.status;
  };

  const getStatusColorForCourse = (status: string | null) => {
    if (!status) return 'bg-gray-600';
    switch (status) {
      case 'Never Completed':
        return 'bg-red-600';
      case 'Expired':
        return 'bg-orange-600';
      case 'Valid':
        return 'bg-green-600';
      case 'Completed (No Expiration)':
        return 'bg-blue-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Never Completed':
        return 'bg-red-600';
      case 'Expired':
        return 'bg-orange-600';
      case 'Valid':
        return 'bg-green-600';
      case 'Completed (No Expiration)':
        return 'bg-blue-600';
      default:
        return 'bg-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header with Logout */}
      <div className="bg-gray-900 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Training Tracker - Employee View</h1>
            <p className="text-sm text-gray-400 mt-1">SIMMONS PRECISION</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium border border-gray-600"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="h-[calc(100vh-140px)] flex flex-col overflow-hidden">
          {/* 3 Column Layout */}
          <div className="grid grid-cols-12 gap-6 h-full overflow-hidden">

            {/* LEFT COLUMN - Search/Employee List */}
            <div className="col-span-2 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="w-full mt-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors text-sm font-semibold"
                >
                  {searching ? 'Loading...' : 'Search'}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {searchResults.length > 0 ? (
                  <div className="divide-y divide-gray-700">
                    {searchResults.map((employee) => (
                      <button
                        key={employee.employee_id}
                        onClick={() => handleSelectEmployee(employee)}
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          selectedEmployee?.employee_id === employee.employee_id
                            ? 'bg-gray-700 border-l-4 border-blue-500'
                            : 'hover:bg-gray-700'
                        }`}
                      >
                        <div className="font-medium text-white text-sm">{employee.employee_name}</div>
                        <div className="text-xs text-gray-400">Badge: {employee.badge_id}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    {searching ? 'Loading employees...' : 'No employees found'}
                  </div>
                )}
              </div>
            </div>

            {/* MIDDLE/RIGHT COLUMNS - Employee Details */}
            {selectedEmployee ? (
              <>
                {/* MIDDLE COLUMN - Employee Info & Positions */}
                <div className="col-span-4 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
                  {/* Employee Info Header */}
                  <div className="p-4 border-b border-gray-700 bg-gray-900">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-xl font-bold">{selectedEmployee.employee_name}</h2>
                        <p className="text-gray-400 text-xs">Badge: {selectedEmployee.badge_id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${selectedEmployee.is_active ? 'text-green-400' : 'text-gray-400'}`}>
                          {selectedEmployee.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Positions Header */}
                  <div className="p-4 border-b border-gray-700">
                    <h3 className="text-lg font-semibold">Positions ({positions.length})</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                    {loadingDetails ? (
                      <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {positions.map((pos) => {
                          const courses = positionCourses[pos.position_id] || [];

                          return (
                            <div key={pos.position_id} className="bg-gray-900 rounded-lg p-3">
                              {/* Position Header */}
                              <div className="mb-2">
                                <span className="text-sm font-medium text-gray-200">{pos.position_name}</span>
                              </div>

                              {/* Courses List */}
                              <div className="border-t border-gray-800 pt-2">
                                {courses.length === 0 ? (
                                  <p className="text-xs text-gray-600 italic pl-4">No required courses</p>
                                ) : (
                                  <div className="relative pl-6">
                                    {/* Vertical timeline line */}
                                    <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700"></div>

                                    {/* Courses with timeline dots */}
                                    <div className="space-y-3">
                                      {courses.map((course) => {
                                        const status = getCourseStatus(course.course_id);
                                        const statusColor = getStatusColorForCourse(status);

                                        return (
                                          <div key={course.course_id} className="relative">
                                            {/* Timeline dot */}
                                            <div className={`absolute -left-[1.1rem] top-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${statusColor}`}></div>

                                            {/* Course name */}
                                            <div className="text-xs text-gray-300">{course.course_name}</div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN - Training Records */}
                <div className="col-span-6 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-gray-700">
                    <h3 className="text-lg font-semibold mb-2">Training Requirements</h3>
                    {(() => {
                      const expired = trainingRecords.filter(r => r.status === 'Expired').length;
                      const missing = trainingRecords.filter(r => r.status === 'Never Completed').length;
                      const problemCount = expired + missing;

                      if (trainingRecords.length === 0) {
                        return <p className="text-xs text-gray-400">No training requirements</p>;
                      } else if (problemCount === 0) {
                        return <p className="text-xs text-green-400 font-semibold">All requirements complete</p>;
                      } else {
                        return (
                          <p className="text-xs text-red-400 font-semibold">
                            {expired > 0 && `${expired} expired`}
                            {expired > 0 && missing > 0 && ', '}
                            {missing > 0 && `${missing} incomplete`}
                          </p>
                        );
                      }
                    })()}
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {loadingDetails ? (
                      <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                      </div>
                    ) : (
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-900 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Status</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Course</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Position</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Completed</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Expires</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {trainingRecords.map((record, idx) => (
                            <React.Fragment key={idx}>
                              <tr
                                onClick={() => setExpandedTrainingRow(expandedTrainingRow === idx ? null : idx)}
                                className="hover:bg-gray-700 transition-colors cursor-pointer"
                              >
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <svg
                                      className={`w-4 h-4 text-gray-400 transition-transform ${expandedTrainingRow === idx ? 'rotate-90' : ''}`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    <span className={`px-2 py-1 ${getStatusColor(record.status)} text-white rounded text-xs font-semibold`}>
                                      {record.status === 'Never Completed' ? 'Missing' : record.status}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-gray-300">
                                  <div className="font-medium">{record.course_name}</div>
                                  <div className="text-gray-500">ID: {record.required_course_id}</div>
                                </td>
                                <td className="px-3 py-2 text-gray-400">{record.position_name}</td>
                                <td className="px-3 py-2 text-gray-300">
                                  {record.completion_date ? (
                                    <div>{formatLocalDate(record.completion_date)}</div>
                                  ) : (
                                    <span className="text-gray-500">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-gray-300">
                                  {record.expiration_date ? (
                                    <div>
                                      <div>{formatLocalDate(record.expiration_date)}</div>
                                      <div className="text-xs text-yellow-400">
                                        {(() => {
                                          const dateStr = String(record.expiration_date);
                                          const datePart = dateStr.split('T')[0];
                                          const [year, month, day] = datePart.split('-').map(Number);
                                          const expDate = new Date(year, month - 1, day);
                                          return formatDistanceToNow(expDate, { addSuffix: true });
                                        })()}
                                      </div>
                                    </div>
                                  ) : record.completion_date ? (
                                    <span className="text-gray-500">No expiration</span>
                                  ) : (
                                    <span className="text-gray-500">-</span>
                                  )}
                                </td>
                              </tr>
                              {expandedTrainingRow === idx && (
                                <tr className="bg-gray-900">
                                  <td colSpan={5} className="px-3 py-3">
                                    <div className="pl-8">
                                      <div className="text-xs font-semibold text-gray-400 mb-1">Notes:</div>
                                      {record.notes ? (
                                        <div className="text-sm text-gray-300 whitespace-pre-wrap">{record.notes}</div>
                                      ) : (
                                        <div className="text-sm text-gray-500 italic">No notes recorded</div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* MIDDLE COLUMN - Placeholder */}
                <div className="col-span-4 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
                  <p className="text-gray-500">Select an employee to view details</p>
                </div>

                {/* RIGHT COLUMN - Placeholder */}
                <div className="col-span-6 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
                  <p className="text-gray-500">Training requirements will appear here</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
