// Task #5: "explain a tax rule in plain language" — the highest-risk AI feature in the
// vision doc, because a hallucinated tax rule can cost a real client real money.
//
// The guardrail here is structural, not just a prompt instruction:
// - This is NOT a free-text tax Q&A endpoint. The person cannot ask an arbitrary question.
// - `concept` must match an ACTIVE row in the TaxConcept table below. Anything else is
//   rejected before the AI is ever called — including a concept that used to exist but was
//   deactivated by an accountant (soft-delete, isActive: false).
// - Each concept's `groundingFact` is written and maintained by the accountant via
//   Admin > Fiscale begrippen (deliberately general VAT mechanics only — no specific euro
//   thresholds, deadlines, or anything that changes year to year, since those are exactly
//   the details that go stale/wrong; that's an editorial guideline for whoever fills in
//   the table, not something this endpoint can enforce).
// - The AI's ONLY job is to rephrase that fixed fact in warm, simple language and weave in
//   the client's own real numbers (already computed elsewhere, passed in, never invented
//   by the AI). It is explicitly told not to add any rule that isn't in the grounding text.
// - The "not tax advice" disclaimer is appended by this endpoint in code, not left to the
//   AI to remember to include.
import { prisma } from "@/lib/prisma";
import { GROQ_MODEL, callGroq, requireAiAccess } from "@/lib/ai";

export async function POST(request: Request) {
  // Confirmed by reading this route: it is intentionally open to every authenticated role
  // (client included) — see the file-header comment above. `ai.tax-concept.explain` is
  // granted to client/bookkeeper/admin alike, so this changes nothing about who can call
  // this route.
  const access = await requireAiAccess("ai.tax-concept.explain");
  if (!access.ok) return Response.json(access.body, { status: access.status });
  const { apiKey } = access;

  const body = await request.json();
  const { concept, amounts } = body as { concept?: string; amounts?: Record<string, number> };

  const entry = concept
    ? await prisma.taxConcept.findFirst({ where: { key: concept, isActive: true } })
    : null;
  if (!entry) {
    return Response.json({
      error: "Unknown topic. Only pre-approved concepts can be explained.",
    }, { status: 400 });
  }

  // Guard against malformed input: only accept finite numbers, ignore anything else
  // rather than crashing on `.toFixed()` of a non-number (e.g. a string or NaN slipped
  // in through the request body).
  const amountsLine = amounts
    ? Object.entries(amounts)
        .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
        .map(([k, v]) => `${k}: €${v.toFixed(2)}`)
        .join(", ")
    : "";

  const groqResult = await callGroq(apiKey, {
    model: GROQ_MODEL,
    max_completion_tokens: 220,
    // Highest-risk AI feature in the app (per the file header) — low temperature keeps
    // the rephrasing close to the grounding fact instead of wandering, on top of the
    // existing structural guardrail (fixed fact, no free-text Q&A).
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You explain a bookkeeping/tax concept to a business owner with no accounting knowledge, in plain English (no jargon, short sentences).

STRICT RULE: use ONLY the fact below. Do NOT make up any additional rules, amounts, thresholds, dates, or exceptions that aren't stated here. If in doubt, stay closer to the text rather than adding anything.

Fact: "${entry.groundingFact}"

${amountsLine ? `Use these actual figures from the customer to make it concrete (repeat them exactly, don't recalculate anything): ${amountsLine}` : ""}

Answer in at most 3-4 short sentences. No headings, no bullet points, just flowing text.`,
      },
      { role: "user", content: `Explain: ${entry.label}` },
    ],
  });

  if (!groqResult.ok) {
    return Response.json({ error: groqResult.message }, { status: groqResult.status });
  }

  const explanation = groqResult.data.choices?.[0]?.message?.content?.trim() || entry.groundingFact;

  return Response.json({
    concept,
    label: entry.label,
    explanation,
    disclaimer: "This is a general explanation, not tax advice for your specific situation. If in doubt, contact your bookkeeper or the Dutch Tax Administration.",
    generatedAt: new Date().toISOString(),
  });
}
