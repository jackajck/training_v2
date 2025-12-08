'use client';

import { useState, useEffect } from 'react';

interface Course {
  course_id: string;
  course_name: string;
  duration_months: number;
  is_active: boolean;
  position_count: number;
  completion_count: number;
}

interface CourseDetails {
  course_id: string;
  course_name: string;
  duration_months: number;
  is_active: boolean;
}

interface Position {
  position_id: string;
  position_name: string;
  is_active: boolean;
}

interface Stats {
  total_completions: number;
  expired_count: number;
  valid_count: number;
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseDetails | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Edit form state (right panel)
  const [editForm, setEditForm] = useState({
    course_name: '',
    duration_months: '',
    is_active: true,
    noExpiration: false
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async (query = '') => {
    setLoading(true);
    try {
      const url = query
        ? `/api/courses/list?q=${encodeURIComponent(query)}`
        : '/api/courses/list';
      const res = await fetch(url);
      const data = await res.json();
      setCourses(data.data || []);
    } catch (error) {
      console.error('Error fetching courses:', error);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      fetchCourses(searchQuery);
    } else {
      fetchCourses();
    }
  };

  const handleSelectCourse = async (course: Course) => {
    setSelectedCourse({ course_id: course.course_id, course_name: course.course_name, duration_months: course.duration_months, is_active: course.is_active });
    setLoadingDetails(true);

    // Populate edit form
    setEditForm({
      course_name: course.course_name,
      duration_months: course.duration_months?.toString() || '',
      is_active: course.is_active,
      noExpiration: !course.duration_months
    });

    try {
      const res = await fetch(`/api/courses/${course.course_id}`);
      const data = await res.json();
      setSelectedCourse(data.course);
      setPositions(data.positions || []);
      setStats(data.stats || null);

      // Update edit form with fresh data
      setEditForm({
        course_name: data.course.course_name,
        duration_months: data.course.duration_months?.toString() || '',
        is_active: data.course.is_active,
        noExpiration: !data.course.duration_months
      });
    } catch (error) {
      console.error('Error fetching course details:', error);
      setPositions([]);
      setStats(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedCourse) return;

    if (!editForm.course_name.trim()) {
      alert('Course name is required');
      return;
    }

    if (!confirm(`Save changes to "${selectedCourse.course_name}"?`)) {
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(`/api/courses/${selectedCourse.course_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_name: editForm.course_name.trim(),
          duration_months: editForm.noExpiration ? null : (editForm.duration_months ? parseInt(editForm.duration_months) : null),
          is_active: editForm.is_active
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to update course');
        return;
      }

      alert('Course updated successfully!');
      setSelectedCourse(data.course);
      fetchCourses(searchQuery);

    } catch (error) {
      console.error('Error saving course:', error);
      alert('Failed to save course');
    } finally {
      setSaving(false);
    }
  };

  const handleHardDelete = async (course_id: string, course_name: string) => {
    if (!confirm(`⚠️ PERMANENTLY DELETE "${course_name}"?\n\nThis will:\n- Remove it from all positions\n- Delete ALL training records for this course\n- Cannot be undone!\n\nAre you absolutely sure?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/courses/${course_id}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to delete course');
        return;
      }

      alert(data.message);
      setSelectedCourse(null);
      fetchCourses(searchQuery);

    } catch (error) {
      console.error('Error deleting course:', error);
      alert('Failed to delete course');
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col overflow-hidden">
      {/* 3 Column Layout */}
      <div className="grid grid-cols-12 gap-6 h-full overflow-hidden">

        {/* LEFT COLUMN - Search/Course List */}
        <div className="col-span-3 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <input
              type="text"
              placeholder="Search courses..."
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
            {courses.length > 0 ? (
              <div className="divide-y divide-gray-700">
                {courses.map((course) => (
                  <button
                    key={course.course_id}
                    onClick={() => handleSelectCourse(course)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selectedCourse?.course_id === course.course_id
                        ? 'bg-gray-700 border-l-4 border-blue-500'
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-medium text-white text-sm">{course.course_name}</div>
                    <div className="text-xs text-gray-400">ID: {course.course_id}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {course.duration_months ? `${course.duration_months}mo` : 'No exp'} | {course.position_count} pos | {course.completion_count} comp
                    </div>
                    {!course.is_active && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-red-600 text-white text-xs rounded">Inactive</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                {loading ? 'Loading courses...' : 'No courses found'}
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE/RIGHT COLUMNS - Course Details */}
        {selectedCourse ? (
          <>
            {/* MIDDLE COLUMN - Positions requiring this course */}
            <div className="col-span-4 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold">Required by Positions ({positions.length})</h3>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loadingDetails ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                ) : positions.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No positions require this course</p>
                ) : (
                  <div className="space-y-2">
                    {positions.map((position) => (
                      <div
                        key={position.position_id}
                        className="px-3 py-2 bg-gray-900 rounded-lg flex justify-between items-center"
                      >
                        <span className="text-sm text-gray-300">{position.position_name}</span>
                        {!position.is_active && (
                          <span className="px-2 py-1 bg-red-600 text-white text-xs rounded">Inactive</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN - Edit Course */}
            <div className="col-span-5 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold">Edit Course</h3>
                <p className="text-xs text-gray-400 mt-1">Course ID: {selectedCourse.course_id}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  {/* Course Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Course Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.course_name}
                      onChange={(e) => setEditForm({ ...editForm, course_name: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
                      placeholder="Enter course name..."
                    />
                  </div>

                  {/* No Expiration Checkbox */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="editNoExpiration"
                      checked={editForm.noExpiration}
                      onChange={(e) => {
                        setEditForm({
                          ...editForm,
                          noExpiration: e.target.checked,
                          duration_months: e.target.checked ? '' : editForm.duration_months
                        });
                      }}
                      className="w-5 h-5 rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                    />
                    <label htmlFor="editNoExpiration" className="text-sm font-medium text-gray-300 cursor-pointer">
                      No Expiration (one-time training)
                    </label>
                  </div>

                  {/* Duration */}
                  {!editForm.noExpiration && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Duration (months)
                      </label>
                      <input
                        type="number"
                        value={editForm.duration_months}
                        onChange={(e) => setEditForm({ ...editForm, duration_months: e.target.value })}
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
                        placeholder="e.g., 12"
                        min="1"
                      />
                    </div>
                  )}

                  {/* Active Status Toggle */}
                  <div className="pt-4 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-sm font-medium text-gray-300">Active Status</label>
                        <p className="text-xs text-gray-400 mt-1">
                          {editForm.is_active ? 'Course is active' : 'Course is inactive'}
                        </p>
                      </div>
                      <button
                        onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          editForm.is_active ? 'bg-gray-600' : 'bg-red-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            editForm.is_active ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="pt-4">
                    <button
                      onClick={handleSaveChanges}
                      disabled={saving}
                      className="w-full px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors font-semibold"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>

                  {/* Danger Zone */}
                  <div className="pt-6 border-t border-gray-700">
                    <h4 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h4>

                    <button
                      onClick={() => handleHardDelete(selectedCourse.course_id, selectedCourse.course_name)}
                      className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors text-sm font-semibold"
                    >
                      Permanently Delete Course
                    </button>
                    <p className="text-xs text-gray-400 mt-2">
                      This will permanently delete the course and all associated training records. This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* MIDDLE COLUMN - Placeholder */}
            <div className="col-span-4 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
              <p className="text-gray-500">Select a course to view details</p>
            </div>

            {/* RIGHT COLUMN - Placeholder */}
            <div className="col-span-5 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
              <p className="text-gray-500">Course editing will appear here</p>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
