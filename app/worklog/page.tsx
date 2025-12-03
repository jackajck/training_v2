'use client';

import React, { useEffect, useState } from 'react';

interface WorklogEntry {
  date: string;
  title: string;
  description: string;
  type: 'feature' | 'fix' | 'improvement';
}

export default function WorklogPage() {
  const [worklogEntries, setWorklogEntries] = useState<WorklogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/worklog')
      .then(res => res.json())
      .then(data => {
        setWorklogEntries(data.entries || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'feature':
        return 'bg-blue-600';
      case 'fix':
        return 'bg-green-600';
      case 'improvement':
        return 'bg-purple-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'feature':
        return 'New Feature';
      case 'fix':
        return 'Bug Fix';
      case 'improvement':
        return 'Improvement';
      default:
        return type;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Worklog</h1>
            <p className="text-gray-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Worklog</h1>
          <p className="text-gray-400">Recent changes and updates to the Training Tracker system</p>
        </div>

        <div className="space-y-6">
          {worklogEntries.map((entry, index) => (
            <div
              key={index}
              className="bg-gray-800 rounded-lg border border-gray-700 p-6 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 ${getTypeColor(entry.type)} text-white rounded-full text-xs font-semibold uppercase`}>
                    {getTypeBadge(entry.type)}
                  </span>
                  <span className="text-sm text-gray-400">{formatDate(entry.date)}</span>
                </div>
              </div>

              <h2 className="text-xl font-semibold text-white mb-2">{entry.title}</h2>
              <p className="text-gray-300 leading-relaxed">{entry.description}</p>
            </div>
          ))}
        </div>

        {worklogEntries.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No entries yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
