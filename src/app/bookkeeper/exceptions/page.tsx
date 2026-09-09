"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import { useToast } from "@/components/ToastProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, PageHeader, EmptyState } from "@/components/ui/Card";
import { Badge, Button } from "@/components/ui/Badge";
import { ageInDays, computeExceptionSeverity, SEVERITY_ORDER, severityMeta, type ExceptionSeverity } from "@/lib/exceptionSeverity";
import { formatCurrency, formatDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Exceptions — was the "exceptions" branch of the monolith (113 lines,
// already fairly self-contained). Severity triage cards + list are kept
// close to the original; "New exception" moves from an inline modal to a
// drawer, consistent with the rest of the redesign. Same severity model
// (src/lib/exceptionSeverity.ts) and endpoints as before.
// ---------------------------------------------------------------------------

interface ExceptionRow {
  id: string; type: string; status: string; title: string; description?: string; amount: number | null; createdAt: string;
  customerResponse?: string | null; customerNotes?: string | null; customerFileUrl?: string | null; customerFileName?: string | null;
  user: { id: string; name: string; company: string | null };
}

function ExceptionsInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const { addToast } = useToast();

  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<ExceptionSeverity | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/exceptions");
      setExceptions(res.ok ? await res.json() : []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const scoped = useMemo(() => exceptions.filter((e) => !activeAdminId || e.user.id === activeAdminId), [exceptions, activeAdminId]);
  const openExceptions = scoped.filter((e) => e.status !== "resolved");
  const enriched = useMemo(() => openExceptions.map((e) => ({ ...e, severity: computeExceptionSeverity(e) })), [openExceptions]);
  const bySeverity = SEVERITY_ORDER.reduce((acc, s) => { acc[s] = enriched.filter((e) => e.severity === s).length; return acc; }, {} as Record<ExceptionSeverity, number>);
  const filtered = (severityFilter ? enriched.filter((e) => e.severity === severityFilter) : enriched)
    .sort((a, b) => severityMeta[b.severity].sortWeight - severityMeta[a.severity].sortWeight || b.createdAt.localeCompare(a.createdAt));

  async function resolveException(id: string) {
    const res = await fetch(`/api/exceptions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "resolved" }) });
    if (res.ok) { setExceptions((prev) => prev.map((e) => (e.id === id ? { ...e, status: "resolved" } : e))); addToast({ type: "info", title: "Exception resolved" }); }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl space-y-6">
      <PageHeader title="Exceptions" subtitle="Sorted by derived urgency — type, age, status and amount" actions={<Button onClick={() => setShowCreate(true)}>New exception</Button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {SEVERITY_ORDER.map((sev) => {
          const meta = severityMeta[sev];
          const isActive = severityFilter === sev;
          return (
            <button key={sev} onClick={() => setSeverityFilter(isActive ? null : sev)}
              className={`rounded-xl p-5 shadow-sm border text-left transition-all ${meta.badgeClass} ${isActive ? "ring-2 ring-offset-1 ring-indigo-500" : "hover:opacity-80"}`}>
              <p className="text-xs font-medium mb-1">{meta.label}</p>
              <p className="text-2xl font-bold">{bySeverity[sev]}</p>
            </button>
          );
        })}
      </div>

      {loading ? (
        <Card><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card>
      ) : filtered.length === 0 ? (
        <EmptyState title={`No open exceptions${severityFilter ? ` (${severityMeta[severityFilter].label})` : ""}`} body="Everything is up to date." />
      ) : (
        <Card padding="none">
          <div className="divide-y divide-gray-50">
            {filtered.map((ex) => {
              const meta = severityMeta[ex.severity];
              const age = ageInDays(ex.createdAt);
              return (
                <div key={ex.id} className="px-4 sm:px-5 py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.badgeClass}`}><span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />{meta.label}</span>
                        <Badge tone={ex.status === "waiting" ? "warning" : ex.status === "responded" ? "info" : "success"}>{ex.status}</Badge>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{ex.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{ex.user.company || ex.user.name} · {formatDate(ex.createdAt.split("T")[0])} · {age} day{age === 1 ? "" : "s"} old{ex.amount != null && <> · {formatCurrency(ex.amount)}</>}</p>
                    </div>
                    {ex.status === "responded" && <button onClick={() => resolveException(ex.id)} className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 shrink-0">Resolve</button>}
                  </div>
                  {ex.status === "responded" && (
                    <div className="mt-3 bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <p className="text-xs text-blue-600 font-medium mb-1">Reply from customer:</p>
                      {ex.customerResponse && <p className="text-sm text-blue-800 font-medium">{ex.customerResponse}</p>}
                      {ex.customerNotes && <p className="text-sm text-blue-700 mt-1">{ex.customerNotes}</p>}
                      {ex.customerFileUrl && <a href={ex.customerFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline mt-1 inline-block">Attachment: {ex.customerFileName || "View file"}</a>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {showCreate && activeAdminId && (
        <CreateExceptionDrawer clientId={activeAdminId} onClose={() => setShowCreate(false)} onCreated={(item) => { setExceptions((prev) => [item, ...prev]); setShowCreate(false); addToast({ type: "info", title: "Exception created" }); }} />
      )}
    </div>
  );
}

function CreateExceptionDrawer({ clientId, onClose, onCreated }: { clientId: string; onClose: () => void; onCreated: (item: ExceptionRow) => void }) {
  const [type, setType] = useState("missing_document");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/exceptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: clientId, type, title, description }) });
      if (res.ok) onCreated(await res.json());
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white h-full shadow-2xl p-6 space-y-4 overflow-y-auto animate-slide-in-right">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">New exception</h2><button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="missing_document">Missing document</option>
            <option value="status_unclear">Status unclear</option>
          </select>
        </div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-xs font-medium text-gray-600 mb-1">Question for the customer</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
        <Button className="w-full" disabled={!title.trim() || !description.trim() || saving} onClick={submit}>{saving ? "Creating…" : "Send to customer"}</Button>
      </div>
    </div>
  );
}

export default function ExceptionsPage() {
  return (
    <RequireAdministration>
      <ExceptionsInner />
    </RequireAdministration>
  );
}
