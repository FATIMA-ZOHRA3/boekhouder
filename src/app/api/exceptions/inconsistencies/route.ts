import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// Task #8: "help find inconsistencies" — same philosophy as task #4 (missing documents):
// deterministic rules, no LLM. An LLM comparing numbers is a worse, less trustworthy
// version of arithmetic and exact matching — it can miss a mismatch or invent one. Every
// rule below is either a simple equality check with a small rounding tolerance, or an
// amount-matching search, nothing fuzzy or generative.
//
// This endpoint only SUGGESTS. Nothing is written to the database — the accountant reviews
// each candidate and clicks "Create" to turn it into a real ExceptionItem (reusing the
// existing POST /api/exceptions), exactly like task #4.
const AMOUNT_TOLERANCE = 0.02; // rounding-cent tolerance for float comparisons
const RECENT_GRACE_DAYS = 3;   // don't flag a bank credit that arrived in the last few days
                                 // as "unexplained" — the accountant may not have invoiced yet

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "exception.read");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const [invoices, bankCredits, existingFlags] = await Promise.all([
    prisma.invoice.findMany({
      where: { isCredit: false },
      include: { client: { select: { id: true, name: true, company: true } } },
    }),
    prisma.bankTransaction.findMany({
      where: { direction: "credit" },
      include: { user: { select: { id: true, name: true, company: true } } },
    }),
    prisma.exceptionItem.findMany({
      where: { status: { in: ["waiting", "responded"] } },
      select: { invoiceId: true, bankTransactionId: true },
    }),
  ]);
  const flaggedInvoiceIds = new Set(existingFlags.map((e: typeof existingFlags[number]) => e.invoiceId).filter(Boolean));
  const flaggedTxIds = new Set(existingFlags.map((e: typeof existingFlags[number]) => e.bankTransactionId).filter(Boolean));

  const suggestions: Array<{
    ruleType: "unpaid_no_bank_match" | "vat_arithmetic_mismatch" | "unexplained_bank_credit";
    userId: string; userName: string;
    invoiceId?: string; bankTransactionId?: string;
    title: string; description: string;
    suggestedTitle: string; suggestedDescription: string;
  }> = [];

  // Rule A: invoice marked "paid" in the app, but no incoming bank transaction of a
  // matching amount exists for that client at all. Either the payment was recorded by
  // mistake, or the money genuinely never arrived.
  for (const inv of invoices) {
    if (inv.status !== "paid" || flaggedInvoiceIds.has(inv.id)) continue;
    const hasMatch = bankCredits.some((tx: typeof bankCredits[number]) => tx.userId === inv.clientId && Math.abs(tx.amount - inv.total) <= AMOUNT_TOLERANCE);
    if (!hasMatch) {
      suggestions.push({
        ruleType: "unpaid_no_bank_match",
        userId: inv.clientId, userName: inv.client.company || inv.client.name,
        invoiceId: inv.id,
        title: `Factuur ${inv.invoiceNumber} marked as paid, no bank match`,
        description: `Factuur ${inv.invoiceNumber} (€${inv.total.toFixed(2)}) is marked "paid", but no incoming bank transaction of that amount was found for this customer.`,
        suggestedTitle: "Controle payment invoice " + inv.invoiceNumber,
        suggestedDescription: `Your invoice ${inv.invoiceNumber} of €${inv.total.toFixed(2)} is registered as paid with us, but we don't see a corresponding bank receipt. Could you share proof of payment so we can verify this?`,
      });
    }
  }

  // Rule B: pure arithmetic — subtotal + VAT should equal total. A mismatch here is a data
  // entry error, not a judgment call, so it's 100% safe to flag automatically.
  for (const inv of invoices) {
    if (flaggedInvoiceIds.has(inv.id)) continue;
    const expectedTotal = inv.subtotal + inv.vatAmount;
    if (Math.abs(expectedTotal - inv.total) > AMOUNT_TOLERANCE) {
      suggestions.push({
        ruleType: "vat_arithmetic_mismatch",
        userId: inv.clientId, userName: inv.client.company || inv.client.name,
        invoiceId: inv.id,
        title: `Calculation error on invoice ${inv.invoiceNumber}`,
        description: `Subtotal (€${inv.subtotal.toFixed(2)}) + VAT (€${inv.vatAmount.toFixed(2)}) = €${expectedTotal.toFixed(2)}, but the total is €${inv.total.toFixed(2)}.`,
        suggestedTitle: "Calculation error on invoice " + inv.invoiceNumber,
        suggestedDescription: `We found a calculation discrepancy on invoice ${inv.invoiceNumber}: subtotal + VAT does not match the stated total amount. This will be corrected internally, no action needed on your part.`,
      });
    }
  }

  // Rule C: an incoming bank payment with no invoice of a matching amount for that
  // client anywhere in the system — possibly unrecorded revenue. Recent transactions get
  // a grace period since the invoice may simply not be created yet.
  for (const tx of bankCredits) {
    if (flaggedTxIds.has(tx.id) || daysAgo(tx.transactionDate) < RECENT_GRACE_DAYS) continue;
    const hasMatch = invoices.some((inv: typeof invoices[number]) => inv.clientId === tx.userId && Math.abs(inv.total - tx.amount) <= AMOUNT_TOLERANCE);
    if (!hasMatch) {
      suggestions.push({
        ruleType: "unexplained_bank_credit",
        userId: tx.userId, userName: tx.user.company || tx.user.name,
        bankTransactionId: tx.id,
        title: `Onverklaarde bankontvangst €${tx.amount.toFixed(2)}`,
        description: `Incoming payment of €${tx.amount.toFixed(2)} (${tx.description}, ${tx.transactionDate}) doesn't match an invoice amount for this customer.`,
        suggestedTitle: "Unexplained receipt in your account",
        suggestedDescription: `We see a receipt of €${tx.amount.toFixed(2)} (${tx.description}, ${tx.transactionDate}) that doesn't match one of our invoices. What does this amount relate to?`,
      });
    }
  }

  return Response.json({ suggestions });
}
