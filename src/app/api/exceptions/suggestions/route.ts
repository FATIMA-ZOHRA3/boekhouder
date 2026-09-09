import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Task #4: "detect a missing document" — deterministic rule, no LLM needed here.
//
// Rule: an outgoing bank payment ("debit") that has sat unmatched (status "new") for more
// than DAYS_THRESHOLD days is very likely an expense for which the client never uploaded
// the receipt/invoice. This mirrors exactly the manual case the accountant already flags
// today via "+ Opvolgvraag" -> "Ontbrekende bon / factuur" (same default title/description).
//
// This endpoint only SUGGESTS — same "AI proposes, accountant checks" principle as the other
// AI features. Nothing is written to the database here; the accountant still has to click
// "Create" per suggestion (which goes through the existing POST /api/exceptions).
const DAYS_THRESHOLD = 7;

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "exception.read");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_THRESHOLD);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // transactionDate is stored as YYYY-MM-DD

  const candidates = await prisma.bankTransaction.findMany({
    where: {
      direction: "debit",
      status: "new",
      transactionDate: { lte: cutoffStr },
    },
    include: { user: { select: { id: true, name: true, company: true } } },
    orderBy: { transactionDate: "asc" },
  });

  if (candidates.length === 0) {
    return Response.json({ suggestions: [] });
  }

  // Don't suggest a transaction that already has an open exception for it (avoid duplicates
  // if the accountant runs this detection more than once).
  const existing = await prisma.exceptionItem.findMany({
    where: {
      bankTransactionId: { in: candidates.map((c: typeof candidates[number]) => c.id) },
      status: { in: ["waiting", "responded"] },
    },
    select: { bankTransactionId: true },
  });
  const alreadyFlagged = new Set(existing.map((e: typeof existing[number]) => e.bankTransactionId));

  const suggestions = candidates
    .filter((tx: typeof candidates[number]) => !alreadyFlagged.has(tx.id))
    .map((tx: typeof candidates[number]) => {
      const days = Math.floor((Date.now() - new Date(tx.transactionDate).getTime()) / 86400000);
      return {
        bankTransactionId: tx.id,
        userId: tx.userId,
        userName: tx.user.company || tx.user.name,
        amount: tx.amount,
        transactionDate: tx.transactionDate,
        description: tx.description,
        counterparty: tx.counterparty,
        daysUnmatched: days,
        suggestedTitle: "We are still missing a receipt or invoice",
        suggestedDescription: `We found a payment for which we don't have a matching receipt or invoice. Could you upload it? (${tx.description}, €${tx.amount.toFixed(2)}, ${tx.transactionDate})`,
      };
    });

  return Response.json({ suggestions, thresholdDays: DAYS_THRESHOLD });
}
