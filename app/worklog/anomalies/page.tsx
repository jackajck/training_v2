"use client";

import { useState, useEffect } from "react";

interface Comment {
  id: number;
  comment: string;
  created_at: string;
}

interface Anomaly {
  id: number;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
  updated_at: string;
  comments: Comment[];
}

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newComment, setNewComment] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newAnomaly, setNewAnomaly] = useState({ title: "", description: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", status: "" });
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

  const fetchAnomalies = async () => {
    try {
      const res = await fetch("/api/anomalies");
      const data = await res.json();
      setAnomalies(data.anomalies || []);
    } catch (error) {
      console.error("Error fetching anomalies:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnomaly.title.trim()) return;

    try {
      const res = await fetch("/api/anomalies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAnomaly),
      });
      if (res.ok) {
        setNewAnomaly({ title: "", description: "" });
        setShowNewForm(false);
        fetchAnomalies();
      }
    } catch (error) {
      console.error("Error creating anomaly:", error);
    }
  };

  const handleUpdate = async (id: number) => {
    try {
      const res = await fetch(`/api/anomalies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditingId(null);
        fetchAnomalies();
      }
    } catch (error) {
      console.error("Error updating anomaly:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this anomaly?")) return;

    try {
      const res = await fetch(`/api/anomalies/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchAnomalies();
      }
    } catch (error) {
      console.error("Error deleting anomaly:", error);
    }
  };

  const handleAddComment = async (anomalyId: number) => {
    if (!newComment.trim()) return;

    try {
      const res = await fetch(`/api/anomalies/${anomalyId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: newComment }),
      });
      if (res.ok) {
        setNewComment("");
        fetchAnomalies();
      }
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  const handleDeleteComment = async (anomalyId: number, commentId: number) => {
    try {
      const res = await fetch(`/api/anomalies/${anomalyId}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchAnomalies();
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };

  const handleEditComment = async (anomalyId: number, commentId: number) => {
    if (!editCommentText.trim()) return;

    try {
      const res = await fetch(`/api/anomalies/${anomalyId}/comments/${commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: editCommentText }),
      });
      if (res.ok) {
        setEditingCommentId(null);
        setEditCommentText("");
        fetchAnomalies();
      }
    } catch (error) {
      console.error("Error editing comment:", error);
    }
  };

  const formatDate = (dateStr: string) => {
    // Database returns UTC timestamps without timezone indicator
    // Append 'Z' to ensure proper UTC parsing, then convert to Eastern
    const utcDate = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    return new Date(utcDate).toLocaleString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-red-600";
      case "in_progress":
        return "bg-yellow-600";
      case "resolved":
        return "bg-green-600";
      default:
        return "bg-gray-600";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "open":
        return "Open";
      case "in_progress":
        return "In Progress";
      case "resolved":
        return "Resolved";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-6">Anomalies</h1>
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Anomalies</h1>
          <p className="text-gray-400 text-sm mt-1">
            Track oddities and issues that need investigation
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {showNewForm ? "Cancel" : "+ New Anomaly"}
        </button>
      </div>

      {/* New Anomaly Form */}
      {showNewForm && (
        <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Report New Anomaly</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Title *</label>
              <input
                type="text"
                value={newAnomaly.title}
                onChange={(e) => setNewAnomaly({ ...newAnomaly, title: e.target.value })}
                placeholder="e.g., T710NF - Duplicate Positions"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <textarea
                value={newAnomaly.description}
                onChange={(e) => setNewAnomaly({ ...newAnomaly, description: e.target.value })}
                placeholder="Describe the issue and what needs to be investigated..."
                rows={3}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Submit Anomaly
            </button>
          </form>
        </div>
      )}

      {/* Anomalies List */}
      <div className="space-y-4">
        {anomalies.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400">No anomalies reported yet.</p>
            <p className="text-gray-500 text-sm mt-2">
              Click &quot;+ New Anomaly&quot; to report an issue that needs investigation.
            </p>
          </div>
        ) : (
          anomalies.map((anomaly) => (
            <div
              key={anomaly.id}
              className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
            >
              {/* Header */}
              <div
                className="p-4 cursor-pointer hover:bg-gray-750"
                onClick={() => setExpandedId(expandedId === anomaly.id ? null : anomaly.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(
                          anomaly.status
                        )} text-white`}
                      >
                        {getStatusLabel(anomaly.status)}
                      </span>
                      <h3 className="text-lg font-semibold text-white">{anomaly.title}</h3>
                    </div>
                    {anomaly.description && (
                      <p className="text-gray-400 text-sm mt-2 line-clamp-2">
                        {anomaly.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>Created: {formatDate(anomaly.created_at)}</span>
                      {anomaly.comments.length > 0 && (
                        <span>{anomaly.comments.length} comment(s)</span>
                      )}
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expandedId === anomaly.id ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedId === anomaly.id && (
                <div className="border-t border-gray-700 p-4 bg-gray-850">
                  {/* Edit Mode */}
                  {editingId === anomaly.id ? (
                    <div className="space-y-4 mb-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Title</label>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Description</label>
                        <textarea
                          value={editForm.description}
                          onChange={(e) =>
                            setEditForm({ ...editForm, description: e.target.value })
                          }
                          rows={3}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Status</label>
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdate(anomaly.id)}
                          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Action Buttons */
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => {
                          setEditingId(anomaly.id);
                          setEditForm({
                            title: anomaly.title,
                            description: anomaly.description || "",
                            status: anomaly.status,
                          });
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(anomaly.id)}
                        className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  )}

                  {/* Comments Section */}
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-300 mb-3">Comments</h4>

                    {/* Existing Comments */}
                    {anomaly.comments.length > 0 ? (
                      <div className="space-y-3 mb-4">
                        {anomaly.comments.map((comment) => (
                          <div
                            key={comment.id}
                            className="bg-gray-900 rounded-lg p-3 border border-gray-700"
                          >
                            {editingCommentId === comment.id ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editCommentText}
                                  onChange={(e) => setEditCommentText(e.target.value)}
                                  rows={2}
                                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleEditComment(anomaly.id, comment.id)}
                                    className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingCommentId(null);
                                      setEditCommentText("");
                                    }}
                                    className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex justify-between items-start">
                                  <p className="text-gray-300 text-sm whitespace-pre-wrap">
                                    {comment.comment}
                                  </p>
                                  <div className="flex gap-1 ml-2">
                                    <button
                                      onClick={() => {
                                        setEditingCommentId(comment.id);
                                        setEditCommentText(comment.comment);
                                      }}
                                      className="text-gray-500 hover:text-blue-400"
                                      title="Edit comment"
                                    >
                                      <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteComment(anomaly.id, comment.id)}
                                      className="text-gray-500 hover:text-red-400"
                                      title="Delete comment"
                                    >
                                      <svg
                                        className="w-4 h-4"
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
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                  {formatDate(comment.created_at)}
                                </p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm mb-4">No comments yet.</p>
                    )}

                    {/* Add Comment Form */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={expandedId === anomaly.id ? newComment : ""}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment(anomaly.id);
                          }
                        }}
                      />
                      <button
                        onClick={() => handleAddComment(anomaly.id)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
