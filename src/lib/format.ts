// ---------------------------------------------------------------------------
// Shared formatting helpers for the bookkeeper portal.
//
// These were previously copy-pasted (with tiny inconsistencies) inside
// app/client/page.tsx and app/bookkeeper/page.tsx. Centralised here as part
// of the navigation/IA redesign so every new route under app/bookkeeper/*
// formats currency, dates and relative time identically. Behaviour is
// unchanged from the original inline versions — this is a pure extraction.
// ---------------------------------------------------------------------------

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount || 0);
}

/** "2026-03-18" -> "18-03-2026" */
export function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

/** "2026-03-18" -> "woensdag 18 maart" */
export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""}`;
  return new Date(dateStr).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Monday-first calendar grid for a given month; `null` entries are leading blanks. */
export function getCalendarDays(monthDate: Date): (number | null)[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday start
  const days: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}
