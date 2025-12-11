"use client";

import { useState, useEffect } from "react";

interface Comment {
  id: number;
  comment: string;
  created_at: string;
}

interface Bug {
  id: number;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
  updated_at: string;
  comments: Comment[];
}

interface TimelineItem {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "done";
  priority: "high" | "medium" | "low";
}

export default function WorklogPage() {
  const [activeTab, setActiveTab] = useState<"bugs" | "timeline">("bugs");
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newComment, setNewComment] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newBug, setNewBug] = useState({ title: "", description: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", status: "" });
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentText, setEditCommentText] = useState("");

  // Timeline items (hardcoded for now - can be moved to database later)
  const [timelineItems] = useState<TimelineItem[]>([
    {
      id: "1",
      title: "CSV Compare Validation",
      description: "All entries from Torrie's CSV are now in our system.",
      status: "done",
      priority: "high",
    },
    {
      id: "2",
      title: "Management Review of Course Cleanup",
      description: "Management needs to review duplicate courses (same T-code, different IDs) and decide which to merge/delete. Course names may change during this review.",
      status: "pending",
      priority: "high",
    },
    {
      id: "3",
      title: "Process Position Course Removals",
      description: "Remove courses from positions as specified in Jivon's Excel file (Training_change.csv). Must wait for management review since course names may change.",
      status: "pending",
      priority: "high",
    },
  ]);

  const fetchBugs = async () => {
    try {
      const res = await fetch("/api/anomalies");
      const data = await res.json();
      setBugs(data.anomalies || []);
    } catch (error) {
      console.error("Error fetching bugs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBugs();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBug.title.trim()) return;

    try {
      const res = await fetch("/api/anomalies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBug),
      });
      if (res.ok) {
        setNewBug({ title: "", description: "" });
        setShowNewForm(false);
        fetchBugs();
      }
    } catch (error) {
      console.error("Error creating bug:", error);
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
        fetchBugs();
      }
    } catch (error) {
      console.error("Error updating bug:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this bug?")) return;

    try {
      const res = await fetch(`/api/anomalies/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchBugs();
      }
    } catch (error) {
      console.error("Error deleting bug:", error);
    }
  };

  const handleAddComment = async (bugId: number) => {
    if (!newComment.trim()) return;

    try {
      const res = await fetch(`/api/anomalies/${bugId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: newComment }),
      });
      if (res.ok) {
        setNewComment("");
        fetchBugs();
      }
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  const handleDeleteComment = async (bugId: number, commentId: number) => {
    try {
      const res = await fetch(`/api/anomalies/${bugId}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchBugs();
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };

  const handleEditComment = async (bugId: number, commentId: number) => {
    if (!editCommentText.trim()) return;

    try {
      const res = await fetch(`/api/anomalies/${bugId}/comments/${commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: editCommentText }),
      });
      if (res.ok) {
        setEditingCommentId(null);
        setEditCommentText("");
        fetchBugs();
      }
    } catch (error) {
      console.error("Error editing comment:", error);
    }
  };

  const formatDate = (dateStr: string) => {
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
      case "open": return "bg-red-600";
      case "in_progress": return "bg-yellow-600";
      case "resolved": return "bg-green-600";
      default: return "bg-gray-600";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "open": return "Open";
      case "in_progress": return "In Progress";
      case "resolved": return "Resolved";
      default: return status;
    }
  };

  const getTimelineStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-gray-600";
      case "in_progress": return "bg-yellow-600";
      case "done": return "bg-green-600";
      default: return "bg-gray-600";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-red-400";
      case "medium": return "text-yellow-400";
      case "low": return "text-gray-400";
      default: return "text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white mb-6">Worklog</h1>
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const openBugs = bugs.filter(b => b.status !== "resolved").length;
  const pendingTasks = timelineItems.filter(t => t.status !== "done").length;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Worklog</h1>
        <p className="text-gray-400 text-sm mt-1">
          Track bugs, issues, and upcoming tasks
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab("bugs")}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === "bugs"
              ? "text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Bugs {openBugs > 0 && <span className="ml-1 px-2 py-0.5 bg-red-600 text-white text-xs rounded-full">{openBugs}</span>}
        </button>
        <button
          onClick={() => setActiveTab("timeline")}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === "timeline"
              ? "text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Timeline {pendingTasks > 0 && <span className="ml-1 px-2 py-0.5 bg-yellow-600 text-white text-xs rounded-full">{pendingTasks}</span>}
        </button>
      </div>

      {/* Bugs Tab */}
      {activeTab === "bugs" && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowNewForm(!showNewForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showNewForm ? "Cancel" : "+ New Bug"}
            </button>
          </div>

          {/* New Bug Form */}
          {showNewForm && (
            <div className="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-4">Report New Bug</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Title *</label>
                  <input
                    type="text"
                    value={newBug.title}
                    onChange={(e) => setNewBug({ ...newBug, title: e.target.value })}
                    placeholder="e.g., T710NF - Duplicate Positions"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Description</label>
                  <textarea
                    value={newBug.description}
                    onChange={(e) => setNewBug({ ...newBug, description: e.target.value })}
                    placeholder="Describe the issue..."
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Submit Bug
                </button>
              </form>
            </div>
          )}

          {/* Bugs List */}
          <div className="space-y-4">
            {bugs.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <p className="text-gray-400">No bugs reported yet.</p>
              </div>
            ) : (
              bugs.map((bug) => (
                <div key={bug.id} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-750"
                    onClick={() => setExpandedId(expandedId === bug.id ? null : bug.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(bug.status)} text-white`}>
                            {getStatusLabel(bug.status)}
                          </span>
                          <h3 className="text-lg font-semibold text-white">{bug.title}</h3>
                        </div>
                        {bug.description && (
                          <p className="text-gray-400 text-sm mt-2 line-clamp-2">{bug.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>Created: {formatDate(bug.created_at)}</span>
                          {bug.comments.length > 0 && <span>{bug.comments.length} comment(s)</span>}
                        </div>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${expandedId === bug.id ? "rotate-180" : ""}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {expandedId === bug.id && (
                    <div className="border-t border-gray-700 p-4 bg-gray-850">
                      {editingId === bug.id ? (
                        <div className="space-y-4 mb-4">
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Title</label>
                            <input
                              type="text"
                              value={editForm.title}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Description</label>
                            <textarea
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              rows={3}
                              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Status</label>
                            <select
                              value={editForm.status}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                            >
                              <option value="open">Open</option>
                              <option value="in_progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdate(bug.id)} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700">Save</button>
                            <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 mb-4">
                          <button
                            onClick={() => {
                              setEditingId(bug.id);
                              setEditForm({ title: bug.title, description: bug.description || "", status: bug.status });
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                          >
                            Edit
                          </button>
                          <button onClick={() => handleDelete(bug.id)} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700">Delete</button>
                        </div>
                      )}

                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-gray-300 mb-3">Comments</h4>
                        {bug.comments.length > 0 ? (
                          <div className="space-y-3 mb-4">
                            {bug.comments.map((comment) => (
                              <div key={comment.id} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                                {editingCommentId === comment.id ? (
                                  <div className="space-y-2">
                                    <textarea
                                      value={editCommentText}
                                      onChange={(e) => setEditCommentText(e.target.value)}
                                      rows={2}
                                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm"
                                    />
                                    <div className="flex gap-2">
                                      <button onClick={() => handleEditComment(bug.id, comment.id)} className="px-2 py-1 bg-green-600 text-white text-xs rounded">Save</button>
                                      <button onClick={() => { setEditingCommentId(null); setEditCommentText(""); }} className="px-2 py-1 bg-gray-600 text-white text-xs rounded">Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex justify-between items-start">
                                      <p className="text-gray-300 text-sm whitespace-pre-wrap">{comment.comment}</p>
                                      <div className="flex gap-1 ml-2">
                                        <button onClick={() => { setEditingCommentId(comment.id); setEditCommentText(comment.comment); }} className="text-gray-500 hover:text-blue-400" title="Edit">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                          </svg>
                                        </button>
                                        <button onClick={() => handleDeleteComment(bug.id, comment.id)} className="text-gray-500 hover:text-red-400" title="Delete">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">{formatDate(comment.created_at)}</p>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-sm mb-4">No comments yet.</p>
                        )}

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={expandedId === bug.id ? newComment : ""}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a comment..."
                            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(bug.id); } }}
                          />
                          <button onClick={() => handleAddComment(bug.id)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Add</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Timeline Tab */}
      {activeTab === "timeline" && (
        <div>
          <p className="text-gray-400 text-sm mb-8">Tasks and milestones that need to be completed</p>

          {/* Clean Timeline */}
          <ol className="relative border-l-2 border-gray-700 ml-4">
            {timelineItems.map((item, index) => (
              <li key={item.id} className="mb-10 ml-8">
                {/* Dot */}
                <span className={`absolute flex items-center justify-center w-8 h-8 rounded-full -left-4 ring-4 ring-gray-900 ${
                  item.status === "done"
                    ? "bg-green-600"
                    : item.status === "in_progress"
                    ? "bg-yellow-600"
                    : "bg-gray-700"
                }`}>
                  {item.status === "done" ? (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-white text-sm font-bold">{index + 1}</span>
                  )}
                </span>

                {/* Content */}
                <div className={`p-4 bg-gray-800 rounded-lg border ${
                  item.status === "done"
                    ? "border-green-800"
                    : item.status === "in_progress"
                    ? "border-yellow-800"
                    : "border-gray-700"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded ${getTimelineStatusColor(item.status)} text-white`}>
                      {item.status === "pending" ? "PENDING" : item.status === "in_progress" ? "IN PROGRESS" : "DONE"}
                    </span>
                    <span className={`text-xs font-semibold ${getPriorityColor(item.priority)}`}>
                      {item.priority.toUpperCase()} PRIORITY
                    </span>
                  </div>
                  <h3 className={`text-lg font-semibold ${item.status === "done" ? "text-gray-500 line-through" : "text-white"}`}>
                    {item.title}
                  </h3>
                  <p className="text-gray-400 text-sm mt-1">{item.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
