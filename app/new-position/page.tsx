'use client';

import { useState } from 'react';

export default function NewPositionPage() {
  const [positionName, setPositionName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdPosition, setCreatedPosition] = useState<{ position_id: string; position_name: string } | null>(null);

  const handleSubmit = async () => {
    // Validation
    if (!positionName.trim()) {
      alert('Position name is required');
      return;
    }

    if (!confirm(`Create new position?\n\nPosition Name: ${positionName}`)) {
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/positions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_name: positionName
        })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to create position');
        return;
      }

      alert(`Position created successfully!\nID: ${data.position.position_id}`);
      setCreatedPosition(data.position);
      // Reset form
      setPositionName('');
    } catch (error) {
      console.error('Error creating position:', error);
      alert('Failed to create position');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      <h1 className="text-3xl font-bold mb-2">New Position</h1>
      <p className="text-gray-400 mb-6">Create a new position with auto-generated ID (555***)</p>

      <div className="max-w-2xl">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="space-y-6">
            {/* Info Box */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
              <p className="text-sm text-blue-300">
                <strong>Note:</strong> The position ID will be automatically generated in the 555000-555999 range to avoid conflicts with legacy position IDs.
              </p>
            </div>

            {/* Position Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Position Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={positionName}
                onChange={(e) => setPositionName(e.target.value)}
                placeholder="Enter position name (e.g., Welder, Safety Officer)..."
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-gray-500"
              />
            </div>

            {/* Last Created Position */}
            {createdPosition && (
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                <p className="text-sm text-green-300 font-medium mb-1">✓ Last Created Position</p>
                <p className="text-white font-semibold">{createdPosition.position_name}</p>
                <p className="text-sm text-gray-400">ID: {createdPosition.position_id}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !positionName.trim()}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors font-semibold"
            >
              {submitting ? 'Creating Position...' : 'Create Position'}
            </button>

            {/* Next Steps */}
            <div className="border-t border-gray-700 pt-6">
              <h3 className="text-sm font-medium text-gray-300 mb-2">After Creating:</h3>
              <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
                <li>Go to the <strong className="text-white">Positions</strong> page to assign courses to this position</li>
                <li>New positions are automatically available when creating employees</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
