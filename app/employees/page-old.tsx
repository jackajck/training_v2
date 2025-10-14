'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface Employee {
  employee_id: number;
  badge_id: string;
  employee_name: string;
  positions: string;  // Comma-separated position names
  position_ids: string;  // Comma-separated position IDs
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
  position_name: string;  // Which position requires this course
  completion_date: string | null;
  expiration_date: string | null;
  status: string;
}

export default function EmployeesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const handleSearch = async () => {
    if (searchQuery.length < 2) {
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/employees/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.data || []);
    } catch (error) {
      console.error('Error searching employees:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectEmployee = async (employee: Employee) => {
    setSelectedEmployee(employee);
    setLoadingDetails(true);

    try {
      const res = await fetch(`/api/employees/${employee.badge_id}`);
      const data = await res.json();
      setPositions(data.positions || []);
      setTrainingRecords(data.training || []);
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
        body: JSON.stringify({
          employee_id,
          position_id
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to remove position');
        return;
      }

      alert(`Position "${position_name}" removed successfully!`);

      // Refresh employee details
      if (selectedEmployee) {
        handleSelectEmployee(selectedEmployee);
      }

    } catch (error) {
      console.error('Error removing position:', error);
      alert('Failed to remove position');
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
    <div>
      <h1 className="text-3xl font-bold mb-6">Employees</h1>
      <p className="text-gray-400 mb-8">Search for employees and view their training requirements</p>

      {/* Search Box */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search by name or badge ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-gray-500"
          />
          <button
            onClick={handleSearch}
            disabled={searching || searchQuery.length < 2}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 transition-colors"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-4">{searchResults.length} Results</h3>
          <div className="space-y-2">
            {searchResults.map((employee) => (
              <button
                key={employee.badge_id}
                onClick={() => handleSelectEmployee(employee)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  selectedEmployee?.badge_id === employee.badge_id
                    ? 'bg-gray-700 border-l-4 border-blue-500'
                    : 'bg-gray-900 hover:bg-gray-700'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-white">{employee.employee_name}</div>
                    <div className="text-sm text-gray-400">
                      Badge: {employee.badge_id}
                    </div>
                    {employee.positions && (
                      <div className="text-xs text-gray-500 mt-1">
                        Positions: {employee.positions}
                      </div>
                    )}
                  </div>
                  {!employee.is_active && (
                    <span className="px-2 py-1 bg-red-600 text-white text-xs rounded">Inactive</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Employee Details */}
      {selectedEmployee && (
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-6 border-b border-gray-700">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold">{selectedEmployee.employee_name}</h2>
                <p className="text-gray-400">Badge ID: {selectedEmployee.badge_id}</p>

                {/* Show unique job codes */}
                {positions.length > 0 && (() => {
                  const uniqueJobCodes = [...new Set(positions.map(p => p.job_code).filter(Boolean))];
                  return uniqueJobCodes.length > 0 && (
                    <p className="text-gray-400">
                      Job Code{uniqueJobCodes.length > 1 ? 's' : ''}: {uniqueJobCodes.join(', ')}
                    </p>
                  );
                })()}

                {/* Show positions */}
                {positions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-gray-300">Positions ({positions.length}):</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {positions.map((pos) => (
                        <span
                          key={pos.position_id}
                          className="px-3 py-1 bg-blue-900 text-blue-200 rounded-lg text-sm flex items-center gap-2"
                        >
                          <span>{pos.position_name}</span>
                          <button
                            onClick={() => handleRemovePosition(selectedEmployee.employee_id, pos.position_id, pos.position_name)}
                            className="text-gray-400 hover:text-gray-200 font-bold text-xs"
                            title="Remove this position"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {!selectedEmployee.is_active && (
                <span className="px-3 py-1 bg-red-600 text-white rounded">Inactive</span>
              )}
            </div>
          </div>

          {loadingDetails ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                      Course Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                      Required By Position
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                      Course ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                      Duration (months)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                      Completion Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Expiration Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {trainingRecords.map((record, idx) => (
                    <tr key={idx} className="hover:bg-gray-700 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap border-r border-gray-700">
                        <span className={`px-2 py-1 ${getStatusColor(record.status)} text-white rounded text-xs font-semibold`}>
                          {record.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 border-r border-gray-700">
                        {record.course_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400 border-r border-gray-700">
                        <span className="px-2 py-1 bg-gray-700 rounded text-xs">
                          {record.position_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400 border-r border-gray-700">
                        {record.required_course_id}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 border-r border-gray-700">
                        {record.duration_months || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 border-r border-gray-700">
                        {record.completion_date
                          ? new Date(record.completion_date).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300">
                        {record.expiration_date ? (
                          <div>
                            <div>{new Date(record.expiration_date).toLocaleDateString()}</div>
                            <div className="text-xs text-yellow-400">
                              {formatDistanceToNow(new Date(record.expiration_date), { addSuffix: true })}
                            </div>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
