'use client';

import { useState, useEffect } from 'react';

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
  is_active: boolean;
  course_count: number;
  employee_count: number;
}

export default function NewEmployeePage() {
  // Form state
  const [badgeId, setBadgeId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());

  // Mirror feature state
  const [mirrorSearchQuery, setMirrorSearchQuery] = useState('');
  const [mirrorResults, setMirrorResults] = useState<Employee[]>([]);
  const [selectedMirrorEmployee, setSelectedMirrorEmployee] = useState<Employee | null>(null);
  const [searchingMirror, setSearchingMirror] = useState(false);

  // Positions state
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [positionSearchQuery, setPositionSearchQuery] = useState('');
  const [loadingPositions, setLoadingPositions] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPositions();
  }, []);

  const fetchPositions = async () => {
    setLoadingPositions(true);
    try {
      const res = await fetch('/api/positions/list');
      const data = await res.json();
      console.log('All positions loaded:', data.data?.length || 0);
      setAllPositions(data.data || []);
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setLoadingPositions(false);
    }
  };

  const handleMirrorSearch = async () => {
    if (mirrorSearchQuery.length < 2) {
      alert('Please enter at least 2 characters to search');
      return;
    }

    setSearchingMirror(true);
    try {
      const res = await fetch(`/api/employees/search?q=${encodeURIComponent(mirrorSearchQuery)}`);
      const data = await res.json();
      setMirrorResults(data.data || []);
    } catch (error) {
      console.error('Error searching employees:', error);
      setMirrorResults([]);
    } finally {
      setSearchingMirror(false);
    }
  };

  const handleMirrorSelect = (employee: Employee) => {
    console.log('=== MIRROR DEBUG ===');
    console.log('Selected employee:', employee);
    console.log('Raw position_ids string:', employee.position_ids);

    setSelectedMirrorEmployee(employee);
    // Mirror the positions
    if (employee.position_ids) {
      const positionIdsArray = employee.position_ids.split(', ').filter(Boolean);
      console.log('Split position IDs array:', positionIdsArray);
      console.log('Number of positions to copy:', positionIdsArray.length);
      setSelectedPositions(new Set(positionIdsArray));
      console.log('New selectedPositions Set:', new Set(positionIdsArray));
    } else {
      console.log('No position_ids found for this employee');
    }
  };

  const handleClearMirror = () => {
    setSelectedMirrorEmployee(null);
    setMirrorSearchQuery('');
    setMirrorResults([]);
  };

  const togglePosition = (position_id: string) => {
    const newSelected = new Set(selectedPositions);
    if (newSelected.has(position_id)) {
      newSelected.delete(position_id);
    } else {
      newSelected.add(position_id);
    }
    setSelectedPositions(newSelected);
  };

  const handleSubmit = async () => {
    // Validation
    if (!badgeId.trim()) {
      alert('Badge ID is required');
      return;
    }

    if (!employeeName.trim()) {
      alert('Employee Name is required');
      return;
    }

    if (selectedPositions.size === 0) {
      alert('At least one position is required');
      return;
    }

    if (!confirm(`Create new employee?\n\nName: ${employeeName}\nBadge ID: ${badgeId}\nPositions: ${selectedPositions.size}`)) {
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/employees/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          badge_id: badgeId,
          employee_name: employeeName,
          position_ids: Array.from(selectedPositions)
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to create employee');
        return;
      }

      alert('Employee created successfully!');
      // Reset form
      setBadgeId('');
      setEmployeeName('');
      setSelectedPositions(new Set());
      setSelectedMirrorEmployee(null);
      setMirrorSearchQuery('');
      setMirrorResults([]);
    } catch (error) {
      console.error('Error creating employee:', error);
      alert('Failed to create employee');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPositions = allPositions.filter(pos =>
    positionSearchQuery.length < 2 ||
    pos.position_name.toLowerCase().includes(positionSearchQuery.toLowerCase()) ||
    pos.position_id.toLowerCase().includes(positionSearchQuery.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col overflow-hidden">
      <h1 className="text-3xl font-bold mb-2">New Employee</h1>
      <p className="text-gray-400 mb-6">Create a new employee record with positions</p>

      {/* 3 Column Layout */}
      <div className="grid grid-cols-12 gap-6 h-full overflow-hidden">

        {/* LEFT COLUMN - Mirror Employee Search */}
        <div className="col-span-3 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Mirror Employee</h3>
            <p className="text-xs text-gray-400 mb-3">Search an existing employee to copy their positions</p>
            <input
              type="text"
              placeholder="Search employees..."
              value={mirrorSearchQuery}
              onChange={(e) => setMirrorSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleMirrorSearch()}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
            />
            <button
              onClick={handleMirrorSearch}
              disabled={searchingMirror}
              className="w-full mt-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors text-sm font-semibold"
            >
              {searchingMirror ? 'Searching...' : 'Search'}
            </button>
          </div>

          {selectedMirrorEmployee ? (
            <div className="p-4 bg-gray-900 border-b border-gray-700">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-xs text-gray-500">Mirroring</p>
                  <p className="text-sm font-medium text-white">{selectedMirrorEmployee.employee_name}</p>
                  <p className="text-xs text-gray-400">Badge: {selectedMirrorEmployee.badge_id}</p>
                </div>
                <button
                  onClick={handleClearMirror}
                  className="text-gray-400 hover:text-gray-200 text-sm"
                >
                  Clear
                </button>
              </div>
              <p className="text-xs text-green-400">✓ {selectedPositions.size} positions copied</p>
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto">
            {mirrorResults.length > 0 ? (
              <div className="divide-y divide-gray-700">
                {mirrorResults.map((employee) => (
                  <button
                    key={employee.employee_id}
                    onClick={() => handleMirrorSelect(employee)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      selectedMirrorEmployee?.employee_id === employee.employee_id
                        ? 'bg-gray-700 border-l-4 border-blue-500'
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-medium text-white text-sm">{employee.employee_name}</div>
                    <div className="text-xs text-gray-400">Badge: {employee.badge_id}</div>
                    {employee.positions && (
                      <div className="text-xs text-gray-500 mt-1 truncate">{employee.positions}</div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                {searchingMirror ? 'Searching...' : 'Search to mirror positions from an existing employee'}
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE COLUMN - Employee Info & Basic Form */}
        <div className="col-span-4 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold">Employee Information</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {/* Badge ID */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Badge ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={badgeId}
                  onChange={(e) => setBadgeId(e.target.value)}
                  placeholder="Enter badge ID..."
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
                />
              </div>

              {/* Employee Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Employee Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="Enter full name..."
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
                />
              </div>

              {/* Selected Positions Summary */}
              <div className="pt-4 border-t border-gray-700">
                <h4 className="text-sm font-medium text-gray-300 mb-2">
                  Selected Positions ({selectedPositions.size}) <span className="text-red-500">*</span>
                </h4>
                {selectedPositions.size > 0 ? (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {Array.from(selectedPositions).map((position_id) => {
                      const position = allPositions.find(p => p.position_id === position_id);
                      return (
                        <div key={position_id} className="flex items-center justify-between bg-gray-900 px-3 py-2 rounded text-sm">
                          <span className="text-white">
                            {position ? position.position_name : `Position ID: ${position_id} (loading...)`}
                          </span>
                          <button
                            onClick={() => togglePosition(position_id)}
                            className="text-gray-400 hover:text-gray-200 font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No positions selected. Select from the right panel.</p>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !badgeId || !employeeName || selectedPositions.size === 0}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors font-semibold"
                >
                  {submitting ? 'Creating Employee...' : 'Create Employee'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - Position Selection */}
        <div className="col-span-5 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Select Positions</h3>
            <input
              type="text"
              placeholder="Search positions..."
              value={positionSearchQuery}
              onChange={(e) => setPositionSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingPositions ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            ) : filteredPositions.length > 0 ? (
              <div className="divide-y divide-gray-700">
                {filteredPositions.map((position) => {
                  const isSelected = selectedPositions.has(position.position_id);
                  return (
                    <button
                      key={position.position_id}
                      onClick={() => togglePosition(position.position_id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        isSelected
                          ? 'bg-blue-900 border-l-4 border-blue-500'
                          : 'hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-white text-sm">{position.position_name}</div>
                          <div className="text-xs text-gray-400">ID: {position.position_id}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {position.course_count} courses • {position.employee_count} employees
                          </div>
                        </div>
                        {isSelected && (
                          <span className="text-blue-400 font-bold text-lg">✓</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">
                {positionSearchQuery.length >= 2 ? 'No positions found' : 'Type to search positions'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
