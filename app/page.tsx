'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

type TabType = 'expired' | '7days' | '30days' | '90days';

interface TrainingRecord {
  training_id: number;
  badge_id: string;
  employee_name: string;
  course_id: string;
  course_name: string;
  completion_date: string;
  expiration_date: string;
  job_code: string;
  job_title: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('expired');
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [counts, setCounts] = useState({ expired: 0, '7days': 0, '30days': 0, '90days': 0 });
  const [loading, setLoading] = useState(true);

  // Helper function to format dates - extracts just the date portion to avoid timezone issues
  const formatEasternDate = (dateString: string | null | undefined): string => {
    if (!dateString || dateString === '' || dateString === 'null') return '';
    try {
      // Convert to string if it's a Date object
      const dateStr = typeof dateString === 'string' ? dateString : dateString.toString();

      // Extract just the date portion (YYYY-MM-DD) to avoid timezone conversion issues
      const datePart = dateStr.split('T')[0];
      const [year, month, day] = datePart.split('-').map(Number);

      // Create date using local timezone
      const date = new Date(year, month - 1, day);
      if (isNaN(date.getTime())) return '';

      return date.toLocaleDateString('en-US');
    } catch (e) {
      console.error('Date formatting error:', e, dateString);
      return '';
    }
  };

  // Fetch counts for all tabs
  useEffect(() => {
    fetchAllCounts();
  }, []);

  // Fetch records when tab changes
  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchAllCounts = async () => {
    try {
      const [expiredRes, days7Res, days30Res, days90Res] = await Promise.all([
        fetch('/api/training/expiring?period=expired&countOnly=true'),
        fetch('/api/training/expiring?period=7days&countOnly=true'),
        fetch('/api/training/expiring?period=30days&countOnly=true'),
        fetch('/api/training/expiring?period=90days&countOnly=true'),
      ]);

      const [expired, days7, days30, days90] = await Promise.all([
        expiredRes.json(),
        days7Res.json(),
        days30Res.json(),
        days90Res.json(),
      ]);

      setCounts({
        expired: expired.count || 0,
        '7days': days7.count || 0,
        '30days': days30.count || 0,
        '90days': days90.count || 0,
      });
    } catch (error) {
      console.error('Error fetching counts:', error);
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/training/expiring?period=${activeTab}`);
      const json = await res.json();
      setRecords(json.data || []);
    } catch (error) {
      console.error('Error fetching records:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = async () => {
    try {
      // Fetch ALL records for download (not limited to 100)
      const res = await fetch(`/api/training/expiring?period=${activeTab}&download=true`);
      const json = await res.json();
      const allRecords = json.data || [];

      if (allRecords.length === 0) {
        alert('No records to download');
        return;
      }

      // CSV headers
      const headers = ['Status', 'Employee Name', 'Badge ID', 'Job Title', 'Job Code', 'Training Course', 'Course ID', 'Completion Date', 'Expiration Date', 'Time Until Expiry'];

      // CSV rows
      const rows = allRecords.map((record: TrainingRecord) => {
        // Parse expiration date properly to avoid timezone issues
        let expDate: Date | null = null;
        if (record.expiration_date) {
          const dateStr = typeof record.expiration_date === 'string' ? record.expiration_date : record.expiration_date.toString();
          const datePart = dateStr.split('T')[0];
          const [year, month, day] = datePart.split('-').map(Number);
          expDate = new Date(year, month - 1, day);
        }
        const isExpired = expDate ? expDate < new Date() : false;
        const status = isExpired ? 'Expired' : 'Expiring';
        const timeUntilExpiry = expDate ? formatDistanceToNow(expDate, { addSuffix: true }) : 'N/A';
        const completionDate = formatEasternDate(record.completion_date);

        return [
          status,
          record.employee_name,
          record.badge_id,
          record.job_title || 'N/A',
          record.job_code,
          record.course_name,
          record.course_id,
          completionDate || '-',
          formatEasternDate(record.expiration_date) || 'No Expiration',
          timeUntilExpiry
        ];
      });

      // Create CSV content
      const csvContent = [
        headers.join(','),
        ...rows.map((row: (string | number)[]) => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const tabNames = {
        'expired': 'Expired',
        '7days': 'Next_7_Days',
        '30days': 'Next_30_Days',
        '90days': 'Next_90_Days'
      };

      link.setAttribute('href', url);
      link.setAttribute('download', `Training_${tabNames[activeTab]}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading CSV:', error);
      alert('Failed to download CSV');
    }
  };

  const tabs = [
    { id: 'expired' as TabType, label: 'Expired', count: counts.expired, color: 'red' },
    { id: '7days' as TabType, label: 'Next 7 Days', count: counts['7days'], color: 'orange' },
    { id: '30days' as TabType, label: 'Next 30 Days', count: counts['30days'], color: 'yellow' },
    { id: '90days' as TabType, label: 'Next 90 Days', count: counts['90days'], color: 'blue' },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Expiring Soon</h1>
      <p className="text-gray-400 mb-8">Training certifications that are expiring or have expired</p>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {tab.label}
            <span className={`ml-2 px-2 py-0.5 rounded text-xs font-semibold ${
              activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
          <p className="text-gray-400">No training expiring in this period</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <div>
              <h3 className="text-lg font-semibold">{records.length} Records {counts[activeTab] > 100 && '(showing first 100)'}</h3>
              {counts[activeTab] > 100 && (
                <p className="text-xs text-gray-400 mt-1">
                  Total: {counts[activeTab]} records • Download CSV to get all records
                </p>
              )}
            </div>
            <button
              onClick={downloadCSV}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors text-sm font-semibold"
            >
              Download CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                    Job Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                    Training Course
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                    Completion Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider border-r border-gray-700">
                    Expiration Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Time Until Expiry
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {records.map((record, idx) => {
                  // Parse expiration date properly to avoid timezone issues
                  let expDate: Date | null = null;
                  if (record.expiration_date) {
                    const dateStr = typeof record.expiration_date === 'string' ? record.expiration_date : record.expiration_date.toString();
                    const datePart = dateStr.split('T')[0];
                    const [year, month, day] = datePart.split('-').map(Number);
                    expDate = new Date(year, month - 1, day);
                  }
                  const isExpired = expDate ? expDate < new Date() : false;
                  return (
                    <tr key={idx} className="hover:bg-gray-700 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap border-r border-gray-700">
                        {isExpired ? (
                          <span className="px-2 py-1 bg-red-600 text-white rounded text-xs font-semibold">Expired</span>
                        ) : (
                          <span className="px-2 py-1 bg-yellow-600 text-white rounded text-xs font-semibold">Expiring</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap border-r border-gray-700">
                        <div className="text-sm font-medium">{record.employee_name}</div>
                        <div className="text-sm text-gray-400">{record.badge_id}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 border-r border-gray-700">
                        <div>{record.job_title || 'N/A'}</div>
                        <div className="text-xs text-gray-500">{record.job_code}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 border-r border-gray-700">
                        <div>{record.course_name}</div>
                        <div className="text-xs text-gray-500">{record.course_id}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 border-r border-gray-700">
                        {formatEasternDate(record.completion_date) || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 border-r border-gray-700">
                        {formatEasternDate(record.expiration_date) || 'No Expiration'}
                      </td>
                      <td className="px-6 py-4 text-sm text-yellow-400">
                        {expDate ? formatDistanceToNow(expDate, { addSuffix: true }) : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
