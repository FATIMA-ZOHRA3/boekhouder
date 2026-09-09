import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { getGroqApiKey, GROQ_MODEL, GROQ_URL } from "@/lib/ai";

// Groq documents these headers at https://console.groq.com/docs/rate-limits —
// reading them here surfaces the account's REAL current budget (Free tier vs.
// Developer tier vs. a higher paid tier) directly in the app, instead of the
// admin having to guess from a 429's retryAfterSeconds or go log into the Groq
// console. Diagnostic only — nothing else about the request/response changes.
//
// IMPORTANT (per Groq's own docs, verified): x-ratelimit-*-requests always
// reports the DAILY quota (RPD), never per-minute (RPM) — Groq doesn't expose
// RPM via headers at all, only on the account's /settings/limits page. Fields
// are named accordingly below so nothing downstream mislabels this as "per
// minute" again. x-ratelimit-*-tokens is genuinely per-minute (TPM).
type GroqRateLimitInfo = {
  requestsPerDayLimit: number | null;
  requestsPerDayRemaining: number | null;
  tokensPerMinuteLimit: number | null;
  tokensPerMinuteRemaining: number | null;
  // Groq returns these as a duration string (e.g. "7.66s"), not a header this
  // app needs to do math on anywhere else — passed through as-is for display.
  requestsResetIn: string | null;
  tokensResetIn: string | null;
};

function extractRateLimitInfo(headers: Headers): GroqRateLimitInfo | null {
  const requestsLimit = headers.get("x-ratelimit-limit-requests");
  const tokensLimit = headers.get("x-ratelimit-limit-tokens");
  // Neither header present (some error responses omit them) — nothing to show.
  if (requestsLimit === null && tokensLimit === null) return null;
  const toNum = (v: string | null) => (v !== null && !Number.isNaN(Number(v)) ? Number(v) : null);
  return {
    requestsPerDayLimit: toNum(requestsLimit),
    requestsPerDayRemaining: toNum(headers.get("x-ratelimit-remaining-requests")),
    tokensPerMinuteLimit: toNum(tokensLimit),
    tokensPerMinuteRemaining: toNum(headers.get("x-ratelimit-remaining-tokens")),
    requestsResetIn: headers.get("x-ratelimit-reset-requests"),
    tokensResetIn: headers.get("x-ratelimit-reset-tokens"),
  };
}

// Test the Groq connection by performing a minimal, cheap chat completion.
// Mirrors /api/kvk/test-connection so the admin settings page can verify
// both integrations the same way, from the same place they configure them.
//
// This calls Groq directly rather than through the shared callGroq() helper:
// callGroq only needs (and only returns) rate-limit info on the 429 path, since
// that's the only case any other route acts on it. This endpoint's whole job is
// showing the account's real budget, so it reads the headers on every response,
// success included — no retries, short timeout, cheapest possible prompt.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "admin.settings");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const apiKey = await getGroqApiKey();
  if (!apiKey) {
    return Response.json({
      connected: false,
      error: "AI API key is not configured. Add it above or set GROQ_API_KEY in the environment.",
    });
  }

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 5,
        messages: [{ role: "user", content: "Reply with just: ok" }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return Response.json({
      connected: false,
      error: isTimeout ? "The request to Groq timed out." : `Could not reach Groq: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
  }

  const rateLimits = extractRateLimitInfo(response.headers);

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    let message = `Groq error (${response.status}): ${errText || response.statusText}`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) message = parsed.error.message;
    } catch { /* keep the raw text above */ }
    return Response.json({ connected: false, error: message, rateLimits });
  }

  return Response.json({
    connected: true,
    message: "Groq API connection is active and working correctly.",
    model: GROQ_MODEL,
    rateLimits,
  });
}
