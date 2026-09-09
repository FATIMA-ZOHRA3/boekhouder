// ═══════════════════════════════════════════════════════════════════════════
// Exception severity engine
// ═══════════════════════════════════════════════════════════════════════════
// Severity is DERIVED — no `severity` column was added to `ExceptionItem` in
// prisma/schema.prisma. This keeps the feature purely additive (no
// migration) while still giving the UI something to triage on.
//
// Inputs used (all already present on ExceptionItem or resolvable via a
// batch-fetched linked record — see route.ts):
//   - type       missing_document | missing_payment
//   - status     waiting | responded | resolved
//   - createdAt  age in days drives urgency
//   - amount     financial impact, when resolvable from the linked
//                invoice / purchase document / bank transaction
//
// The scoring is intentionally simple and centralized here so it is never
// duplicated in a component. If this needs to get smarter later (real
// financial impact, AI-assessed risk, etc.) this is the only file that
// changes.
// ═══════════════════════════════════════════════════════════════════════════

export type ExceptionSeverity = "critical" | "high" | "medium" | "low";

export interface SeverityInput {
  type: string;
  status: string;
  createdAt: string | Date;
  /** Financial amount linked to the exception, if resolvable. */
  amount?: number | null;
}

export function ageInDays(createdAt: string | Date): number {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const ms = Date.now() - created.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Computes a 0..8 urgency score from type + age + status + amount.
 * Exported mainly for testability; UI code should use
 * `computeExceptionSeverity` / `severityMeta` instead.
 */
export function computeSeverityScore(input: SeverityInput): number {
  // Resolved items are never urgent, regardless of how old or large.
  if (input.status === "resolved") return 0;

  const age = ageInDays(input.createdAt);
  const amount = input.amount ?? 0;
  let score = 0;

  // Age: the longer an exception sits unresolved, the more it risks
  // blocking a VAT filing or a closing.
  if (age >= 30) score += 3;
  else if (age >= 14) score += 2;
  else if (age >= 7) score += 1;

  // Type: a missing payment blocks cash reconciliation directly; a
  // missing document is usually recoverable with more lead time.
  if (input.type === "missing_payment") score += 2;
  else if (input.type === "missing_document") score += 1;

  // Status: nothing has happened yet vs. the client already responded
  // and it's awaiting a bookkeeper follow-up.
  if (input.status === "waiting") score += 1;

  // Financial impact, when known.
  if (amount >= 5000) score += 2;
  else if (amount >= 1000) score += 1;

  return score;
}

export function computeExceptionSeverity(input: SeverityInput): ExceptionSeverity {
  const score = computeSeverityScore(input);
  if (score >= 6) return "critical";
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

export const SEVERITY_ORDER: ExceptionSeverity[] = ["critical", "high", "medium", "low"];

export const severityMeta: Record<
  ExceptionSeverity,
  { label: string; badgeClass: string; dotClass: string; sortWeight: number }
> = {
  critical: {
    label: "Critical",
    badgeClass: "bg-red-50 text-red-700 border border-red-200",
    dotClass: "bg-red-500",
    sortWeight: 3,
  },
  high: {
    label: "High",
    badgeClass: "bg-orange-50 text-orange-700 border border-orange-200",
    dotClass: "bg-orange-500",
    sortWeight: 2,
  },
  medium: {
    label: "Medium",
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
    dotClass: "bg-amber-400",
    sortWeight: 1,
  },
  low: {
    label: "Low",
    badgeClass: "bg-sky-50 text-sky-700 border border-sky-200",
    dotClass: "bg-sky-400",
    sortWeight: 0,
  },
};
