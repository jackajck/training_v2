"use client";

import { useState } from "react";

interface Report {
  id: string;
  title: string;
  description: string;
  structure: string[];
  colorScheme: {
    color: string;
    meaning: string;
    bgClass: string;
  }[];
  endpoint: string;
  previewEndpoint?: string;
  previewParam?: string;
  previewParamValue?: string;
}

interface SupervisorPreviewRow {
  supervisor: string;
  employeeName: string;
  badgeId: string;
  positions: string;
  courseName: string;
  positionRequirement: string;
  status: string;
  completionDate: string;
  expirationDate: string;
}


interface StaticReport {
  id: string;
  title: string;
  description: string;
  filename: string;
  generatedDate: string;
}

const staticReports: StaticReport[] = [];

const reports: Report[] = [
  {
    id: "supervisor-training-status",
    title: "Training Status by Supervisor",
    description: "Comprehensive training report organized by supervisor, showing all employees under each supervisor with their active certifications, required courses, and compliance status.",
    structure: [
      "Column 1: Supervisor Name",
      "Column 2: Employee Name",
      "Column 3+: Active Certifications (associated with each position)",
      "Training Status: Shows completion dates, expiration dates, and compliance status"
    ],
    colorScheme: [
      { color: "Green", meaning: "Up to date", bgClass: "bg-green-500" },
      { color: "Orange", meaning: "Expired", bgClass: "bg-orange-500" },
      { color: "Red", meaning: "Missing", bgClass: "bg-red-500" }
    ],
    endpoint: "/api/reports/supervisor-training",
    previewEndpoint: "/api/reports/supervisor-training-preview",
    previewParam: "badge_id",
    previewParamValue: "40081749"
  },
  {
    id: "external-training-compare",
    title: "External Training Compare",
    description: "Compares all external training records against our database. Same logic as the CSV Compare page but for all employees. Shows exact matches, group matches, and gaps.",
    structure: [
      "Employee Name & Active status",
      "Course ID & Name from external data",
      "Match Status (Exact, Group, Not Found, Not in DB)",
      "Group Code & Matched Course (for group matches)",
      "External & DB Expiration dates"
    ],
    colorScheme: [
      { color: "Green", meaning: "Exact match - course found in DB", bgClass: "bg-green-500" },
      { color: "Purple", meaning: "Group match - equivalent course found", bgClass: "bg-purple-500" },
      { color: "Orange", meaning: "Not Found - course exists but employee missing record", bgClass: "bg-orange-500" },
      { color: "Red", meaning: "Course/Employee not in database", bgClass: "bg-red-500" }
    ],
    endpoint: "/api/reports/external-training-gaps"
  }
];

export default function CustomReportsPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<SupervisorPreviewRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [previewInfo, setPreviewInfo] = useState<{ title: string; subtitle: string } | null>(null);


  const handleDownload = async (report: Report) => {
    try {
      setLoading(report.id);

      const response = await fetch(report.endpoint);

      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.id}-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Error downloading report:', error);
      alert('Failed to download report. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  const handlePreview = async (report: Report) => {
    if (!report.previewEndpoint) return;

    try {
      setPreviewLoading(true);
      setActivePreview(report.id);

      const paramValue = report.previewParamValue || '';

      const url = report.previewParam
        ? `${report.previewEndpoint}?${report.previewParam}=${encodeURIComponent(paramValue)}`
        : report.previewEndpoint;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }

      const result = await response.json();
      setPreviewData(result.data);

      setPreviewInfo({
        title: `Preview - Badge ID: ${paramValue}`,
        subtitle: ''
      });

    } catch (error) {
      console.error('Error loading preview:', error);
      alert('Failed to load preview. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewData(null);
    setActivePreview(null);
    setPreviewInfo(null);
  };

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'up to date' || s === 'current' || s === 'yes' || s.startsWith('yes')) return 'bg-green-500';
    if (s === 'expired' || s === 'no') return 'bg-orange-500';
    if (s === 'missing' || s === 'not found') return 'bg-red-500';
    return 'bg-gray-500';
  };

  const renderSupervisorPreview = (data: SupervisorPreviewRow[]) => (
    <table className="w-full text-sm text-left">
      <thead className="text-xs uppercase bg-gray-700 text-gray-300">
        <tr>
          <th className="px-4 py-3">Supervisor</th>
          <th className="px-4 py-3">Employee Name</th>
          <th className="px-4 py-3">Badge ID</th>
          <th className="px-4 py-3">Positions</th>
          <th className="px-4 py-3">Course Name</th>
          <th className="px-4 py-3">Position Requirement</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Completion Date</th>
          <th className="px-4 py-3">Expiration Date</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, index) => (
          <tr key={index} className="border-b border-gray-700 hover:bg-gray-750">
            <td className="px-4 py-3 text-gray-300">{row.supervisor}</td>
            <td className="px-4 py-3 text-gray-300">{row.employeeName}</td>
            <td className="px-4 py-3 text-gray-300">{row.badgeId}</td>
            <td className="px-4 py-3 text-gray-300 max-w-xs truncate" title={row.positions}>
              {row.positions}
            </td>
            <td className="px-4 py-3 text-gray-300">{row.courseName}</td>
            <td className="px-4 py-3 text-gray-300">{row.positionRequirement}</td>
            <td className="px-4 py-3">
              <span className={`${getStatusColor(row.status)} text-white px-2 py-1 rounded text-xs font-medium`}>
                {row.status}
              </span>
            </td>
            <td className="px-4 py-3 text-gray-300">{row.completionDate}</td>
            <td className="px-4 py-3 text-gray-300">{row.expirationDate}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="h-[calc(100vh-80px)] overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Custom Reports</h1>
          <p className="text-gray-400">
            Download pre-configured training reports with color-coded status indicators
          </p>
        </div>

        {/* Static Reports Section */}
        {staticReports.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">Quick Downloads</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {staticReports.map((report) => (
                <div
                  key={report.id}
                  className="bg-gray-800 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-all flex items-center justify-between"
                >
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-white">{report.title}</h3>
                    <p className="text-sm text-gray-400 mt-1">{report.description}</p>
                    <p className="text-xs text-gray-500 mt-2">Generated: {report.generatedDate}</p>
                  </div>
                  <a
                    href={`/reports/${report.filename}`}
                    download={report.filename}
                    className="ml-4 py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic Reports Section */}
        <h2 className="text-xl font-semibold text-white mb-4">Generate Reports</h2>

        {/* Reports Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-gray-800 rounded-lg border border-gray-700 p-6 hover:border-gray-600 transition-all"
            >
              {/* Report Title */}
              <h2 className="text-xl font-semibold text-white mb-3">
                {report.title}
              </h2>

              {/* Description */}
              <p className="text-gray-300 text-sm mb-4 leading-relaxed">
                {report.description}
              </p>

              {/* Report Structure */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">
                  Report Structure:
                </h3>
                <ul className="space-y-1">
                  {report.structure.map((item, index) => (
                    <li key={index} className="text-xs text-gray-400 flex items-start">
                      <span className="mr-2">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Color Scheme Legend */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">
                  Color Coding:
                </h3>
                <div className="space-y-2">
                  {report.colorScheme.map((scheme, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded ${scheme.bgClass}`} />
                      <div className="text-xs">
                        <span className="text-gray-300 font-medium">{scheme.color}:</span>
                        <span className="text-gray-400 ml-1">{scheme.meaning}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {/* Preview Button */}
                {report.previewEndpoint && (
                  <button
                    onClick={() => handlePreview(report)}
                    disabled={previewLoading && activePreview === report.id}
                    className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    title={`Preview for ${report.previewParamValue}`}
                  >
                    {previewLoading && activePreview === report.id ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Loading...
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        Preview
                      </>
                    )}
                  </button>
                )}

                {/* Download Button */}
                <button
                  onClick={() => handleDownload(report)}
                  disabled={loading === report.id}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                {loading === report.id ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Generating Report...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Download Excel Report
                  </>
                )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Preview Table */}
        {previewData && previewInfo && (
          <div className="mt-8 bg-gray-800 rounded-lg border border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {previewInfo.title}
                </h2>
                {previewInfo.subtitle && (
                  <p className="text-sm text-gray-400 mt-1">{previewInfo.subtitle}</p>
                )}
                <p className="text-sm text-gray-400 mt-1">
                  Showing {previewData.length} row{previewData.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={closePreview}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="overflow-x-auto">
              {renderSupervisorPreview(previewData as SupervisorPreviewRow[])}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
