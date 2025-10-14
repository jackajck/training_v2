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
            {/* MIDDLE COLUMN - Position Info & Required Courses */}
            <div className="col-span-4 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
              {/* Position Info Header */}
              <div className="p-4 border-b border-gray-700 bg-gray-900">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold">{selectedPosition.position_name}</h2>
                    <p className="text-gray-400 text-xs">ID: {selectedPosition.position_id}</p>
                    {selectedPosition.description && (
                      <p className="text-xs text-gray-500 mt-2">{selectedPosition.description}</p>
                    )}
                  </div>
                  {!selectedPosition.is_active && (
                    <span className="px-2 py-1 bg-red-600 text-white text-xs rounded">Inactive</span>
                  )}
                </div>
              </div>

              {/* Required Courses Header */}
              <div className="p-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold">Required Courses ({courses.length})</h3>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loadingDetails ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                ) : courses.length === 0 ? (
                  <p className="text-gray-500">No required courses</p>
                ) : (
                  <div className="space-y-2">
                    {courses.map((course) => (
                      <div
                        key={course.course_id}
                        className="px-3 py-2 bg-gray-900 rounded-lg flex justify-between items-center"
                      >
                        <div className="flex-1">
                          <div className="text-sm text-gray-300">{course.course_name}</div>
                          <div className="text-xs text-gray-500">ID: {course.course_id}</div>
                          {course.duration_months && (
                            <div className="text-xs text-gray-400">{course.duration_months} months</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!course.is_active && (
                            <span className="px-2 py-1 bg-red-600 text-white text-xs rounded">Inactive</span>
                          )}
                          <button
                            onClick={() => handleRemoveCourse(course.course_id, course.course_name)}
                            className="text-gray-400 hover:text-red-400 font-bold text-sm"
                            title="Remove course"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN - Edit Courses (Add/Remove) */}
            <div className="col-span-5 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold mb-3">Manage Required Courses</h3>
                <input
                  type="text"
                  placeholder="Search courses to add..."
                  value={courseSearchQuery}
                  onChange={(e) => setCourseSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const filteredCourses = allCourses.filter(course =>
                        courseSearchQuery.length < 2 ||
                        course.course_name.toLowerCase().includes(courseSearchQuery.toLowerCase()) ||
                        course.course_id.toLowerCase().includes(courseSearchQuery.toLowerCase())
                      );
                      const firstUnassigned = filteredCourses.find(course =>
                        !courses.some(c => c.course_id === course.course_id)
                      );
                      if (firstUnassigned) {
                        handleAddCourse(firstUnassigned.course_id, firstUnassigned.course_name);
                      }
                    }
                  }}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto">
                {loadingCourses ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-700">
                    {allCourses
                      .filter(course =>
                        courseSearchQuery.length < 2 ||
                        course.course_name.toLowerCase().includes(courseSearchQuery.toLowerCase()) ||
                        course.course_id.toLowerCase().includes(courseSearchQuery.toLowerCase())
                      )
                      .map((course) => {
                        const isAssigned = courses.some(c => c.course_id === course.course_id);
                        return (
                          <div
                            key={course.course_id}
                            className={`px-4 py-3 transition-colors ${
                              isAssigned ? 'bg-green-900/20' : 'hover:bg-gray-700'
                            }`}
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
                              <div>
                                {isAssigned ? (
                                  <button
                                    onClick={() => handleRemoveCourse(course.course_id, course.course_name)}
                                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-500 transition-colors text-xs font-semibold"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleAddCourse(course.course_id, course.course_name)}
                                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-500 transition-colors text-xs font-semibold"
                                  >
                                    Add
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* MIDDLE COLUMN - Placeholder */}
            <div className="col-span-4 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
              <p className="text-gray-500">Select a position to view details</p>
            </div>

            {/* RIGHT COLUMN - Placeholder */}
            <div className="col-span-5 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
              <p className="text-gray-500">Select a position to manage required courses</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
