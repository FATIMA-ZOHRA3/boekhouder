"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAdministration } from "@/components/AdministrationProvider";
import RequireAdministration from "@/components/RequireAdministration";
import { Card, EmptyState, PageHeader } from "@/components/ui/Card";
import { formatTimeAgo, todayISO } from "@/lib/format";

// ---------------------------------------------------------------------------
// Messages — was the "berichten" section. Moved from a query-string tab
// buried inside the monolith to its own route, kept as the split-screen
// layout messaging naturally wants: conversation list on the left, active
// thread on the right — same as before, just no longer sharing a page
// with six other unrelated modules.
// ---------------------------------------------------------------------------

interface ConversationRow { id: string; subject: string; lastMessage: string | null; lastAt: string; unreadByAccountant: boolean; user: { id: string; name: string; company: string | null } }
interface MessageRow { id: string; text: string; senderRole: string; createdAt: string; sender: { id: string; name: string } }
interface SummaryResult { summary: string; openQuestion: string | null; messageCount: number }

function MessagesInner() {
  const { activeAdministration } = useAdministration();
  const activeAdminId = activeAdministration ? activeAdministration.id : null;
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // AI: résumé de conversation (/api/ai/summarize-conversation) et brouillon
  // de réponse (/api/ai/draft-reply) — les deux ne font que proposer, le
  // comptable relit / envoie lui-même.
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [draftingReply, setDraftingReply] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/conversations").then((r) => (r.ok ? r.json() : [])).then((d) => setConversations(Array.isArray(d) ? d : [])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => conversations.filter((c) => !activeAdminId || c.user.id === activeAdminId).sort((a, b) => b.lastAt.localeCompare(a.lastAt)), [conversations, activeAdminId]);

  useEffect(() => { if (!activeId && filtered.length > 0) setActiveId(filtered[0].id); }, [filtered, activeId]);

  useEffect(() => {
    if (!activeId) return;
    fetch(`/api/conversations/${activeId}`).then((r) => (r.ok ? r.json() : null)).then((d) => setMessages(d?.messages || []));
    // Reset any AI results from the previous thread — a summary/draft for
    // conversation A must never linger on screen once we switch to B.
    setSummary(null); setSummaryError(null); setDraftError(null);
  }, [activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function summarizeConversation() {
    if (!activeId) return;
    setSummarizing(true); setSummaryError(null);
    try {
      const res = await fetch("/api/ai/summarize-conversation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId }),
      });
      const data = await res.json();
      if (!res.ok) { setSummaryError(data.error || "Could not summarize this conversation."); return; }
      setSummary(data);
    } catch { setSummaryError("Could not reach the AI service."); }
    finally { setSummarizing(false); }
  }

  async function draftReply() {
    if (!activeId) return;
    setDraftingReply(true); setDraftError(null);
    try {
      const res = await fetch("/api/ai/draft-reply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId }),
      });
      const data = await res.json();
      if (!res.ok) { setDraftError(data.error || "Could not draft a reply."); return; }
      setDraft(data.draft || "");
    } catch { setDraftError("Could not reach the AI service."); }
    finally { setDraftingReply(false); }
  }

  async function send() {
    if (!draft.trim() || !activeId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${activeId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: draft.trim() }) });
      if (res.ok) { const msg = await res.json(); setMessages((prev) => [...prev, msg]); setDraft(""); }
    } finally { setSending(false); }
  }

  // AI: résumé de tâche (/api/ai/summarize-task) — appelé depuis un message
  // du client pour créer une tâche à partir de son contenu (titre court +
  // description), sans retaper à la main.
  const [taskFromMsg, setTaskFromMsg] = useState<Record<string, "creating" | "created" | "error">>({});

  async function createTaskFromMessage(m: MessageRow) {
    if (!activeConvo) return;
    setTaskFromMsg((prev) => ({ ...prev, [m.id]: "creating" }));
    try {
      const sumRes = await fetch("/api/ai/summarize-task", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageText: m.text, customerName: activeConvo.user.company || activeConvo.user.name }),
      });
      const sumData = await sumRes.json();
      if (!sumRes.ok) { setTaskFromMsg((prev) => ({ ...prev, [m.id]: "error" })); return; }

      const taskRes = await fetch("/api/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sumData.title || m.text.slice(0, 60),
          description: sumData.description || "",
          date: todayISO(),
          userId: activeConvo.user.id,
          assignedTo: "accountant",
        }),
      });
      setTaskFromMsg((prev) => ({ ...prev, [m.id]: taskRes.ok ? "created" : "error" }));
    } catch { setTaskFromMsg((prev) => ({ ...prev, [m.id]: "error" })); }
  }

  const activeConvo = filtered.find((c) => c.id === activeId);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <PageHeader title="Messages" subtitle={activeAdministration ? (activeAdministration.company || activeAdministration.name) : "All companies"} />

      {loading ? (
        <Card className="mt-6"><p className="text-sm text-gray-400 text-center py-10">Loading…</p></Card>
      ) : filtered.length === 0 ? (
        <div className="mt-6"><EmptyState title="No conversations yet" body="Messages from this company will show up here." /></div>
      ) : (
        <Card padding="none" className="mt-6 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] h-[600px]">
            {/* Left: conversation list */}
            <div className="border-r border-gray-100 overflow-y-auto">
              {filtered.map((c) => (
                <button key={c.id} onClick={() => setActiveId(c.id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${activeId === c.id ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${c.unreadByAccountant ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>{c.subject}</p>
                    {c.unreadByAccountant && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{c.lastMessage}</p>
                  <p className="text-[10px] text-gray-300 mt-1">{formatTimeAgo(c.lastAt)}</p>
                </button>
              ))}
            </div>

            {/* Right: thread */}
            <div className="flex flex-col min-h-0">
              {activeConvo ? (
                <>
                  <div className="px-5 py-3 border-b border-gray-100 shrink-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{activeConvo.subject}</p>
                      <p className="text-xs text-gray-400">{activeConvo.user.company || activeConvo.user.name}</p>
                    </div>
                    <button onClick={summarizeConversation} disabled={summarizing || messages.length === 0}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      {summarizing ? "Summarizing…" : "Summarize with AI"}
                    </button>
                  </div>
                  {(summary || summaryError) && (
                    <div className="px-5 py-3 border-b border-gray-100 shrink-0 bg-indigo-50/60">
                      {summaryError ? (
                        <p className="text-xs text-red-600">{summaryError}</p>
                      ) : summary ? (
                        <>
                          <p className="text-xs text-indigo-900 leading-relaxed">{summary.summary}</p>
                          {summary.openQuestion && (
                            <p className="text-xs text-indigo-700 mt-1.5 font-medium">Open: {summary.openQuestion}</p>
                          )}
                        </>
                      ) : null}
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {messages.map((m) => (
                      <div key={m.id} className={`flex ${m.senderRole === "bookkeeper" ? "justify-end" : "justify-start"}`}>
                        <div className={`group max-w-[75%] ${m.senderRole === "bookkeeper" ? "" : "flex items-end gap-1.5"}`}>
                          <div className={`rounded-2xl px-4 py-2.5 text-sm ${m.senderRole === "bookkeeper" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}>
                            <p>{m.text}</p>
                            <p className={`text-[10px] mt-1 ${m.senderRole === "bookkeeper" ? "text-white/60" : "text-gray-400"}`}>{formatTimeAgo(m.createdAt)}</p>
                          </div>
                          {m.senderRole !== "bookkeeper" && (
                            <button onClick={() => createTaskFromMessage(m)} disabled={taskFromMsg[m.id] === "creating"} title="Create a task from this message with AI"
                              className={`shrink-0 mb-1 p-1.5 rounded-lg transition-colors ${
                                taskFromMsg[m.id] === "created" ? "text-emerald-500" : taskFromMsg[m.id] === "error" ? "text-red-400" : "text-gray-300 opacity-0 group-hover:opacity-100 hover:text-indigo-500 hover:bg-indigo-50"
                              }`}>
                              {taskFromMsg[m.id] === "created" ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={bottomRef} />
                  </div>
                  <div className="border-t border-gray-100 p-3 shrink-0">
                    {draftError && <p className="text-xs text-red-600 mb-2">{draftError}</p>}
                    <div className="flex gap-2">
                      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Write a reply…"
                        className="flex-1 border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" />
                      <button onClick={draftReply} disabled={draftingReply || messages.length === 0} title="Draft a reply with AI"
                        className="px-3 py-2.5 border border-indigo-200 text-indigo-600 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-indigo-50 transition-colors shrink-0">
                        {draftingReply ? "…" : "AI reply"}
                      </button>
                      <button onClick={send} disabled={!draft.trim() || sending} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-indigo-700 transition-colors shrink-0">Send</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Select a conversation</div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <RequireAdministration>
      <MessagesInner />
    </RequireAdministration>
  );
}
