"use client";

import { useState, useEffect, useMemo, useRef } from "react";

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
  matchType?: "exact" | "group" | "tcode";
  mergedToId?: string;
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
    tCodeMatches: number;
    notFound: number;
    courseNotInDb: number;
    mergedCourses: number;
    totalMatched: number;
    requiredMatched: number;
    requiredMissing: number;
    rogueCount: number;
  };
  records?: {
    exactMatches: MatchRecord[];
    groupMatches: MatchRecord[];
    tCodeMatches: MatchRecord[];
    notFound: MatchRecord[];
    courseNotInDb: MatchRecord[];
    mergedCourses: MatchRecord[];
  };
}

export default function CSVComparePage() {
  const [searchName, setSearchName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"accounted" | "notFound" | "notInDb" | "merged">("accounted");

  // Autocomplete state
  const [allNames, setAllNames] = useState<string[]>([]);
  const [namesLoading, setNamesLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load all names on mount
  useEffect(() => {
    fetch('/api/reports/course-compare-names')
      .then(res => res.json())
      .then(data => {
        setAllNames(data.names || []);
        setNamesLoading(false);
      })
      .catch(() => setNamesLoading(false));
  }, []);

  // Filter names based on search input
  const filteredNames = useMemo(() => {
    if (!searchName.trim()) return [];
    const search = searchName.toLowerCase();
    return allNames
      .filter(name => name.toLowerCase().startsWith(search))
      .slice(0, 10);
  }, [allNames, searchName]);

  // Combine records for simplified view
  const accountedFor = useMemo(() => {
    if (!result?.records) return [];
    const exact = result.records.exactMatches.map(r => ({ ...r, matchType: "exact" as const }));
    const group = result.records.groupMatches.map(r => ({ ...r, matchType: "group" as const }));
    const tcode = (result.records.tCodeMatches || []).map(r => ({ ...r, matchType: "tcode" as const }));
    return [...exact, ...group, ...tcode].sort((a, b) => a.courseName.localeCompare(b.courseName));
  }, [result]);

  // Not found = course exists in our DB but employee doesn't have training record
  const notFoundRecords = useMemo(() => {
    if (!result?.records) return [];
    return [...result.records.notFound].sort((a, b) =>
      a.courseName.localeCompare(b.courseName)
    );
  }, [result]);

  // Course not in DB = course doesn't exist in our courses table at all
  const courseNotInDbRecords = useMemo(() => {
    if (!result?.records) return [];
    return [...result.records.courseNotInDb].sort((a, b) =>
      a.courseName.localeCompare(b.courseName)
    );
  }, [result]);

  // Merged courses = course ID was merged into another ID
  const mergedCourseRecords = useMemo(() => {
    if (!result?.records?.mergedCourses) return [];
    return [...result.records.mergedCourses].sort((a, b) =>
      a.courseName.localeCompare(b.courseName)
    );
  }, [result]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async (nameToSearch?: string) => {
    const name = nameToSearch || searchName;
    if (!name.trim()) return;

    setShowDropdown(false);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/csv-compare?name=${encodeURIComponent(name)}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to fetch data");
        return;
      }

      setResult(data);
      setActiveTab("accounted");
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const handleNameSelect = (name: string) => {
    setSearchName(name);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    handleSearch(name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || filteredNames.length === 0) {
      if (e.key === "Enter") {
        handleSearch();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredNames.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0) {
          handleNameSelect(filteredNames[highlightedIndex]);
        } else if (filteredNames.length > 0) {
          handleNameSelect(filteredNames[0]);
        } else {
          handleSearch();
        }
        break;
      case "Escape":
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleSuggestionClick = (name: string) => {
    setSearchName(name);
    setResult(null);
  };

  const renderAccountedTable = (records: MatchRecord[]) => {
    if (records.length === 0) {
      return (
        <div className="text-center py-8 text-gray-400">
          No records found
        </div>
      );
    }

    // Sort records to group T-code matches together by their matched course ID
    const sortedRecords = [...records].sort((a, b) => {
      // T-code matches sort by their matchedCourseId to group them
      const aKey = a.matchType === "tcode" ? `tcode_${a.matchedCourseId}_${a.courseId}` : `other_${a.courseName}`;
      const bKey = b.matchType === "tcode" ? `tcode_${b.matchedCourseId}_${b.courseId}` : `other_${b.courseName}`;
      return aKey.localeCompare(bKey);
    });

    // Build grouping info for T-code matches
    const tCodeGroups = new Map<string, number[]>();
    sortedRecords.forEach((record, idx) => {
      if (record.matchType === "tcode" && record.matchedCourseId) {
        const key = record.matchedCourseId;
        if (!tCodeGroups.has(key)) {
          tCodeGroups.set(key, []);
        }
        tCodeGroups.get(key)!.push(idx);
      }
    });

    // Helper to determine position in group
    const getGroupPosition = (idx: number): { isInGroup: boolean; isFirst: boolean; isLast: boolean; isMiddle: boolean } => {
      for (const indices of tCodeGroups.values()) {
        if (indices.includes(idx) && indices.length > 1) {
          return {
            isInGroup: true,
            isFirst: indices[0] === idx,
            isLast: indices[indices.length - 1] === idx,
            isMiddle: indices[0] !== idx && indices[indices.length - 1] !== idx
          };
        }
      }
      return { isInGroup: false, isFirst: false, isLast: false, isMiddle: false };
    };

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700 text-gray-300">
            <tr>
              <th className="w-4"></th>
              <th className="px-3 py-2 text-left">Course ID</th>
              <th className="px-3 py-2 text-left">Course Name</th>
              <th className="px-3 py-2 text-left">Match</th>
              <th className="px-3 py-2 text-left">CSV Status</th>
              <th className="px-3 py-2 text-left">CSV Expiration</th>
              <th className="px-3 py-2 text-left">DB Expiration</th>
            </tr>
          </thead>
          <tbody>
            {sortedRecords.map((record, idx) => {
              const groupPos = getGroupPosition(idx);
              return (
                <tr key={idx} className={`border-b border-gray-700 hover:bg-gray-750 ${groupPos.isInGroup ? 'bg-cyan-900/10' : ''}`}>
                  <td className="relative w-4">
                    {groupPos.isInGroup && (
                      <div className="absolute left-2 top-0 bottom-0 flex flex-col items-center">
                        {/* Top connector */}
                        {!groupPos.isFirst && (
                          <div className="w-0.5 bg-cyan-500 flex-1" />
                        )}
                        {groupPos.isFirst && <div className="flex-1" />}
                        {/* Dot */}
                        <div className="w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0" />
                        {/* Bottom connector */}
                        {!groupPos.isLast && (
                          <div className="w-0.5 bg-cyan-500 flex-1" />
                        )}
                        {groupPos.isLast && <div className="flex-1" />}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-300 font-mono">{record.courseId || "N/A"}</td>
                  <td className="px-3 py-2 text-gray-300 max-w-md" title={record.courseName}>
                    <div className="truncate">{record.courseName}</div>
                    {record.matchType === "group" && record.matchedCourseName && (
                      <div className="text-xs text-purple-400 mt-1">
                        Matched: {record.matchedCourseId}
                      </div>
                    )}
                    {record.matchType === "tcode" && record.matchedCourseId && (
                      <div className="text-xs text-cyan-400 mt-1">
                        T-Code: {record.tCode} → ID {record.matchedCourseId}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {record.matchType === "exact" ? (
                      <span className="bg-green-600 text-white px-2 py-0.5 rounded text-xs">Exact</span>
                    ) : record.matchType === "group" ? (
                      <span className="bg-purple-600 text-white px-2 py-0.5 rounded text-xs" title={`Group: ${record.groupCode}`}>
                        Group
                      </span>
                    ) : (
                      <span className="bg-cyan-600 text-white px-2 py-0.5 rounded text-xs" title={record.reason}>
                        T-Code
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-400">{record.csvStatus}</td>
                  <td className="px-3 py-2 text-gray-400">{record.csvExpiration || "-"}</td>
                  <td className="px-3 py-2 text-gray-400">{record.dbExpiration || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderNotFoundTable = (records: MatchRecord[]) => {
    if (records.length === 0) {
      return (
        <div className="text-center py-8 text-green-400">
          No missing training records - all external courses are accounted for
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700 text-gray-300">
            <tr>
              <th className="px-3 py-2 text-left">Course ID</th>
              <th className="px-3 py-2 text-left">Course Name</th>
              <th className="px-3 py-2 text-left">CSV Status</th>
              <th className="px-3 py-2 text-left">CSV Expiration</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, idx) => (
              <tr key={idx} className="border-b border-gray-700 hover:bg-gray-750">
                <td className="px-3 py-2 text-gray-300 font-mono">{record.courseId || "N/A"}</td>
                <td className="px-3 py-2 text-gray-300 max-w-md truncate" title={record.courseName}>
                  {record.courseName}
                </td>
                <td className="px-3 py-2 text-gray-400">{record.csvStatus}</td>
                <td className="px-3 py-2 text-gray-400">{record.csvExpiration || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-3 px-3">
          These courses exist in our database but this employee doesn&apos;t have a training record for them.
        </p>
      </div>
    );
  };

  const renderNotInDbTable = (records: MatchRecord[]) => {
    if (records.length === 0) {
      return (
        <div className="text-center py-8 text-green-400">
          All external courses exist in our database
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700 text-gray-300">
            <tr>
              <th className="px-3 py-2 text-left">Course ID</th>
              <th className="px-3 py-2 text-left">Course Name</th>
              <th className="px-3 py-2 text-left">CSV Status</th>
              <th className="px-3 py-2 text-left">CSV Expiration</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, idx) => (
              <tr key={idx} className="border-b border-gray-700 hover:bg-gray-750">
                <td className="px-3 py-2 text-gray-300 font-mono">{record.courseId || "N/A"}</td>
                <td className="px-3 py-2 text-gray-300 max-w-md truncate" title={record.courseName}>
                  {record.courseName}
                </td>
                <td className="px-3 py-2 text-gray-400">{record.csvStatus}</td>
                <td className="px-3 py-2 text-gray-400">{record.csvExpiration || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-3 px-3">
          These courses don&apos;t exist in our courses table. They may need to be added.
        </p>
      </div>
    );
  };

  const renderMergedTable = (records: MatchRecord[]) => {
    if (records.length === 0) {
      return (
        <div className="text-center py-8 text-gray-400">
          No merged courses
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700 text-gray-300">
            <tr>
              <th className="px-3 py-2 text-left">Old Course ID</th>
              <th className="px-3 py-2 text-left">Course Name</th>
              <th className="px-3 py-2 text-left">Merged To</th>
              <th className="px-3 py-2 text-left">CSV Status</th>
              <th className="px-3 py-2 text-left">CSV Expiration</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, idx) => (
              <tr key={idx} className="border-b border-gray-700 hover:bg-gray-750">
                <td className="px-3 py-2 text-gray-500 font-mono line-through">{record.courseId || "N/A"}</td>
                <td className="px-3 py-2 text-gray-300 max-w-md truncate" title={record.courseName}>
                  {record.courseName}
                </td>
                <td className="px-3 py-2">
                  <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs font-mono">
                    {record.mergedToId}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-400">{record.csvStatus}</td>
                <td className="px-3 py-2 text-gray-400">{record.csvExpiration || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-3 px-3">
          These course IDs were merged into different IDs. The course still exists under the new ID shown above.
        </p>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-80px)] overflow-y-auto p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">External Training Compare</h1>
          <p className="text-gray-400">
            Compare an employee&apos;s external training records against our database
          </p>
        </div>

        {/* Search */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={searchName}
                onChange={(e) => {
                  setSearchName(e.target.value);
                  setShowDropdown(true);
                  setHighlightedIndex(-1);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                placeholder={namesLoading ? "Loading names..." : "Start typing last name..."}
                disabled={namesLoading}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />

              {/* Autocomplete Dropdown */}
              {showDropdown && filteredNames.length > 0 && (
                <div
                  ref={dropdownRef}
                  className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                >
                  {filteredNames.map((name, index) => (
                    <button
                      key={index}
                      onClick={() => handleNameSelect(name)}
                      className={`w-full px-4 py-2 text-left text-gray-300 hover:bg-gray-600 first:rounded-t-lg last:rounded-b-lg ${
                        index === highlightedIndex ? 'bg-gray-600' : ''
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={loading || !searchName.trim()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {loading ? "Searching..." : "Compare"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {namesLoading
              ? "Loading employee names..."
              : `${allNames.length} employees available - start typing to search by last name`
            }
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
              <strong>{result.csvName}</strong> was found in the external data ({result.csvRecordCount} records)
              but does not exist in our database.
            </p>
          </div>
        )}

        {/* Results */}
        {result && result.found && result.inDatabase && result.summary && result.records && (
          <>
            {/* Employee Header */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  {result.employee?.name}
                  {result.employee?.isActive ? (
                    <span className="ml-2 text-xs bg-green-600 text-white px-2 py-0.5 rounded">Active</span>
                  ) : (
                    <span className="ml-2 text-xs bg-red-600 text-white px-2 py-0.5 rounded">Inactive</span>
                  )}
                </h2>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">External Records</p>
                  <p className="text-2xl font-bold text-white">{result.summary.csvRecords}</p>
                </div>
                <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">Accounted For</p>
                  <p className="text-2xl font-bold text-green-400">{accountedFor.length}</p>
                </div>
                <div className={`rounded-lg p-4 ${notFoundRecords.length > 0 ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-gray-700/50'}`}>
                  <p className="text-gray-400 text-sm">Not Found</p>
                  <p className={`text-2xl font-bold ${notFoundRecords.length > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {notFoundRecords.length}
                  </p>
                </div>
                <div className={`rounded-lg p-4 ${courseNotInDbRecords.length > 0 ? 'bg-red-900/30 border border-red-700' : 'bg-gray-700/50'}`}>
                  <p className="text-gray-400 text-sm">Not in DB</p>
                  <p className={`text-2xl font-bold ${courseNotInDbRecords.length > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    {courseNotInDbRecords.length}
                  </p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">Our DB Records</p>
                  <p className="text-2xl font-bold text-white">{result.summary.dbRecords}</p>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-gray-800 rounded-lg border border-gray-700">
              <div className="border-b border-gray-700 flex">
                <button
                  onClick={() => setActiveTab("accounted")}
                  className={`px-6 py-3 font-medium text-sm ${
                    activeTab === "accounted"
                      ? "text-green-400 border-b-2 border-green-400 bg-gray-750"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Accounted For ({accountedFor.length})
                </button>
                <button
                  onClick={() => setActiveTab("notFound")}
                  className={`px-6 py-3 font-medium text-sm ${
                    activeTab === "notFound"
                      ? "text-yellow-400 border-b-2 border-yellow-400 bg-gray-750"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Not Found ({notFoundRecords.length})
                </button>
                <button
                  onClick={() => setActiveTab("notInDb")}
                  className={`px-6 py-3 font-medium text-sm ${
                    activeTab === "notInDb"
                      ? "text-red-400 border-b-2 border-red-400 bg-gray-750"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Course Not in DB ({courseNotInDbRecords.length})
                </button>
                {mergedCourseRecords.length > 0 && (
                  <button
                    onClick={() => setActiveTab("merged")}
                    className={`px-6 py-3 font-medium text-sm ${
                      activeTab === "merged"
                        ? "text-blue-400 border-b-2 border-blue-400 bg-gray-750"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    Merged IDs ({mergedCourseRecords.length})
                  </button>
                )}
              </div>

              <div className="p-4">
                {activeTab === "accounted" && renderAccountedTable(accountedFor)}
                {activeTab === "notFound" && renderNotFoundTable(notFoundRecords)}
                {activeTab === "notInDb" && renderNotInDbTable(courseNotInDbRecords)}
                {activeTab === "merged" && renderMergedTable(mergedCourseRecords)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
