"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface Notification {
  id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  priority: number;
  isRead: boolean;
  actionUrl: string | null;
  actionLabel: string | null;
  sourceType: string | null;
  sourceId: string | null;
  readAt: string | null;
  createdAt: string;
  // Server-enriched for staff callers: which administration this
  // notification belongs to. null when the source can't be linked to
  // one specific administration (e.g. system notifications).
  administration?: { id: string; company: string | null; name: string } | null;
}

const CATEGORY_ICONS: Record<string, { icon: React.ReactNode; bg: string; text: string }> = {
  critical: {
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
    bg: "bg-red-100", text: "text-red-600",
  },
  warning: {
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    bg: "bg-amber-100", text: "text-amber-600",
  },
  success: {
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    bg: "bg-emerald-100", text: "text-emerald-600",
  },
  info: {
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    bg: "bg-blue-100", text: "text-blue-600",
  },
  reminder: {
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
    bg: "bg-purple-100", text: "text-purple-600",
  },
  task: {
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
    bg: "bg-indigo-100", text: "text-indigo-600",
  },
  bookkeeping: {
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
    bg: "bg-teal-100", text: "text-teal-600",
  },
  payment: {
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    bg: "bg-green-100", text: "text-green-600",
  },
  system: {
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    bg: "bg-gray-100", text: "text-gray-600",
  },
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Zojuist";
  if (diffMins < 60) return `${diffMins}m geleden`;
  if (diffHours < 24) return `${diffHours}u geleden`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d geleden`;
  return date.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function groupByDate(notifications: Notification[]): { label: string; items: Notification[] }[] {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

  const groups: { label: string; items: Notification[] }[] = [];
  const todayItems: Notification[] = [];
  const yesterdayItems: Notification[] = [];
  const earlierItems: Notification[] = [];

  for (const n of notifications) {
    const d = n.createdAt.split("T")[0];
    if (d === today) todayItems.push(n);
    else if (d === yesterday) yesterdayItems.push(n);
    else earlierItems.push(n);
  }

  if (todayItems.length > 0) groups.push({ label: "Today", items: todayItems });
  if (yesterdayItems.length > 0) groups.push({ label: "Yesterday", items: yesterdayItems });
  if (earlierItems.length > 0) groups.push({ label: "Earlier", items: earlierItems });

  return groups;
}

export default function NotificationBell({
  variant = "dark",
}: {
  variant?: "dark" | "light";
}) {
  // The bell is the GLOBAL accountant-wide feed — all administrations,
  // each item labeled with its source administration (spec §3/§4).
  // Per-module badges / popups live in the sidebar and are scoped to the
  // active administration separately, so there is no cross-layer mixing.
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread" | "important">("all");
  const [loading, setLoading] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch { /* silent */ }
  }, []);

  // Initial fetch + polling every 30s
  useEffect(() => {
    fetchNotifications();
    pollTimer.current = setInterval(fetchNotifications, 30000);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (bellRef.current && bellRef.current.contains(target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    if (open) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  async function markAsRead(id: string) {
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    setLoading(true);
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    setLoading(false);
  }

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.isRead;
    if (filter === "important") return n.priority >= 1;
    return true;
  });

  const groups = groupByDate(filtered);

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={() => {
          if (!open && bellRef.current) {
            const rect = bellRef.current.getBoundingClientRect();
            const dropW = Math.min(400, window.innerWidth - 24);
            const left = Math.min(Math.max(rect.right - dropW, 12), window.innerWidth - dropW - 12);
            setDropdownPos({ top: rect.bottom + 8, left });
          }
          setOpen(!open);
          if (!open) fetchNotifications();
        }}
        className={`relative p-2 rounded-lg transition-all ${
          variant === "light"
            ? "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            : "text-white/60 hover:text-white hover:bg-white/10"
        }`}
        aria-label="Notificaties"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none px-1 animate-pulse-subtle">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel via portal */}
      {open && dropdownPos && createPortal(
        <div ref={dropdownRef} className="fixed w-[400px] max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-2xl border border-gray-200 z-[9999] overflow-hidden animate-dropdown-enter" style={{ top: dropdownPos.top, left: dropdownPos.left }}>
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Notificaties</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={loading}
                  className="text-xs font-medium text-[#2E6FA7] hover:text-[#12355B] transition-colors disabled:opacity-50"
                >
                  Alles gelezen
                </button>
              )}
            </div>
            {/* Filter tabs */}
            <div className="flex gap-1">
              {([
                { key: "all" as const, label: "Alles" },
                { key: "unread" as const, label: `Ongelezen${unreadCount > 0 ? ` (${unreadCount})` : ""}` },
                { key: "important" as const, label: "Important" },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filter === tab.key
                      ? "bg-[#2E6FA7]/10 text-[#2E6FA7]"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[420px] overflow-y-auto overscroll-contain">
            {groups.length === 0 ? (
              <div className="py-12 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-sm font-medium text-gray-400">No notifications</p>
                <p className="text-xs text-gray-300 mt-1">
                  {filter === "unread" ? "All notifications have been read" : filter === "important" ? "No important notifications" : "You're all caught up!"}
                </p>
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
                  </div>
                  {group.items.map((n) => {
                    const cat = CATEGORY_ICONS[n.category] || CATEGORY_ICONS.info;
                    return (
                      <div
                        key={n.id}
                        className={`group px-5 py-3 border-b border-gray-50 hover:bg-gray-50/80 transition-colors cursor-pointer ${
                          !n.isRead ? "bg-blue-50/30" : ""
                        }`}
                        onClick={() => {
                          if (!n.isRead) markAsRead(n.id);
                          if (n.actionUrl) {
                            window.location.href = n.actionUrl;
                            setOpen(false);
                          }
                        }}
                      >
                        <div className="flex items-start gap-3">
                          {/* Category icon */}
                          <div className={`w-8 h-8 rounded-lg ${cat.bg} ${cat.text} flex items-center justify-center shrink-0 mt-0.5`}>
                            {cat.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm leading-tight ${!n.isRead ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                                {n.title}
                              </p>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[11px] text-gray-400 whitespace-nowrap">{timeAgo(n.createdAt)}</span>
                                {!n.isRead && (
                                  <span className="w-2 h-2 rounded-full bg-[#2E6FA7] shrink-0" />
                                )}
                              </div>
                            </div>
                            {/* Administration label — so the accountant always
                                knows which administration triggered this
                                notification (spec §4). */}
                            {n.administration && (
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#2E6FA7] mt-0.5 truncate">
                                {n.administration.company || n.administration.name}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
                            {n.actionUrl && n.actionLabel && (
                              <span className="inline-block mt-1 text-[11px] font-medium text-[#2E6FA7] opacity-0 group-hover:opacity-100 transition-opacity">
                                {n.actionLabel} &rarr;
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Priority indicator */}
                        {n.priority >= 2 && (
                          <div className="mt-1.5 ml-11">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-red-100 text-red-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Urgent
                            </span>
                          </div>
                        )}
                        {n.priority === 1 && !n.isRead && (
                          <div className="mt-1.5 ml-11">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-600">
                              Important
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
