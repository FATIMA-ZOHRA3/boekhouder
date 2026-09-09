import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GROQ_MODEL, callGroq, requireAiAccess, truncateForPrompt } from "@/lib/ai";

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/ai/assistant
//
// Read-only Q&A over the caller's own financial data — built for the Mobile
// App's "AI Assistant" screen (see mobile/app/assistant/index.tsx). This is
// the ONLY route under /api/ai/* that accepts an open-ended question; every
// other route (draft-reply, summarize-task, suggest-category, ...) takes a
// fixed input shape and returns a fixed JSON shape. This one still reuses
// all the same shared infrastructure (requireAiAccess, callGroq, Groq model
// constant) rather than growing a second AI stack — see src/lib/ai.ts.
//
// Security model, mirroring GET /api/ai/financial-insights:
//  - Auth + rate limit + API-key check all come from requireAiAccess(), gated
//    on the new "ai.assistant.use" permission (see src/lib/permissions.ts —
//    "ai.use" is staff-only, this route is meant for clients too, so it
//    needed its own permission, same reasoning as "ai.voice-invoice.use").
//  - A client is always locked to their own data (session.userId). Only
//    staff (bookkeeper/admin) may pass a `clientId` to ask about a specific
//    client — never inferred, always explicit — exactly like
//    financial-insights's `?clientId=` query param.
//  - Bank data is only ever loaded into the prompt for staff callers,
//    because "bank.read" itself is staff-only in this app (see
//    src/lib/permissions.ts) — this route must not become a backdoor around
//    that boundary for a client caller.
//  - The model is never given tool-calling and is instructed it cannot
//    create/edit/delete/book anything — it can only describe data already
//    loaded read-only above. No write path exists in this file at all.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_QUESTION_LENGTH = 1000;
const MAX_HISTORY_TURNS = 6;

type ChatTurn = { role: "user" | "assistant"; content: string };

function parseHistory(input: unknown): ChatTurn[] {
  if (!Array.isArray(input)) return [];
  const turns: ChatTurn[] = [];
  for (const entry of input) {
    if (
      entry &&
      typeof entry === "object" &&
      (entry as { role?: unknown }).role &&
      typeof (entry as { content?: unknown }).content === "string" &&
      ((entry as { role: unknown }).role === "user" || (entry as { role: unknown }).role === "assistant")
    ) {
      const e = entry as { role: "user" | "assistant"; content: string };
      turns.push({ role: e.role, content: truncateForPrompt(e.content, 500) });
    }
  }
  // Only the tail matters for conversational context, and it keeps prompt
  // size (and therefore cost) bounded regardless of how long the client's
  // local chat history has grown.
  return turns.slice(-MAX_HISTORY_TURNS);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  // Slightly tighter than the 20/min default elsewhere: each call here loads
  // more rows and a bigger prompt than the narrow single-purpose AI routes.
  const access = await requireAiAccess("ai.assistant.use", { limit: 15, windowMs: 60_000 }, "assistant");
  if (!access.ok) return NextResponse.json(access.body, { status: access.status });

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "A question is required" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: "Question is too long" }, { status: 400 });
  }
  const history = parseHistory(body?.history);

  // --- Data scoping: never expose another user's data ----------------------
  const isStaff = session.role === "bookkeeper" || session.role === "admin";
  let targetUserId = session.userId;
  let targetLabel: string | null = null;

  if (isStaff && typeof body?.clientId === "string" && body.clientId.trim()) {
    const target = await prisma.user.findUnique({
      where: { id: body.clientId.trim() },
      select: { id: true, name: true, company: true },
    });
    if (!target) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    targetUserId = target.id;
    targetLabel = target.company || target.name;
  }

  // --- Load real, read-only data (capped, minimal fields) -------------------
  const [invoices, purchases, bankTx] = await Promise.all([
    prisma.invoice.findMany({
      where: { clientId: targetUserId },
      select: {
        invoiceNumber: true,
        date: true,
        dueDate: true,
        customerName: true,
        total: true,
        paidAmount: true,
        status: true,
        isCredit: true,
      },
      orderBy: { date: "desc" },
      take: 200,
    }),
    prisma.purchaseDocument.findMany({
      where: { userId: targetUserId },
      select: {
        supplierName: true,
        documentDate: true,
        dueDate: true,
        totalAmount: true,
        category: true,
        status: true,
      },
      orderBy: { documentDate: "desc" },
      take: 200,
    }),
    isStaff
      ? prisma.bankTransaction.findMany({
          where: { userId: targetUserId },
          select: {
            transactionDate: true,
            amount: true,
            direction: true,
            description: true,
            status: true,
          },
          orderBy: { transactionDate: "desc" },
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const dataContext = { today, invoices, purchases, bankTransactions: bankTx };

  const systemPrompt = [
    "You are a read-only financial assistant inside the Boekhouder accounting app, answering one authenticated user about their own bookkeeping data.",
    "Rules:",
    "- Only use the DATA JSON provided below. Never invent numbers, dates, or names.",
    "- If the data needed to answer isn't present in DATA, say so plainly instead of guessing.",
    "- You cannot create, edit, delete, send, validate, or book anything. If asked to perform an action, explain you can only answer questions and suggest they do it in the app.",
    "- Keep answers short and concrete (a few sentences, or a short list).",
    "- Amounts are in EUR.",
    targetLabel ? `You are answering on behalf of the accountant, about client "${targetLabel}".` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const groqResult = await callGroq(access.apiKey, {
    model: GROQ_MODEL,
    max_tokens: 400,
    temperature: 0.2,
    messages: [
      { role: "system", content: `${systemPrompt}\n\nDATA:\n${truncateForPrompt(JSON.stringify(dataContext), 6000)}` },
      ...history,
      { role: "user", content: question },
    ],
  });

  if (!groqResult.ok) {
    return NextResponse.json(
      { error: groqResult.message, retryAfterSeconds: groqResult.retryAfterSeconds },
      { status: groqResult.status }
    );
  }

  const answer = groqResult.data.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    return NextResponse.json({ error: "The AI returned an empty answer" }, { status: 502 });
  }

  return NextResponse.json({ answer, scopedTo: targetLabel });
}
