"use client";

import { useState } from "react";

interface MatchRecord {
  courseId: string | null;
  courseName: string;
  tCode: string | null;
  csvStatus: string;
  csvExpiration: string;
  dbExpiration?: string;
  isRequired: boolean;
  groupCode?: string;
  matchedCourseId?: string;
  matchedCourseName?: string;
  inGroup?: boolean;
  reason?: string;
}

interface CompareResult {
  found: boolean;
  csvName?: string;
  csvRecordCount?: number;
  inDatabase?: boolean;
  message?: string;
  suggestions?: string[];
  employee?: {
    id: number;
    name: string;
    isActive: boolean;
  };
  summary?: {
    csvRecords: number;
    dbRecords: number;
    exactMatches: number;
    groupMatches: number;
    notFound: number;
    courseNotInDb: number;
    totalMatched: number;
    requiredMatched: number;
    requiredMissing: number;
    rogueCount: number;
  };
  records?: {
    exactMatches: MatchRecord[];
    groupMatches: MatchRecord[];
    notFound: MatchRecord[];
    courseNotInDb: MatchRecord[];
  };
}

export default function CSVComparePage() {
  const [searchName, setSearchName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"exact" | "group" | "notFound" | "notInDb">("exact");

  const handleSearch = async () => {
    if (!searchName.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/csv-compare?name=${encodeURIComponent(searchName)}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to fetch data");
        return;
      }

      setResult(data);
      setActiveTab("exact");
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (name: string) => {
    setSearchName(name);
    setResult(null);
  };

  const renderRecordTable = (records: MatchRecord[], type: "exact" | "group" | "notFound" | "notInDb") => {
    if (records.length === 0) {
      return (
        <div className="text-center py-8 text-gray-400">
          No records in this category
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700 text-gray-300">
            <tr>
              <th className="px-3 py-2 text-left">Course ID</th>
              <th className="px-3 py-2 text-left">T-Code</th>
              <th className="px-3 py-2 text-left">Course Name</th>
              <th className="px-3 py-2 text-left">Required</th>
              <th className="px-3 py-2 text-left">CSV Status</th>
              <th className="px-3 py-2 text-left">CSV Exp</th>
              {type === "exact" && <th className="px-3 py-2 text-left">DB Exp</th>}
              {type === "group" && (
                <>
                  <th className="px-3 py-2 text-left">Group</th>
                  <th className="px-3 py-2 text-left">Matched Course</th>
                  <th className="px-3 py-2 text-left">DB Exp</th>
                </>
              )}
              {type === "notFound" && (
                <>
                  <th className="px-3 py-2 text-left">In Group</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {records.map((record, idx) => (
              <tr key={idx} className="border-b border-gray-700 hover:bg-gray-750">
                <td className="px-3 py-2 text-gray-300 font-mono">{record.courseId || "N/A"}</td>
                <td className="px-3 py-2">
                  {record.tCode ? (
                    <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs">
                      {record.tCode}
                    </span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-300 max-w-md truncate" title={record.courseName}>
                  {record.courseName.substring(0, 60)}...
                </td>
                <td className="px-3 py-2">
                  {record.isRequired ? (
                    <span className="bg-green-600 text-white px-2 py-0.5 rounded text-xs">Required</span>
                  ) : (
                    <span className="bg-gray-600 text-gray-300 px-2 py-0.5 rounded text-xs">Rogue</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-400">{record.csvStatus}</td>
                <td className="px-3 py-2 text-gray-400">{record.csvExpiration || "-"}</td>
                {type === "exact" && (
                  <td className="px-3 py-2 text-gray-400">{record.dbExpiration || "-"}</td>
                )}
                {type === "group" && (
                  <>
                    <td className="px-3 py-2">
                      <span className="bg-purple-600 text-white px-2 py-0.5 rounded text-xs">
                        {record.groupCode}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-300 font-mono text-xs">
                      {record.matchedCourseId}
                    </td>
                    <td className="px-3 py-2 text-gray-400">{record.dbExpiration || "-"}</td>
                  </>
                )}
                {type === "notFound" && (
                  <>
                    <td className="px-3 py-2">
                      {record.inGroup ? (
                        <span className="bg-purple-600 text-white px-2 py-0.5 rounded text-xs">
                          {record.groupCode}
                        </span>
                      ) : (
                        <span className="text-gray-500">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{record.reason}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-80px)] overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">CSV Compare</h1>
          <p className="text-gray-400">
            Compare an employee&apos;s training records from the external CSV against our database
          </p>
        </div>

        {/* Search */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-6">
          <div className="flex gap-4">
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Enter employee name (e.g., Burke,John R)"
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !searchName.trim()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {loading ? "Searching..." : "Compare"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Format: LastName,FirstName (e.g., &quot;Burke,John R&quot; or just &quot;Burke&quot;)
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Suggestions */}
        {result && !result.found && result.suggestions && result.suggestions.length > 0 && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-6">
            <p className="text-gray-300 mb-3">{result.message}</p>
            <p className="text-sm text-gray-400 mb-2">Did you mean:</p>
            <div className="flex flex-wrap gap-2">
              {result.suggestions.map((name, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(name)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Not in Database */}
        {result && result.found && !result.inDatabase && (
          <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-yellow-300 mb-2">Employee Not in Database</h2>
            <p className="text-gray-300">
              <strong>{result.csvName}</strong> was found in the CSV ({result.csvRecordCount} records)
              but does not exist in our database.
            </p>
          </div>
        )}

        {/* Results */}
        {result && result.found && result.inDatabase && result.summary && result.records && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-gray-400 text-sm">CSV Records</p>
                <p className="text-2xl font-bold text-white">{result.summary.csvRecords}</p>
              </div>
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-gray-400 text-sm">DB Records</p>
                <p className="text-2xl font-bold text-white">{result.summary.dbRecords}</p>
              </div>
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-gray-400 text-sm">Matched</p>
                <p className="text-2xl font-bold text-green-400">{result.summary.totalMatched}</p>
              </div>
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <p className="text-gray-400 text-sm">Not Found</p>
                <p className="text-2xl font-bold text-red-400">{result.summary.notFound + result.summary.courseNotInDb}</p>
              </div>
            </div>

            {/* Compliance Summary */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4">
                {result.employee?.name}
                {result.employee?.isActive ? (
                  <span className="ml-2 text-xs bg-green-600 text-white px-2 py-0.5 rounded">Active</span>
                ) : (
                  <span className="ml-2 text-xs bg-red-600 text-white px-2 py-0.5 rounded">Inactive</span>
                )}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-lg ${result.summary.requiredMissing === 0 ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}`}>
                  <p className="text-sm text-gray-400">Required Courses</p>
                  <p className={`text-xl font-bold ${result.summary.requiredMissing === 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {result.summary.requiredMatched} matched, {result.summary.requiredMissing} missing
                  </p>
                  {result.summary.requiredMissing === 0 ? (
                    <p className="text-sm text-green-400 mt-1">✓ All position-required courses accounted for</p>
                  ) : (
                    <p className="text-sm text-red-400 mt-1">⚠ Missing courses required by positions</p>
                  )}
                </div>
                <div className="p-4 rounded-lg bg-gray-700/50 border border-gray-600">
                  <p className="text-sm text-gray-400">Group Matches</p>
                  <p className="text-xl font-bold text-purple-400">{result.summary.groupMatches}</p>
                  <p className="text-sm text-gray-400 mt-1">Matched via T-code groups</p>
                </div>
                <div className="p-4 rounded-lg bg-gray-700/50 border border-gray-600">
                  <p className="text-sm text-gray-400">Rogue Courses</p>
                  <p className="text-xl font-bold text-gray-400">{result.summary.rogueCount}</p>
                  <p className="text-sm text-gray-400 mt-1">Not required by any position</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-gray-800 rounded-lg border border-gray-700">
              <div className="border-b border-gray-700 flex">
                <button
                  onClick={() => setActiveTab("exact")}
                  className={`px-4 py-3 font-medium text-sm ${
                    activeTab === "exact"
                      ? "text-green-400 border-b-2 border-green-400"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Exact Matches ({result.summary.exactMatches})
                </button>
                <button
                  onClick={() => setActiveTab("group")}
                  className={`px-4 py-3 font-medium text-sm ${
                    activeTab === "group"
                      ? "text-purple-400 border-b-2 border-purple-400"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Group Matches ({result.summary.groupMatches})
                </button>
                <button
                  onClick={() => setActiveTab("notFound")}
                  className={`px-4 py-3 font-medium text-sm ${
                    activeTab === "notFound"
                      ? "text-red-400 border-b-2 border-red-400"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Not Found ({result.summary.notFound})
                </button>
                <button
                  onClick={() => setActiveTab("notInDb")}
                  className={`px-4 py-3 font-medium text-sm ${
                    activeTab === "notInDb"
                      ? "text-yellow-400 border-b-2 border-yellow-400"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Course Not in DB ({result.summary.courseNotInDb})
                </button>
              </div>

              <div className="p-4">
                {activeTab === "exact" && renderRecordTable(result.records.exactMatches, "exact")}
                {activeTab === "group" && renderRecordTable(result.records.groupMatches, "group")}
                {activeTab === "notFound" && renderRecordTable(result.records.notFound, "notFound")}
                {activeTab === "notInDb" && renderRecordTable(result.records.courseNotInDb, "notInDb")}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
