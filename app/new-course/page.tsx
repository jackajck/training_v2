'use client';

import { useState } from 'react';

export default function NewCoursePage() {
  const [courseName, setCourseName] = useState('');
  const [durationMonths, setDurationMonths] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdCourse, setCreatedCourse] = useState<{ course_id: string; course_name: string; duration_months: number | null } | null>(null);

  const handleSubmit = async () => {
    // Validation
    if (!courseName.trim()) {
      alert('Course name is required');
      return;
    }

    const duration = durationMonths ? parseInt(durationMonths) : null;
    if (durationMonths && (isNaN(duration!) || duration! <= 0)) {
      alert('Duration must be a positive number');
      return;
    }

    if (!confirm(`Create new course?\n\nCourse Name: ${courseName}\nDuration: ${duration ? `${duration} months` : 'Not specified'}`)) {
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/courses/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_name: courseName,
          duration_months: duration
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to create course');
        return;
      }

      alert(`Course created successfully!\nID: ${data.course.course_id}`);
      setCreatedCourse(data.course);
      // Reset form
      setCourseName('');
      setDurationMonths('');
    } catch (error) {
      console.error('Error creating course:', error);
      alert('Failed to create course');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      <h1 className="text-3xl font-bold mb-2">New Course</h1>
      <p className="text-gray-400 mb-6">Create a new course with auto-generated ID (999**)</p>

      <div className="max-w-2xl">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="space-y-6">
            {/* Info Box */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
              <p className="text-sm text-blue-300">
                <strong>Note:</strong> The course ID will be automatically generated starting from 99900 to avoid conflicts with legacy course IDs.
              </p>
            </div>

            {/* Course Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Course Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="Enter course name (e.g., Safety Training, Forklift Certification)..."
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-gray-500"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Duration (months) <span className="text-gray-500 text-xs">(optional)</span>
              </label>
              <input
                type="number"
                value={durationMonths}
                onChange={(e) => setDurationMonths(e.target.value)}
                placeholder="Enter duration in months (e.g., 12, 24)..."
                min="1"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-gray-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                If specified, this determines how often employees need to renew this certification.
              </p>
            </div>

            {/* Last Created Course */}
            {createdCourse && (
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                <p className="text-sm text-green-300 font-medium mb-1">✓ Last Created Course</p>
                <p className="text-white font-semibold">{createdCourse.course_name}</p>
                <p className="text-sm text-gray-400">ID: {createdCourse.course_id}</p>
                {createdCourse.duration_months && (
                  <p className="text-sm text-gray-400">Duration: {createdCourse.duration_months} months</p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !courseName.trim()}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors font-semibold"
            >
              {submitting ? 'Creating Course...' : 'Create Course'}
            </button>

            {/* Next Steps */}
            <div className="border-t border-gray-700 pt-6">
              <h3 className="text-sm font-medium text-gray-300 mb-2">After Creating:</h3>
              <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
                <li>Go to the <strong className="text-white">Positions</strong> page to assign this course to positions</li>
                <li>New courses are automatically available when adding training records</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
