'use client';

import { useState, useEffect } from 'react';

interface Employee {
  employee_id: number;
  badge_id: string;
  employee_name: string;
  is_active: boolean;
  created_at: string;
}

interface Certificate {
  training_id: number;
  course_id: string;
  course_name: string;
  duration_months: number | null;
  completion_date: string;
  expiration_date: string | null;
  created_at: string;
  status: string;
  notes: string | null;
}

export default function RawUserPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingCertificates, setLoadingCertificates] = useState(false);
  const [expandedCertificateRow, setExpandedCertificateRow] = useState<number | null>(null);

  // Helper function to format dates - extracts just the date portion to avoid timezone issues
  const formatEasternDate = (dateString: string | null | undefined): string => {
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
    // Load initial employees
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
    setLoadingCertificates(true);
    setCertificates([]);
    setExpandedCertificateRow(null); // Reset expanded row when changing employees

    try {
      const res = await fetch(`/api/employees/certificates?badge_id=${encodeURIComponent(employee.badge_id)}`);
      const data = await res.json();

      if (res.ok) {
        setCertificates(data.certificates || []);
      } else {
        console.error('Error fetching certificates:', data.error);
        setCertificates([]);
      }
    } catch (error) {
      console.error('Error fetching certificates:', error);
      setCertificates([]);
    } finally {
      setLoadingCertificates(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Valid':
        return 'bg-green-600';
      case 'Expired':
        return 'bg-red-600';
      case 'No Expiration':
        return 'bg-blue-600';
      default:
        return 'bg-gray-600';
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col overflow-hidden">
      {/* 2 Column Layout */}
      <div className="grid grid-cols-12 gap-6 h-full overflow-hidden">

        {/* LEFT COLUMN - Search/Employee List */}
        <div className="col-span-3 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Search Employees</h3>
            <input
              type="text"
              placeholder="Search by name or badge..."
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

        {/* RIGHT COLUMN - Certificate Details */}
        {selectedEmployee ? (
          <div className="col-span-9 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
            {/* Employee Header */}
            <div className="p-4 border-b border-gray-700 bg-gray-900">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">{selectedEmployee.employee_name}</h2>
                  <p className="text-gray-400 text-xs">Badge: {selectedEmployee.badge_id}</p>
                  <p className="text-gray-400 text-xs">Employee ID: {selectedEmployee.employee_id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${selectedEmployee.is_active ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
                    {selectedEmployee.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* Certificates Table Header */}
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold">All Certificates - Raw Data ({certificates.length})</h3>
              <p className="text-sm text-gray-400 mt-1">Complete training history with all fields</p>
            </div>

            {/* Certificates Table */}
            <div className="flex-1 overflow-y-auto">
              {loadingCertificates ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              ) : certificates.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No certificates found for this employee
                </div>
              ) : (
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-900 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Training ID</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Course ID</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Course Name</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Completion Date</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Expiration Date</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Duration (Months)</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-400 uppercase">Record Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {certificates.map((cert, idx) => (
                      <>
                        <tr
                          key={cert.training_id}
                          onClick={() => setExpandedCertificateRow(expandedCertificateRow === idx ? null : idx)}
                          className="hover:bg-gray-700 transition-colors cursor-pointer"
                        >
                          <td className="px-3 py-2 text-gray-300 font-mono">
                            <div className="flex items-center gap-2">
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${expandedCertificateRow === idx ? 'rotate-90' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              {cert.training_id}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-1 ${getStatusColor(cert.status)} text-white rounded text-xs font-semibold`}>
                              {cert.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-300 font-mono">{cert.course_id}</td>
                          <td className="px-3 py-2 text-gray-200">{cert.course_name}</td>
                          <td className="px-3 py-2 text-gray-300">
                            {formatEasternDate(cert.completion_date)}
                          </td>
                          <td className="px-3 py-2 text-gray-300">
                            {cert.expiration_date ? (
                              <span className={cert.status === 'Expired' ? 'text-red-400 font-semibold' : ''}>
                                {formatEasternDate(cert.expiration_date)}
                              </span>
                            ) : (
                              <span className="text-blue-400">No Expiration</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-center">
                            {cert.duration_months ?? '-'}
                          </td>
                          <td className="px-3 py-2 text-gray-400">
                            {formatEasternDate(cert.created_at)}
                          </td>
                        </tr>
                        {expandedCertificateRow === idx && (
                          <tr key={`${cert.training_id}-expanded`} className="bg-gray-900">
                            <td colSpan={8} className="px-3 py-3">
                              <div className="pl-8">
                                <div className="text-xs font-semibold text-gray-400 mb-1">Notes:</div>
                                {cert.notes ? (
                                  <div className="text-sm text-gray-300 whitespace-pre-wrap">{cert.notes}</div>
                                ) : (
                                  <div className="text-sm text-gray-500 italic">No notes recorded</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="col-span-9 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 text-lg">Select an employee to view their certificates</p>
              <p className="text-gray-600 text-sm mt-2">All raw certificate data will be displayed</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
