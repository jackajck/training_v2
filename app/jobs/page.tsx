'use client';

import { useState, useEffect } from 'react';

interface Position {
  position_id: string;
  position_name: string;
  is_active: boolean;
  course_count: number;
  employee_count: number;
}

interface PositionDetails {
  position_id: string;
  position_name: string;
  description: string;
  is_active: boolean;
}

interface Course {
  course_id: string;
  course_name: string;
  duration_months: number;
  is_active: boolean;
}

interface Employee {
  employee_id: number;
  badge_id: string;
  employee_name: string;
  job_code: string;
  is_active: boolean;
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPosition, setSelectedPosition] = useState<PositionDetails | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Right pane - Add/Remove courses
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [loadingCourses, setLoadingCourses] = useState(false);

  useEffect(() => {
    fetchPositions();
    fetchAllCourses();
  }, []);

  const fetchPositions = async (query = '') => {
    setLoading(true);
    try {
      const url = query
        ? `/api/positions/list?q=${encodeURIComponent(query)}`
        : '/api/positions/list';
      const res = await fetch(url);
      const data = await res.json();
      setPositions(data.data || []);
    } catch (error) {
      console.error('Error fetching positions:', error);
      setPositions([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllCourses = async () => {
    setLoadingCourses(true);
    try {
      const res = await fetch('/api/courses/list');
      const data = await res.json();
      setAllCourses(data.data || []);
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoadingCourses(false);
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      fetchPositions(searchQuery);
    } else {
      fetchPositions();
    }
  };

  const handleSelectPosition = async (position: Position) => {
    setSelectedPosition({ position_id: position.position_id, position_name: position.position_name, description: '', is_active: position.is_active });
    setLoadingDetails(true);

    try {
      const res = await fetch(`/api/positions/${position.position_id}`);
      const data = await res.json();
      setSelectedPosition(data.position);
      setCourses(data.courses || []);
      setEmployees(data.employees || []);
    } catch (error) {
      console.error('Error fetching position details:', error);
      setCourses([]);
      setEmployees([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleAddCourse = async (course_id: string, course_name: string) => {
    if (!selectedPosition) return;

    if (!confirm(`Add course "${course_name}" to ${selectedPosition.position_name}?`)) {
      return;
    }

    try {
      const res = await fetch('/api/positions/add-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_id: selectedPosition.position_id,
          course_id
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to add course');
        return;
      }

      alert('Course added successfully!');
      // Refresh position details by re-fetching
      const refreshRes = await fetch(`/api/positions/${selectedPosition.position_id}`);
      const refreshData = await refreshRes.json();
      setSelectedPosition(refreshData.position);
      setCourses(refreshData.courses || []);
    } catch (error) {
      console.error('Error adding course:', error);
      alert('Failed to add course');
    }
  };

  const handleRemoveCourse = async (course_id: string, course_name: string) => {
    if (!selectedPosition) return;

    if (!confirm(`Remove course "${course_name}" from ${selectedPosition.position_name}?\n\nThis will affect all employees with this position!`)) {
      return;
    }

    try {
      const res = await fetch('/api/positions/remove-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_id: selectedPosition.position_id,
          course_id
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to remove course');
        return;
      }

      alert('Course removed successfully!');
      // Refresh position details by re-fetching
      const refreshRes = await fetch(`/api/positions/${selectedPosition.position_id}`);
      const refreshData = await refreshRes.json();
      setSelectedPosition(refreshData.position);
      setCourses(refreshData.courses || []);
    } catch (error) {
      console.error('Error removing course:', error);
      alert('Failed to remove course');
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col overflow-hidden">
      {/* 3 Column Layout */}
      <div className="grid grid-cols-12 gap-6 h-full overflow-hidden">

        {/* LEFT COLUMN - Search/Position List */}
        <div className="col-span-3 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <input
              type="text"
              placeholder="Search positions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full mt-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors text-sm font-semibold"
            >
              {loading ? 'Loading...' : 'Search'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {positions.length > 0 ? (
              <div className="divide-y divide-gray-700">
                {positions.map((position) => (
                  <button
                    key={position.position_id}
                    onClick={() => handleSelectPosition(position)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selectedPosition?.position_id === position.position_id
                        ? 'bg-gray-700 border-l-4 border-blue-500'
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-medium text-white text-sm">{position.position_name}</div>
                    <div className="text-xs text-gray-400">ID: {position.position_id}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {position.course_count} courses | {position.employee_count} employees
                    </div>
                    {!position.is_active && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-red-600 text-white text-xs rounded">Inactive</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                {loading ? 'Loading positions...' : 'No positions found'}
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE/RIGHT COLUMNS - Position Details */}
        {selectedPosition ? (
          <>
            {/* MIDDLE COLUMN - Manage Required Courses (Split: Top = Details + Assigned, Bottom = Search + Add) */}
            <div className="col-span-5 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
              {/* UPPER SECTION - Position Info & Assigned Courses */}
              <div className="flex flex-col max-h-[50%] border-b-2 border-gray-600">
                {/* Position Info Header */}
                <div className="p-4 border-b border-gray-700 bg-gray-900">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold">{selectedPosition.position_name}</h2>
                      <p className="text-gray-400 text-xs">ID: {selectedPosition.position_id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const newStatus = !selectedPosition.is_active;
                          if (!confirm(`${newStatus ? 'Activate' : 'Deactivate'} ${selectedPosition.position_name}?\n\n${newStatus ? 'This will make this position active and requirements will be calculated for employees with this position.' : 'This will make this position inactive. Training requirements from this position will be ignored for all employees.'}`)) {
                            return;
                          }

                          try {
                            const res = await fetch('/api/positions/toggle-active', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                position_id: selectedPosition.position_id,
                                is_active: newStatus
                              })
                            });

                            const data = await res.json();

                            if (!res.ok) {
                              alert(data.error || 'Failed to toggle position status');
                              return;
                            }

                            alert(`Position ${newStatus ? 'activated' : 'deactivated'} successfully!`);
                            // Update local state
                            setSelectedPosition({ ...selectedPosition, is_active: newStatus });
                            // Refresh position list
                            fetchPositions(searchQuery);
                          } catch (error) {
                            console.error('Error toggling position status:', error);
                            alert('Failed to toggle position status');
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          selectedPosition.is_active ? 'bg-gray-600' : 'bg-red-600'
                        }`}
                        title={selectedPosition.is_active ? 'Active - Click to deactivate' : 'Inactive - Click to activate'}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            selectedPosition.is_active ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <span className={`text-xs font-semibold ${selectedPosition.is_active ? 'text-green-400' : 'text-gray-400'}`}>
                        {selectedPosition.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Assigned Courses Header */}
                <div className="p-4 border-b border-gray-700">
                  <h3 className="text-lg font-semibold">Required Courses ({courses.length})</h3>
                </div>

                {/* Assigned Courses as Tags */}
                <div className="flex-1 overflow-y-auto p-4">
                  {loadingDetails ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    </div>
                  ) : courses.length === 0 ? (
                    <p className="text-gray-500 text-sm">No required courses assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {courses.map((course) => (
                        <div
                          key={course.course_id}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-900/30 border border-green-700 rounded text-xs"
                        >
                          <span className="text-white font-medium">{course.course_name}</span>
                          {!course.is_active && (
                            <span className="px-1.5 py-0.5 bg-red-600 text-white text-[10px] rounded">Inactive</span>
                          )}
                          <button
                            onClick={() => handleRemoveCourse(course.course_id, course.course_name)}
                            className="text-gray-400 hover:text-gray-200 font-bold text-sm leading-none"
                            title="Remove course"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* LOWER SECTION - Search & Add Courses */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Search Header */}
                <div className="p-4 border-b border-gray-700">
                  <h3 className="text-lg font-semibold mb-3">Add Courses</h3>
                  <input
                    type="text"
                    placeholder="Search courses to add..."
                    value={courseSearchQuery}
                    onChange={(e) => setCourseSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const filteredCourses = allCourses.filter(course =>
                          !courses.some(c => c.course_id === course.course_id) &&
                          (courseSearchQuery.length < 2 ||
                          course.course_name.toLowerCase().includes(courseSearchQuery.toLowerCase()) ||
                          course.course_id.toLowerCase().includes(courseSearchQuery.toLowerCase()))
                        );
                        if (filteredCourses.length > 0) {
                          handleAddCourse(filteredCourses[0].course_id, filteredCourses[0].course_name);
                        }
                      }
                    }}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
                  />
                </div>

                {/* Available Courses List */}
                <div className="flex-1 overflow-y-auto">
                  {loadingCourses ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-700">
                      {allCourses
                        .filter(course =>
                          !courses.some(c => c.course_id === course.course_id) &&
                          (courseSearchQuery.length < 2 ||
                          course.course_name.toLowerCase().includes(courseSearchQuery.toLowerCase()) ||
                          course.course_id.toLowerCase().includes(courseSearchQuery.toLowerCase()))
                        )
                        .map((course) => (
                          <div
                            key={course.course_id}
                            className="px-4 py-3 hover:bg-gray-700 transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-white text-sm">{course.course_name}</div>
                                <div className="text-xs text-gray-400">
                                  ID: {course.course_id}
                                  {course.duration_months && ` • ${course.duration_months} months`}
                                </div>
                                {!course.is_active && (
                                  <span className="inline-block mt-1 px-2 py-0.5 bg-red-600 text-white text-xs rounded">Inactive</span>
                                )}
                              </div>
                              <button
                                onClick={() => handleAddCourse(course.course_id, course.course_name)}
                                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-500 transition-colors text-xs font-semibold"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        ))}
                      {allCourses.filter(course =>
                        !courses.some(c => c.course_id === course.course_id) &&
                        (courseSearchQuery.length < 2 ||
                        course.course_name.toLowerCase().includes(courseSearchQuery.toLowerCase()) ||
                        course.course_id.toLowerCase().includes(courseSearchQuery.toLowerCase()))
                      ).length === 0 && (
                        <div className="p-8 text-center text-gray-500 text-sm">
                          {courseSearchQuery.length >= 2 ? 'No matching courses found' : 'All courses assigned'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN - Employees in Position */}
            <div className="col-span-4 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold">Employees in Position ({employees.length})</h3>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loadingDetails ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                ) : employees.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    No employees found with this position
                  </div>
                ) : (
                  <div className="divide-y divide-gray-700">
                    {employees.map((employee) => (
                      <div
                        key={employee.employee_id}
                        className="px-4 py-3 hover:bg-gray-700 transition-colors"
                      >
                        <div className="font-medium text-white text-sm">{employee.employee_name}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          Badge: {employee.badge_id}
                        </div>
                        <div className="text-xs text-gray-500">
                          Job Code: {employee.job_code}
                        </div>
                        {!employee.is_active && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-red-600 text-white text-xs rounded">Inactive</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* MIDDLE COLUMN - Placeholder */}
            <div className="col-span-5 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
              <p className="text-gray-500">Select a position to manage required courses</p>
            </div>

            {/* RIGHT COLUMN - Placeholder */}
            <div className="col-span-4 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
              <p className="text-gray-500">Select a position to view employees</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
