'use client';

import React, { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface Employee {
  employee_id: number;
  badge_id: string;
  employee_name: string;
  positions: string;
  position_ids: string;
  is_active: boolean;
  leader?: string | null;
  role?: string | null;
  expiredCount?: number;
  expiring30Count?: number;
  expiring90Count?: number;
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

interface TeamStats {
  totalMembers: number;
  expiredCount: number;
  expiring30Count: number;
  expiring90Count: number;
}

export default function OrgTreePage() {
  const [managers, setManagers] = useState<string[]>([]);
  const [selectedLeader, setSelectedLeader] = useState<string>('');
  const [teamMembers, setTeamMembers] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [expandedTrainingRow, setExpandedTrainingRow] = useState<number | null>(null);
  const [teamStats, setTeamStats] = useState<TeamStats>({
    totalMembers: 0,
    expiredCount: 0,
    expiring30Count: 0,
    expiring90Count: 0
  });

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
    fetchManagers();
  }, []);

  useEffect(() => {
    if (selectedLeader) {
      fetchTeamMembers(selectedLeader);
    } else {
      setTeamMembers([]);
      setSelectedEmployee(null);
      setPositions([]);
      setTrainingRecords([]);
      setTeamStats({
        totalMembers: 0,
        expiredCount: 0,
        expiring30Count: 0,
        expiring90Count: 0
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeader]);

  const fetchManagers = async () => {
    try {
      const res = await fetch('/api/managers/list');
      const data = await res.json();
      setManagers(data.managers || []);
    } catch (error) {
      console.error('Error fetching managers:', error);
      setManagers([]);
    }
  };

  const fetchTeamMembers = async (leader: string) => {
    setLoadingTeam(true);
    try {
      // Get full employee data with positions and training counts
      const teamRes = await fetch(`/api/org-tree/team-with-stats?leader=${encodeURIComponent(leader)}`);
      const teamData = await teamRes.json();
      setTeamMembers(teamData.team || []);

      // Fetch team stats
      fetchTeamStats(leader);
    } catch (error) {
      console.error('Error fetching team members:', error);
      setTeamMembers([]);
    } finally {
      setLoadingTeam(false);
    }
  };

  const fetchTeamStats = async (leader: string) => {
    try {
      const res = await fetch(`/api/org-tree/team-stats?leader=${encodeURIComponent(leader)}`);
      const data = await res.json();
      setTeamStats({
        totalMembers: data.totalMembers || 0,
        expiredCount: data.expiredCount || 0,
        expiring30Count: data.expiring30Count || 0,
        expiring90Count: data.expiring90Count || 0
      });
    } catch (error) {
      console.error('Error fetching team stats:', error);
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
    } catch (error) {
      console.error('Error fetching employee details:', error);
      setPositions([]);
      setTrainingRecords([]);
    } finally {
      setLoadingDetails(false);
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
    <div className="h-[calc(100vh-80px)] flex flex-col overflow-hidden">
      {/* Leader Selection + Team Stats */}
      <div className="mb-6 bg-gray-800 rounded-lg border border-gray-700 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-300 whitespace-nowrap">Select Leader:</label>
            <select
              value={selectedLeader}
              onChange={(e) => setSelectedLeader(e.target.value)}
              className="w-64 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-gray-500"
            >
              <option value="">-- Select a Leader --</option>
              {managers.map((manager) => (
                <option key={manager} value={manager}>
                  {manager}
                </option>
              ))}
            </select>
          </div>

          {/* Team Stats */}
          {selectedLeader && (
            <>
              <div className="h-8 w-px bg-gray-700"></div>
              <div className="flex gap-4 flex-1">
                <div className="bg-gray-900 rounded-lg p-3 flex-1">
                  <div className="text-xs text-gray-400 mb-1">Team Members</div>
                  <div className="text-2xl font-bold text-white">{teamStats.totalMembers}</div>
                </div>
                <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-3 flex-1">
                  <div className="text-xs text-red-400 mb-1">Expired / Missing</div>
                  <div className="text-2xl font-bold text-red-400">{teamStats.expiredCount}</div>
                </div>
                <div className="bg-orange-900/20 border border-orange-900/50 rounded-lg p-3 flex-1">
                  <div className="text-xs text-orange-400 mb-1">Expiring in 30 Days</div>
                  <div className="text-2xl font-bold text-orange-400">{teamStats.expiring30Count}</div>
                </div>
                <div className="bg-yellow-900/20 border border-yellow-900/50 rounded-lg p-3 flex-1">
                  <div className="text-xs text-yellow-400 mb-1">Expiring in 90 Days</div>
                  <div className="text-2xl font-bold text-yellow-400">{teamStats.expiring90Count}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3 Column Layout - Same as Employees Page */}
      {selectedLeader ? (
        <div className="grid grid-cols-12 gap-6 h-full overflow-hidden">
          {/* LEFT COLUMN - Team Members List */}
          <div className="col-span-2 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-sm font-semibold">Team Members</h3>
              <p className="text-xs text-gray-400 mt-1">Reports to {selectedLeader}</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingTeam ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  Loading team members...
                </div>
              ) : teamMembers.length > 0 ? (
                <div className="divide-y divide-gray-700">
                  {teamMembers.map((employee) => (
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
                      <div className="text-xs text-gray-400 mb-2">Badge: {employee.badge_id}</div>

                      {/* Training Status Counts */}
                      <div className="space-y-1">
                        {(employee.expiredCount ?? 0) > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-600"></div>
                            <span className="text-xs text-red-400 font-semibold">
                              Expired / Missing: {employee.expiredCount}
                            </span>
                          </div>
                        )}
                        {(employee.expiring30Count ?? 0) > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-orange-600"></div>
                            <span className="text-xs text-orange-400 font-semibold">
                              Expiring in 30 Days: {employee.expiring30Count}
                            </span>
                          </div>
                        )}
                        {(employee.expiring90Count ?? 0) > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-600"></div>
                            <span className="text-xs text-yellow-400 font-semibold">
                              Expiring in 90 Days: {employee.expiring90Count}
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No team members found
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
                <div className="p-6 border-b border-gray-700 bg-gray-900">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white">{selectedEmployee.employee_name}</h2>
                      <p className="text-gray-400 text-sm mt-0.5">Badge ID: {selectedEmployee.badge_id}</p>
                    </div>
                    <div className={`px-3 py-1 rounded text-sm ${
                      selectedEmployee.is_active ? 'bg-gray-700 text-green-400' : 'bg-red-900 text-red-400'
                    }`}>
                      {selectedEmployee.is_active ? 'Active' : 'Inactive'}
                    </div>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {selectedEmployee.role && (
                      <div className="bg-gray-800 rounded-lg p-3 col-span-2">
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Role</label>
                        <span className="text-sm text-white">{selectedEmployee.role}</span>
                      </div>
                    )}

                    {positions.length > 0 && (() => {
                      const uniqueJobCodes = [...new Set(positions.map(p => p.job_code).filter(Boolean))];
                      return uniqueJobCodes.length > 0 && (
                        <div className="bg-gray-800 rounded-lg p-3">
                          <label className="block text-xs font-medium text-gray-400 mb-1.5">
                            Job Code{uniqueJobCodes.length > 1 ? 's' : ''}
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {uniqueJobCodes.map((code) => (
                              <span key={code} className="px-2 py-1 bg-gray-700 text-white text-sm rounded">
                                {code}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="bg-gray-800 rounded-lg p-3">
                      <label className="block text-xs font-medium text-gray-400 mb-1.5">Leader</label>
                      <span className="text-sm text-white">{selectedEmployee.leader || 'Not assigned'}</span>
                    </div>
                  </div>
                </div>

                {/* Positions Header */}
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Positions ({positions.length})</h3>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {loadingDetails ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {positions.map((pos) => (
                        <div key={pos.position_id} className="bg-gray-900 rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-200">{pos.position_name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN - Training Records */}
              <div className="col-span-6 bg-gray-800 rounded-lg border border-gray-700 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-700">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">Training Requirements</h3>
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
                                        // Set time to end of day (23:59:59) so certificates expire at day's end
                                        const expDate = new Date(year, month - 1, day, 23, 59, 59);
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
                <p className="text-gray-500">Select a team member to view details</p>
              </div>

              {/* RIGHT COLUMN - Placeholder */}
              <div className="col-span-6 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center">
                <p className="text-gray-500">Training requirements will appear here</p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-800 rounded-lg border border-gray-700">
          <div className="text-center">
            <p className="text-xl text-gray-400">Select a leader to view their team</p>
          </div>
        </div>
      )}
    </div>
  );
}
