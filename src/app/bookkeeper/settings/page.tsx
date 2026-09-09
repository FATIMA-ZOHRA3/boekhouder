"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/Card";

// ---------------------------------------------------------------------------
// Settings (SYSTEM > Settings) — was the "settings" section. Ledger
// account / VAT code management already lives on the new Accounting page,
// so this links there instead of duplicating that UI. Notification
// preferences now persist via PATCH /api/profile (notificationPrefs was
// already a column on User, just never wired up). "Client settings",
// "Booking rules" and "AI settings" are still presentation-only — there's
// no spec yet for what those should actually do, so they stay marked as
// such rather than getting fake functionality bolted on. "Bank
// connections" stays coming soon on purpose: it needs a real Open
// Banking/PSD2 provider, which can't be simulated honestly.
// ---------------------------------------------------------------------------

const NOTIFICATION_PREFS = [
  { key: "newException", label: "New exception created", defaultChecked: true },
  { key: "customerResponse", label: "Customer responded to an exception", defaultChecked: true },
  { key: "newPurchase", label: "New purchase document uploaded", defaultChecked: true },
  { key: "newMessage", label: "New message from a customer", defaultChecked: true },
  { key: "invoiceOverdue", label: "Invoice becomes overdue", defaultChecked: false },
];

const COMING_SOON = [
  { title: "Client settings", body: "Per-client defaults for invoicing, reminders and access." },
  { title: "Booking rules", body: "Automatic ledger account suggestions based on past bookings." },
  { title: "Bank connections", body: "Direct bank feeds instead of manual MT940 import." },
  { title: "AI settings", body: "Configure which workflows the AI assistant may automate." },
];

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => Object.fromEntries(NOTIFICATION_PREFS.map((p) => [p.key, p.defaultChecked])));
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((user) => {
        if (user?.notificationPrefs) {
          try {
            const stored = JSON.parse(user.notificationPrefs);
            setPrefs((prev) => ({ ...prev, ...stored }));
          } catch {
            // ignore malformed stored value, keep defaults
          }
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  async function updatePref(key: string, checked: boolean) {
    const next = { ...prefs, [key]: checked };
    setPrefs(next);
    setSaveState("saving");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPrefs: next }),
      });
      setSaveState(res.ok ? "saved" : "idle");
    } catch {
      setSaveState("idle");
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl space-y-6">
      <PageHeader title="Settings" />

      <Card>
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Chart of accounts &amp; VAT codes</h2>
        <p className="text-xs text-gray-400 mb-3">Manage the firm-wide ledger accounts and VAT codes used when booking invoices and purchases.</p>
        <Link href="/bookkeeper/accounting" className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800">
          Open Accounting →
        </Link>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800">Notifications</h2>
          <span className="text-xs text-gray-400">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : loaded ? "" : "Loading…"}
          </span>
        </div>
        <div className="space-y-2.5">
          {NOTIFICATION_PREFS.map((p) => (
            <label key={p.key} className="flex items-center justify-between gap-3 py-1 cursor-pointer">
              <span className="text-sm text-gray-700">{p.label}</span>
              <input type="checkbox" checked={!!prefs[p.key]} onChange={(e) => updatePref(p.key, e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500/30 w-4 h-4" />
            </label>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {COMING_SOON.map((c) => (
          <Card key={c.title} className="opacity-60">
            <p className="text-sm font-semibold text-gray-700">{c.title}</p>
            <p className="text-xs text-gray-400 mt-1">{c.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
