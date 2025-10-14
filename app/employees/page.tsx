'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

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

interface AllPosition {
  position_id: string;
  position_name: string;
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
}

interface Course {
  course_id: string;
  course_name: string;
  duration_months: number;
  is_active: boolean;
}

export default function EmployeesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Add position modal state
  const [showAddPositionModal, setShowAddPositionModal] = useState(false);
  const [allPositions, setAllPositions] = useState<AllPosition[]>([]);
  const [positionSearchQuery, setPositionSearchQuery] = useState('');
  const [addingPosition, setAddingPosition] = useState(false);

  // Add training modal state
  const [showAddTrainingModal, setShowAddTrainingModal] = useState(false);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [addTrainingForm, setAddTrainingForm] = useState({
    course_id: '',
    completion_date: '',
    expiration_date: '',
    duration_months: 0
  });
  const [addingTraining, setAddingTraining] = useState(false);

  // Position courses state
  const [positionCourses, setPositionCourses] = useState<{ [key: string]: Course[] }>({});

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

  const handleRemovePosition = async (employee_id: number, position_id: string, position_name: string) => {
    if (!confirm(`Remove position "${position_name}" from ${selectedEmployee?.employee_name}?\n\nThis will:\n- Remove this position assignment\n- Recalculate their training requirements\n- Cannot be undone!`)) {
      return;
    }

    try {
      const res = await fetch(`/api/employees/remove-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id, position_id })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to remove position');
        return;
      }

      alert(`Position removed successfully!`);
      if (selectedEmployee) {
        handleSelectEmployee(selectedEmployee);
      }
    } catch (error) {
      console.error('Error removing position:', error);
      alert('Failed to remove position');
    }
  };

  const openAddPositionModal = async () => {
    setShowAddPositionModal(true);
    setPositionSearchQuery('');

    // Fetch all positions
    try {
      const res = await fetch('/api/positions/list');
      const data = await res.json();
      setAllPositions(data.data || []);
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  const handleAddPosition = async (position_id: string, position_name: string) => {
    if (!selectedEmployee) return;

    if (!confirm(`Add position "${position_name}" to ${selectedEmployee.employee_name}?`)) {
      return;
    }

    setAddingPosition(true);

    try {
      const res = await fetch(`/api/employees/add-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: selectedEmployee.employee_id,
          position_id
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to add position');
        return;
      }

      alert('Position added successfully!');
      setShowAddPositionModal(false);
      handleSelectEmployee(selectedEmployee);
    } catch (error) {
      console.error('Error adding position:', error);
      alert('Failed to add position');
    } finally {
      setAddingPosition(false);
    }
  };

  const openAddTrainingModal = async () => {
    setShowAddTrainingModal(true);
    setCourseSearchQuery('');
    setSelectedCourse(null);
    setAddTrainingForm({
      course_id: '',
      completion_date: new Date().toISOString().split('T')[0],
      expiration_date: '',
      duration_months: 0
    });

    // Fetch all courses
    try {
      const res = await fetch('/api/courses/list');
      const data = await res.json();
      setAllCourses(data.data || []);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const calculateExpirationDate = (completionDate: string, months: number) => {
    if (!completionDate || !months) return '';
    const date = new Date(completionDate);
    date.setMonth(date.getMonth() + months);
    return date.toISOString().split('T')[0];
  };

  const handleDurationSelect = (months: number) => {
    const expirationDate = calculateExpirationDate(addTrainingForm.completion_date, months);
    setAddTrainingForm({
      ...addTrainingForm,
      duration_months: months,
      expiration_date: expirationDate
    });
  };

  const handleAddTraining = async () => {
    if (!selectedEmployee || !addTrainingForm.course_id || !addTrainingForm.completion_date) {
      alert('Course ID and Completion Date are required');
      return;
    }

    setAddingTraining(true);

    try {
      const res = await fetch(`/api/employees/add-training`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: selectedEmployee.employee_id,
          course_id: addTrainingForm.course_id,
          completion_date: addTrainingForm.completion_date,
          expiration_date: addTrainingForm.expiration_date || null
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to add training record');
        return;
      }

      alert('Training record added successfully!');
      setShowAddTrainingModal(false);
      handleSelectEmployee(selectedEmployee);
    } catch (error) {
      console.error('Error adding training:', error);
      alert('Failed to add training record');
    } finally {
      setAddingTraining(false);
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

  const filteredPositions = allPositions.filter(pos =>
    !positions.some(p => p.position_id === pos.position_id) &&
    (positionSearchQuery.length < 2 ||
      pos.position_name.toLowerCase().includes(positionSearchQuery.toLowerCase()) ||
      pos.position_id.toLowerCase().includes(positionSearchQuery.toLowerCase()))
  );

  const filteredCourses = allCourses.filter(course =>
    courseSearchQuery.length < 2 ||
    course.course_name.toLowerCase().includes(courseSearchQuery.toLowerCase()) ||
    course.course_id.toLowerCase().includes(courseSearchQuery.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col overflow-hidden">
      {/* 3 Column Layout */}
      <div className="grid grid-cols-12 gap-6 h-full overflow-hidden">

        {/* LEFT COLUMN - Search/Employee List */}
        <div className="col-span-3 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
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

                    {/* Job Codes */}
                    {positions.length > 0 && (() => {
                      const uniqueJobCodes = [...new Set(positions.map(p => p.job_code).filter(Boolean))];
                      return uniqueJobCodes.length > 0 && (
                        <p className="text-gray-400 text-xs">
                          Job Code{uniqueJobCodes.length > 1 ? 's' : ''}: {uniqueJobCodes.join(', ')}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        const newStatus = !selectedEmployee.is_active;
                        if (!confirm(`${newStatus ? 'Activate' : 'Deactivate'} ${selectedEmployee.employee_name}?\n\n${newStatus ? 'This will make them active in the system again.' : 'This will hide them from queries but keep their records.'}`)) {
                          return;
                        }

                        try {
                          const res = await fetch('/api/employees/toggle-active', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              employee_id: selectedEmployee.employee_id,
                              is_active: newStatus
                            })
                          });

                          const data = await res.json();

                          if (!res.ok) {
                            alert(data.error || 'Failed to toggle employee status');
                            return;
                          }

                          alert(`Employee ${newStatus ? 'activated' : 'deactivated'} successfully!`);
                          // Update local state
                          setSelectedEmployee({ ...selectedEmployee, is_active: newStatus });
                          // Refresh employee list
                          fetchEmployees(searchQuery);
                        } catch (error) {
                          console.error('Error toggling employee status:', error);
                          alert('Failed to toggle employee status');
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        selectedEmployee.is_active ? 'bg-gray-600' : 'bg-red-600'
                      }`}
                      title={selectedEmployee.is_active ? 'Active - Click to deactivate' : 'Inactive - Click to activate'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          selectedEmployee.is_active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className={`text-xs font-semibold ${selectedEmployee.is_active ? 'text-green-400' : 'text-gray-400'}`}>
                      {selectedEmployee.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Positions Header - aligned with Training Header */}
              <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h3 className="text-lg font-semibold">Positions ({positions.length})</h3>
                <button
                  onClick={openAddPositionModal}
                  className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors text-xs font-semibold"
                >
                  + Add Position
                </button>
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
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-200">{pos.position_name}</span>
                            <button
                              onClick={() => handleRemovePosition(selectedEmployee.employee_id, pos.position_id, pos.position_name)}
                              className="text-gray-400 hover:text-gray-200 font-bold text-sm"
                              title="Remove position"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Courses List - Always Visible */}
                          <div className="border-t border-gray-800 pt-2">
                            {courses.length === 0 ? (
                              <p className="text-xs text-gray-600 italic pl-4">No required courses</p>
                            ) : (
                              <div className="relative pl-6">
                                {/* Vertical timeline line */}
                                <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-gray-700"></div>

                                {/* Courses with timeline dots */}
                                <div className="space-y-3">
                                  {courses.map((course, index) => {
                                    const status = getCourseStatus(course.course_id);
                                    const statusColor = getStatusColorForCourse(status);
                                    // Convert bg-color to actual color for the dot
                                    const dotColor = statusColor.replace('bg-', '');

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
            <div className="col-span-5 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">Training Requirements</h3>
                  <button
                    onClick={openAddTrainingModal}
                    className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors text-xs font-semibold"
                  >
                    + Add Training
                  </button>
                </div>
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
                        <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Expires</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {trainingRecords.map((record, idx) => (
                        <tr key={idx} className="hover:bg-gray-700 transition-colors">
                          <td className="px-3 py-2">
                            <span className={`px-2 py-1 ${getStatusColor(record.status)} text-white rounded text-xs font-semibold`}>
                              {record.status === 'Never Completed' ? 'Missing' : record.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-300">
                            <div className="font-medium">{record.course_name}</div>
                            <div className="text-gray-500">ID: {record.required_course_id}</div>
                          </td>
                          <td className="px-3 py-2 text-gray-400">{record.position_name}</td>
                          <td className="px-3 py-2 text-gray-300">
                            {record.expiration_date ? (
                              <div>
                                <div>{new Date(record.expiration_date).toLocaleDateString()}</div>
                                <div className="text-xs text-yellow-400">
                                  {formatDistanceToNow(new Date(record.expiration_date), { addSuffix: true })}
                                </div>
                              </div>
                            ) : record.completion_date ? (
                              <span className="text-gray-500">No expiration</span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                        </tr>
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
            <div className="col-span-5 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
              <p className="text-gray-500">Training requirements will appear here</p>
            </div>
          </>
        )}
      </div>

      {/* Add Position Slide-out Panel */}
      <div className={`fixed top-0 left-0 h-full w-96 bg-gray-800 border-r border-gray-700 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${showAddPositionModal ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Add Position</h3>
              <button
                onClick={() => setShowAddPositionModal(false)}
                className="text-gray-400 hover:text-gray-200 font-bold text-xl"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">Adding to {selectedEmployee?.employee_name}</p>
            <input
              type="text"
              placeholder="Search positions..."
              value={positionSearchQuery}
              onChange={(e) => setPositionSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredPositions.length > 0 ? (
              <div className="divide-y divide-gray-700">
                {filteredPositions.map((position) => (
                  <button
                    key={position.position_id}
                    onClick={() => handleAddPosition(position.position_id, position.position_name)}
                    disabled={addingPosition}
                    className="w-full text-left px-4 py-3 hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    <div className="font-medium text-white text-sm">{position.position_name}</div>
                    <div className="text-xs text-gray-400">ID: {position.position_id}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                {positionSearchQuery.length >= 2 ? 'No positions found' : 'Type to search positions'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Training Slide-out Panel */}
      <div className={`fixed top-0 left-0 h-full w-[450px] bg-gray-800 border-r border-gray-700 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${showAddTrainingModal ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Add Training</h3>
              <button
                onClick={() => setShowAddTrainingModal(false)}
                className="text-gray-400 hover:text-gray-200 font-bold text-xl"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-4">Adding to {selectedEmployee?.employee_name}</p>

            {!selectedCourse ? (
              <>
                <p className="text-xs text-gray-500 mb-2">Step 1: Select a course</p>
                <input
                  type="text"
                  placeholder="Search courses..."
                  value={courseSearchQuery}
                  onChange={(e) => setCourseSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
                />
              </>
            ) : (
              <div className="bg-gray-900 p-3 rounded-lg">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-xs text-gray-500">Selected Course</p>
                    <p className="text-sm font-medium text-white">{selectedCourse.course_name}</p>
                    <p className="text-xs text-gray-400">ID: {selectedCourse.course_id}</p>
                    {selectedCourse.duration_months && (
                      <p className="text-xs text-blue-400">Default: {selectedCourse.duration_months} months</p>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedCourse(null)}
                    className="text-gray-400 hover:text-gray-200 text-sm"
                  >
                    Change
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Completion Date *</label>
                    <input
                      type="date"
                      value={addTrainingForm.completion_date}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setAddTrainingForm({ ...addTrainingForm, completion_date: newDate });
                        // Recalculate expiration if duration is set
                        if (addTrainingForm.duration_months > 0) {
                          const expirationDate = calculateExpirationDate(newDate, addTrainingForm.duration_months);
                          setAddTrainingForm(prev => ({ ...prev, completion_date: newDate, expiration_date: expirationDate }));
                        }
                      }}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-2">Duration (months)</label>
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {selectedCourse.duration_months && selectedCourse.duration_months > 0 && (
                        <button
                          onClick={() => handleDurationSelect(selectedCourse.duration_months!)}
                          className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                            addTrainingForm.duration_months === selectedCourse.duration_months
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {selectedCourse.duration_months}
                        </button>
                      )}
                      {[12, 24, 36, 48].filter(m => m !== selectedCourse.duration_months).map(months => (
                        <button
                          key={months}
                          onClick={() => handleDurationSelect(months)}
                          className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                            addTrainingForm.duration_months === months
                              ? 'bg-gray-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {months}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Expiration Date</label>
                    <input
                      type="date"
                      value={addTrainingForm.expiration_date}
                      onChange={(e) => setAddTrainingForm({ ...addTrainingForm, expiration_date: e.target.value, duration_months: 0 })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-gray-500"
                      placeholder="Or set manually"
                    />
                    <p className="text-xs text-gray-500 mt-1">Select duration or enter manually</p>
                  </div>

                  <button
                    onClick={handleAddTraining}
                    disabled={addingTraining}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors text-sm font-semibold disabled:opacity-50"
                  >
                    {addingTraining ? 'Adding...' : 'Add Training Record'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {!selectedCourse && (
            <div className="flex-1 overflow-y-auto">
              {filteredCourses.length > 0 ? (
                <div className="divide-y divide-gray-700">
                  {filteredCourses.map((course) => (
                    <button
                      key={course.course_id}
                      onClick={() => {
                        setSelectedCourse(course);
                        const duration = course.duration_months || 0;
                        const expirationDate = duration > 0
                          ? calculateExpirationDate(addTrainingForm.completion_date, duration)
                          : '';
                        setAddTrainingForm({
                          ...addTrainingForm,
                          course_id: course.course_id,
                          duration_months: duration,
                          expiration_date: expirationDate
                        });
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-700 transition-colors"
                    >
                      <div className="font-medium text-white text-sm">{course.course_name}</div>
                      <div className="text-xs text-gray-400">
                        ID: {course.course_id}
                        {course.duration_months && ` • ${course.duration_months} months`}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 text-sm">
                  {courseSearchQuery.length >= 2 ? 'No courses found' : 'Type to search courses'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
