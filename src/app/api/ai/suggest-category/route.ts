import { prisma } from "@/lib/prisma";
import {
  GROQ_MODEL, callGroq, requireAiAccess, parseGroqJson, truncateForPrompt,
  dedupeInFlight, getCachedSuggestion, setCachedSuggestion, hashForCacheKey, type AiErrorCode,
} from "@/lib/ai";

// [PurchaseCategorize] — dev-only diagnostic logging. Never logs the API key,
// Authorization header, or the full entry text being categorized.
function logCategorize(fields: Record<string, string | number | undefined>) {
  if (process.env.NODE_ENV === "production") return;
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`[PurchaseCategorize] ${parts}`);
}

interface LedgerAccountRow {
  accountNumber: string;
  name: string;
  defaultVatCode: { code: string; name: string; percentage: number } | null;
}

interface InvoiceItemRow {
  description: string;
  quantity: number;
  unitPrice: number;
}

// Same pattern as /api/ai/draft-reply and /api/ai/summarize-task: bookkeeper-only, Groq,
// "AI proposes -> accountant checks" — the suggestion is never written to the invoice by
// this endpoint, the accountant still has to click it in the booking modal.
//
// Guardrail: the AI is only allowed to pick from the administration's REAL, active ledger
// accounts (fetched from the DB and passed in the prompt). We validate its answer against
// that same list afterwards and drop it if it doesn't match, rather than trust free text —
// this is what stops it from inventing a plausible-looking but nonexistent account number.
// Shape cached/returned to the caller — kept as its own type so the cache and
// the fresh-call path always agree on what a "suggestion" looks like.
interface SuggestionResult {
  accountNumber: string;
  accountName: string;
  ledgerAccount: string;
  defaultVatCode: { code: string; name: string; percentage: number } | null;
  reasoning: string;
  generatedAt: string;
}

export async function POST(request: Request) {
  const access = await requireAiAccess("ai.use");
  if (!access.ok) return Response.json(access.body, { status: access.status });
  const { apiKey, userId, role } = access;

  const body = await request.json();
  const { invoiceId, description, force } = body;

  if (!invoiceId && !description) {
    return Response.json({ error: "Invoice ID or description is required" }, { status: 400 });
  }
  if (description !== undefined && typeof description !== "string") {
    return Response.json({ error: "Invalid description" }, { status: 400 });
  }

  // Cache/dedup key: an invoice has a stable id, so re-categorizing the same
  // invoice (a refresh, a re-render, navigating back) hits the same key. A free-
  // text description (the purchase-document path, which has no id of its own
  // here) is keyed by a hash of its own content — if the underlying document
  // data changes, the description text changes, and so does the key, which
  // naturally produces a fresh call instead of a stale cache hit (see PARTIE D:
  // "nouvelle génération uniquement ... ou changement des données pertinentes").
  const cacheKey = invoiceId ? `invoice:${invoiceId}` : `desc:${hashForCacheKey(description)}`;

  if (!force) {
    const cached = getCachedSuggestion<SuggestionResult>(cacheKey);
    if (cached) {
      logCategorize({ userId, role, cacheKey, status: "cache-hit" });
      return Response.json({ ...cached, fromCache: true });
    }
  }

  // Build the context to categorize: prefer a real invoice (with line items) if given,
  // otherwise fall back to a free-text description (e.g. for a purchase document).
  let contextLines: string[] = [];
  let administrationId: string | undefined;
  if (invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    });
    if (!invoice) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    administrationId = invoice.clientId;
    contextLines = invoice.items.length > 0
      ? invoice.items.map((it: InvoiceItemRow) => `- ${it.description} (${it.quantity}x a €${it.unitPrice})`)
      : [`- ${invoice.customerName} - ${invoice.invoiceNumber}`];
  } else {
    contextLines = [`- ${description}`];
  }

  const ledgerAccounts: LedgerAccountRow[] = await prisma.ledgerAccount.findMany({
    where: { isActive: true },
    orderBy: { accountNumber: "asc" },
    include: { defaultVatCode: true },
  });

  if (ledgerAccounts.length === 0) {
    return Response.json({ error: "No general ledger accounts found" }, { status: 400 });
  }

  const accountList = ledgerAccounts.map((a) => `${a.accountNumber} ${a.name}`).join("\n");

  // De-duplicated against concurrent calls for the SAME cache key — a double-
  // click, two tabs, or a retry for the same invoice/description share one
  // in-flight Groq call instead of firing two.
  const result = await dedupeInFlight<{ status: number; body: Record<string, unknown> }>(`categorize:${cacheKey}`, async () => {
    const groqResult = await callGroq(apiKey, {
      model: GROQ_MODEL,
      max_tokens: 150,
      // This is a classification task with one correct-ish answer per entry, not a
      // creative one — a low temperature makes the pick more consistent for the
      // same/similar entries and reduces the odds of a malformed JSON sample.
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an assistant for a bookkeeper that categorizes entry lines onto a general ledger account.

Rules:
- ALWAYS choose an account EXACTLY as it appears in the list (account number + name, copied verbatim)
- NEVER make up an account number that isn't in the list
- If nothing fits well, choose the closest general account
- "reasoning": 1 short sentence in simple English explaining why this account fits
- Return the result as JSON: {"accountNumber": "...", "accountName": "...", "reasoning": "..."}
- Only return valid JSON, no explanation`,
        },
        {
          role: "user",
          content: `Available general ledger accounts:\n${accountList}\n\nEntry to categorize:\n${truncateForPrompt(contextLines.join("\n"), 2000)}\n\nGive the best matching account as JSON.`,
        },
      ],
    });

    if (!groqResult.ok) {
      logCategorize({ userId, role, administrationId, cacheKey, status: `error:${groqResult.code}`, httpStatus: groqResult.status });
      return {
        status: groqResult.status,
        body: { error: groqResult.message, code: groqResult.code, retryAfterSeconds: groqResult.retryAfterSeconds },
      };
    }

    const raw = groqResult.data.choices?.[0]?.message?.content || "{}";
    const parsed = parseGroqJson<{ accountNumber?: string; accountName?: string; reasoning?: string }>(raw);
    if (!parsed) {
      logCategorize({ userId, role, administrationId, cacheKey, status: "error:AI_INVALID_RESPONSE" });
      const code: AiErrorCode = "AI_INVALID_RESPONSE";
      return { status: 502, body: { error: "AI returned an invalid answer", code } };
    }

    // Guardrail: validate the suggestion against the real list, don't trust free text.
    const match = ledgerAccounts.find((a) => a.accountNumber === parsed.accountNumber);
    if (!match) {
      logCategorize({ userId, role, administrationId, cacheKey, status: "error:account-not-in-list" });
      const code: AiErrorCode = "AI_INVALID_RESPONSE";
      return { status: 502, body: { error: "AI suggestion did not match an existing account", code } };
    }

    const suggestion: SuggestionResult = {
      accountNumber: match.accountNumber,
      accountName: match.name,
      ledgerAccount: `${match.accountNumber} ${match.name}`,
      defaultVatCode: match.defaultVatCode
        ? { code: match.defaultVatCode.code, name: match.defaultVatCode.name, percentage: match.defaultVatCode.percentage }
        : null,
      reasoning: parsed.reasoning || "",
      generatedAt: new Date().toISOString(),
    };
    setCachedSuggestion(cacheKey, suggestion);
    logCategorize({ userId, role, administrationId, cacheKey, model: GROQ_MODEL, status: "success" });

    return { status: 200, body: { ...suggestion, fromCache: false } };
  });

  return Response.json(result.body, { status: result.status });
}
