'use client';

import React, { useState, useEffect } from 'react';

interface CourseInGroup {
  course_id: string;
  requirement: string;
  variant: string;
  employee_count: number;
  action: 'pending' | 'keep' | 'merge' | 'delete';
  merge_into: string | null;
  rename_to: string | null;
  is_one_time: boolean | null;
  recert_months: number | null;
  notes: string | null;
  cert_durations: { months: number; count: number }[];
  no_expiration_count: number;
  ext_has_exp: number;
  ext_no_exp: number;
  ext_min_exp: string | null;
  ext_max_exp: string | null;
  merged_into: string | null;
}

interface TCodeGroup {
  tCode: string;
  courses: CourseInGroup[];
  totalEmployees: number;
}

export default function CourseCleanupPage() {
  const [groups, setGroups] = useState<TCodeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, Partial<CourseInGroup>>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/course-groups');
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (tCode: string) => {
    setExpandedGroup(expandedGroup === tCode ? null : tCode);
  };

  // Track local changes without saving
  const updateLocal = (courseId: string, updates: Partial<CourseInGroup>) => {
    setPendingChanges(prev => ({
      ...prev,
      [courseId]: { ...prev[courseId], ...updates }
    }));
  };

  // Save changes to server
  const saveCourse = async (courseId: string) => {
    const changes = pendingChanges[courseId];
    if (!changes) return;

    // Find the original course to merge with changes
    let originalCourse: CourseInGroup | undefined;
    for (const group of groups) {
      originalCourse = group.courses.find(c => c.course_id === courseId);
      if (originalCourse) break;
    }
    if (!originalCourse) return;

    // Merge original values with pending changes
    const fullData = {
      course_id: courseId,
      action: changes.action ?? originalCourse.action,
      merge_into: changes.merge_into ?? originalCourse.merge_into,
      rename_to: changes.rename_to ?? originalCourse.rename_to,
      is_one_time: changes.is_one_time ?? originalCourse.is_one_time,
      recert_months: changes.recert_months ?? originalCourse.recert_months,
      notes: changes.notes ?? originalCourse.notes,
    };

    setSaving(courseId);
    try {
      const res = await fetch('/api/course-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullData)
      });
      if (res.ok) {
        // Update local state
        setGroups(prev => prev.map(group => ({
          ...group,
          courses: group.courses.map(course =>
            course.course_id === courseId
              ? { ...course, ...changes }
              : course
          )
        })));
        // Clear pending changes for this course
        setPendingChanges(prev => {
          const next = { ...prev };
          delete next[courseId];
          return next;
        });
      }
    } catch (error) {
      console.error('Error updating course:', error);
    } finally {
      setSaving(null);
    }
  };

  // Get current value (pending change or original)
  const getValue = (course: CourseInGroup, field: keyof CourseInGroup) => {
    const pending = pendingChanges[course.course_id];
    if (pending && field in pending) {
      return pending[field as keyof typeof pending];
    }
    return course[field];
  };

  // Check if course has unsaved changes
  const hasChanges = (courseId: string) => {
    return !!pendingChanges[courseId];
  };

  const getVariantColor = (variant: string) => {
    if (variant.includes('PARENT')) return 'bg-purple-600';
    if (variant.includes('IL')) return 'bg-blue-600';
    if (variant.includes('OL')) return 'bg-green-600';
    if (variant.includes('OJT')) return 'bg-yellow-600 text-black';
    return 'bg-gray-600';
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'keep': return 'bg-green-600';
      case 'merge': return 'bg-blue-600';
      case 'delete': return 'bg-red-600';
      default: return 'bg-gray-600';
    }
  };

  // Check for issues in a group
  const getGroupIssues = (group: TCodeGroup): string[] => {
    const issues: string[] = [];
    const parentCourse = group.courses.find(c => c.variant.includes('PARENT'));
    const nonParentCourses = group.courses.filter(c => !c.variant.includes('PARENT'));

    // PARENT has fewer people than other courses
    if (parentCourse && nonParentCourses.length > 0) {
      const maxNonParent = Math.max(...nonParentCourses.map(c => c.employee_count));
      if (maxNonParent > parentCourse.employee_count) {
        issues.push(`PARENT has ${parentCourse.employee_count} people, but ${nonParentCourses.find(c => c.employee_count === maxNonParent)?.variant} has ${maxNonParent}`);
      }
    }

    // Has combo variant (IL/OL together)
    if (group.courses.some(c => c.variant.includes('IL') && c.variant.includes('OL'))) {
      issues.push('Has IL/OL combo - might need to split');
    }

    // No PARENT but has other variants
    if (!parentCourse && nonParentCourses.length > 0 && group.courses.length > 1) {
      issues.push('No PARENT course - is one needed?');
    }

    // Courses with 0 employees
    const zeroCourses = group.courses.filter(c => c.employee_count === 0);
    if (zeroCourses.length > 0) {
      issues.push(`${zeroCourses.length} course(s) with 0 employees`);
    }

    return issues;
  };

  // Sort courses: PARENT first, then IL, OL, OJT, STANDARD
  const sortCourses = (courses: CourseInGroup[]) => {
    const getVariantOrder = (variant: string) => {
      if (variant.includes('PARENT')) return 0;
      if (variant.includes('IL') && !variant.includes('OL')) return 1;
      if (variant.includes('IL') && variant.includes('OL')) return 2; // IL/OL combo
      if (variant.includes('OL')) return 3;
      if (variant.includes('OJT')) return 4;
      return 5; // STANDARD
    };

    return [...courses].sort((a, b) => {
      const orderDiff = getVariantOrder(a.variant) - getVariantOrder(b.variant);
      if (orderDiff !== 0) return orderDiff;
      // Same variant type - sort by employee count (descending)
      return b.employee_count - a.employee_count;
    });
  };

  return (
    <div className="h-[calc(100vh-80px)] overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Course Cleanup</h1>
          <p className="text-gray-400">
            {groups.length} T-Code groups with duplicate courses to review
          </p>
        </div>

        {/* Explanation Box */}
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-blue-300 mb-3">How to Use This Page</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-gray-300 mb-3">
                These are courses imported from the external training CSV. Many share the same T-Code (like T171)
                but have different variants (PARENT, IL, OL, OJT).
              </p>
              <p className="text-gray-300">
                <strong className="text-yellow-400">Your job:</strong> For each course, decide:
              </p>
              <ul className="mt-2 space-y-1 text-gray-400 ml-4">
                <li><span className="text-green-400">Keep</span> - This course should exist as-is</li>
                <li><span className="text-blue-400">Merge</span> - Combine with another course</li>
                <li><span className="text-red-400">Delete</span> - This course is not needed</li>
              </ul>
            </div>
            <div>
              <p className="text-gray-300 mb-2">
                <strong>Also specify:</strong>
              </p>
              <ul className="space-y-1 text-gray-400 ml-4">
                <li><strong className="text-white">One-time?</strong> - Training taken once (like IL/initial learning)</li>
                <li><strong className="text-white">Recert months?</strong> - How often to recertify (like 24 for OL)</li>
              </ul>
              <div className="mt-3 p-2 bg-yellow-900/30 border border-yellow-500/30 rounded">
                <p className="text-yellow-300 text-xs">
                  Look for issues like PARENT having fewer people than IL - that usually means data needs cleaning.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Groups List */}
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-64 bg-gray-800 rounded-lg">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center text-gray-500 py-12 bg-gray-800 rounded-lg">
              No duplicate courses to review
            </div>
          ) : (
            groups.map(group => {
              const isExpanded = expandedGroup === group.tCode;
              const issues = getGroupIssues(group);
              const pendingCount = group.courses.filter(c => c.action === 'pending').length;
              const reviewedCount = group.courses.length - pendingCount;

              return (
                <div key={group.tCode} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                  {/* Group Header */}
                  <div
                    onClick={() => toggleGroup(group.tCode)}
                    className={`flex items-center px-4 py-3 cursor-pointer hover:bg-gray-750 ${
                      isExpanded ? 'bg-gray-750 border-b border-gray-700' : ''
                    }`}
                  >
                    {/* Expand arrow */}
                    <svg
                      className={`w-4 h-4 text-gray-400 mr-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>

                    {/* T-Code */}
                    <span className="text-lg font-bold text-blue-400 w-20">{group.tCode}</span>

                    {/* Course count */}
                    <span className="text-gray-400 text-sm w-24">
                      {group.courses.length} course{group.courses.length !== 1 ? 's' : ''}
                    </span>

                    {/* Total employees */}
                    <span className="text-gray-300 text-sm w-32">
                      {group.totalEmployees} employees
                    </span>

                    {/* Variant badges - PARENT first */}
                    <div className="flex gap-1 flex-1">
                      {[...new Set(group.courses.map(c => c.variant))]
                        .sort((a, b) => {
                          // PARENT always first
                          if (a.includes('PARENT')) return -1;
                          if (b.includes('PARENT')) return 1;
                          // Then IL, OL, OJT, STANDARD
                          const order = ['IL', 'OL', 'OJT', 'STANDARD'];
                          return order.findIndex(o => a.includes(o)) - order.findIndex(o => b.includes(o));
                        })
                        .map(variant => (
                        <span
                          key={variant}
                          className={`px-2 py-0.5 text-xs rounded ${getVariantColor(variant)}`}
                        >
                          {variant}
                        </span>
                      ))}
                    </div>

                    {/* Review status */}
                    <div className="flex items-center gap-2">
                      {issues.length > 0 && (
                        <span className="text-yellow-400 text-sm" title={issues.join('\n')}>
                          {issues.length} issue{issues.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {pendingCount > 0 ? (
                        <span className="text-yellow-400 text-xs">
                          {pendingCount} pending
                        </span>
                      ) : (
                        <span className="text-green-400 text-xs">
                          Reviewed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="p-4">
                      {/* Issues */}
                      {issues.length > 0 && (
                        <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                          <p className="text-yellow-400 text-sm font-semibold mb-1">Issues to Review:</p>
                          <ul className="text-yellow-300 text-sm space-y-1">
                            {issues.map((issue, i) => (
                              <li key={i}>- {issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Courses table */}
                      <table className="w-full text-sm">
                        <thead className="text-gray-400 text-left">
                          <tr>
                            <th className="pb-2 w-20">Variant</th>
                            <th className="pb-2">Course Name</th>
                            <th className="pb-2 w-24 text-center">Employees</th>
                            <th className="pb-2 w-28">Action</th>
                            <th className="pb-2 w-28">Expiration</th>
                            <th className="pb-2">Notes</th>
                            <th className="pb-2 w-16"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortCourses(group.courses).map(course => (
                            <tr
                              key={course.course_id}
                              className={`border-t border-gray-700 ${
                                course.action === 'delete' ? 'opacity-40' : ''
                              }`}
                            >
                              {/* Variant */}
                              <td className="py-3">
                                <span className={`px-2 py-0.5 text-xs rounded ${getVariantColor(course.variant)}`}>
                                  {course.variant}
                                </span>
                              </td>

                              {/* Course Name */}
                              <td className="py-3">
                                <div className="text-gray-300">{course.requirement}</div>
                                <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                                  <span>ID: {course.course_id}</span>
                                  {/* Show if this course was already merged */}
                                  {course.merged_into && (
                                    <span className="text-purple-400">
                                      Merged → {course.merged_into}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Employee Count */}
                              <td className="py-3 text-center">
                                <span className={`text-lg font-semibold ${
                                  course.employee_count === 0 ? 'text-red-400' : 'text-white'
                                }`}>
                                  {course.employee_count}
                                </span>
                              </td>

                              {/* Action */}
                              <td className="py-3">
                                <select
                                  value={getValue(course, 'action') as string}
                                  onChange={(e) => updateLocal(course.course_id, {
                                    action: e.target.value as CourseInGroup['action']
                                  })}
                                  disabled={saving === course.course_id}
                                  className={`w-full px-2 py-1 rounded text-sm text-white border-0 cursor-pointer ${getActionColor(getValue(course, 'action') as string)}`}
                                >
                                  <option value="pending">Pending</option>
                                  <option value="keep">Keep</option>
                                  <option value="merge">Merge</option>
                                  <option value="delete">Delete</option>
                                </select>
                              </td>

                              {/* Expiration */}
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={getValue(course, 'is_one_time') === true}
                                      onChange={(e) => updateLocal(course.course_id, {
                                        is_one_time: e.target.checked,
                                        recert_months: e.target.checked ? null : course.recert_months
                                      })}
                                      disabled={saving === course.course_id}
                                      className="rounded"
                                    />
                                    One-time
                                  </label>
                                  {getValue(course, 'is_one_time') !== true && (
                                    <input
                                      type="number"
                                      placeholder="mo"
                                      value={(getValue(course, 'recert_months') as number) || ''}
                                      onChange={(e) => updateLocal(course.course_id, {
                                        recert_months: e.target.value ? parseInt(e.target.value) : null
                                      })}
                                      disabled={saving === course.course_id}
                                      className="w-14 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                                    />
                                  )}
                                </div>
                              </td>

                              {/* Notes */}
                              <td className="py-3">
                                <input
                                  type="text"
                                  placeholder="Add note..."
                                  value={(getValue(course, 'notes') as string) || ''}
                                  onChange={(e) => updateLocal(course.course_id, { notes: e.target.value })}
                                  disabled={saving === course.course_id}
                                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-500"
                                />
                              </td>

                              {/* Save button */}
                              <td className="py-3">
                                {hasChanges(course.course_id) && (
                                  <button
                                    onClick={() => saveCourse(course.course_id)}
                                    disabled={saving === course.course_id}
                                    className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded disabled:opacity-50"
                                  >
                                    {saving === course.course_id ? '...' : 'Save'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
