"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader } from "@/components/ui/Card";
import { formatDateLabel, getCalendarDays, MONTH_NAMES, todayISO } from "@/lib/format";

// ---------------------------------------------------------------------------
// Tasks — merges the old "taken" (task list / follow-up questions) and
// "agenda" (calendar) sections, which used to be two separate flat sidebar
// items even though "agenda" was really just a calendar view onto the same
// Task records. Same combined calendar + day list pattern the client
// portal's own "planning" section already used. Reads/writes
// /api/tasks — extended with clientId support for staff, mirroring the
// pattern already used by /api/purchases/all and friends.
// ---------------------------------------------------------------------------

interface TaskRow { id: string; title: string; description: string | null; date: string; time: string | null; completed: boolean; category: string | null }

function TasksInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;

  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", time: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeAdminId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?clientId=${activeAdminId}&date=${selectedDate}&includeOverdue=true`);
      setTasks(res.ok ? await res.json() : []);
    } finally { setLoading(false); }
  }, [activeAdminId, selectedDate]);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);

  async function addTask() {
    if (!newTask.title.trim() || !activeAdminId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTask.title, description: newTask.description, date: selectedDate, time: newTask.time || null, userId: activeAdminId, assignedTo: "accountant" }),
      });
      if (res.ok) { setNewTask({ title: "", description: "", time: "" }); setShowAdd(false); load(); }
    } finally { setSaving(false); }
  }

  async function toggleTask(id: string, completed: boolean) {
    const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed }) });
    if (res.ok) setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed } : t)));
  }

  async function deleteTask(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  const days = getCalendarDays(calendarMonth);
  const timedTasks = tasks.filter((t) => t.time && !t.completed && t.date === selectedDate).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const untimedTasks = tasks.filter((t) => !t.time && !t.completed && t.date === selectedDate);
  const overdueTasks = tasks.filter((t) => t.date < selectedDate && !t.completed);
  const completedTasks = tasks.filter((t) => t.completed && t.date === selectedDate);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl space-y-6">
      <PageHeader title="Tasks" subtitle={activeAdministration ? (activeAdministration.company || activeAdministration.name) : undefined} />

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Calendar */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
            <p className="text-sm font-semibold text-gray-800">{MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</p>
            <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-400 mb-1">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              if (!d) return <span key={i} />;
              const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayISO();
              const hasTask = tasks.some((t) => t.date === dateStr && !t.completed);
              return (
                <button key={i} onClick={() => setSelectedDate(dateStr)}
                  className={`relative aspect-square rounded-lg text-xs font-medium transition-colors ${isSelected ? "bg-indigo-600 text-white" : isToday ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-50"}`}>
                  {d}
                  {hasTask && !isSelected && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-400" />}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Day list */}
        <Card>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-800 capitalize">{formatDateLabel(selectedDate)}</h2>
            <button onClick={() => setShowAdd((v) => !v)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">{showAdd ? "Cancel" : "+ New task"}</button>
          </div>

          {showAdd && (
            <div className="mb-4 p-3 bg-gray-50 rounded-xl space-y-2">
              <input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="Task title" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <input type="time" value={newTask.time} onChange={(e) => setNewTask({ ...newTask, time: e.target.value })} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                <input value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} placeholder="Description (optional)" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <button onClick={addTask} disabled={!newTask.title.trim() || saving} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">{saving ? "Adding…" : "Add task"}</button>
            </div>
          )}

          {loading ? <p className="text-sm text-gray-400 py-6 text-center">Loading…</p> : (
            <div className="space-y-4">
              {overdueTasks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-500 uppercase tracking-wider mb-1.5">Overdue</p>
                  {overdueTasks.map((t) => <TaskRowItem key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />)}
                </div>
              )}
              {[...timedTasks, ...untimedTasks].length === 0 && overdueTasks.length === 0 && completedTasks.length === 0 && (
                <p className="text-sm text-gray-400 py-6 text-center">No tasks for this day.</p>
              )}
              {[...timedTasks, ...untimedTasks].map((t) => <TaskRowItem key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />)}
              {completedTasks.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1.5 mt-2">Completed</p>
                  {completedTasks.map((t) => <TaskRowItem key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />)}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function TaskRowItem({ task, onToggle, onDelete }: { task: TaskRow; onToggle: (id: string, completed: boolean) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 py-2 group">
      <button onClick={() => onToggle(task.id, !task.completed)} className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${task.completed ? "bg-indigo-600 border-indigo-600" : "border-gray-300 hover:border-indigo-400"}`}>
        {task.completed && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${task.completed ? "line-through text-gray-400" : "text-gray-800"}`}>{task.title}</p>
        {task.description && <p className="text-xs text-gray-400 truncate">{task.description}</p>}
      </div>
      {task.time && <span className="text-xs text-gray-400 shrink-0">{task.time}</span>}
      <button onClick={() => onDelete(task.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

export default function TasksPage() {
  return (
    <RequireAdministration>
      <TasksInner />
    </RequireAdministration>
  );
}
