import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requirePermission, type Permission, type Role } from "@/lib/permissions";

export const GROQ_MODEL = "openai/gpt-oss-120b";
// Note: llama-3.3-70b-versatile was deprecated by Groq on 2026-06-17 and shuts down
// 2026-08-16. openai/gpt-oss-120b is Groq's recommended text replacement.
export const GROQ_VISION_MODEL = "qwen/qwen3.6-27b";
export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// ---------------------------------------------------------------------------
// Scan image compression — progressive, quota-aware resolution
// ---------------------------------------------------------------------------
// Longest edge (px) / JPEG quality that a scanned image is downscaled to
// before being sent to the vision model (see scan-purchase-document).
// Centralized here rather than hard-coded at each call site, since the
// "right" number is a Groq-quota trade-off that may need tuning again later.
//
// This used to be a single flat constant (1100px for every scan, regardless
// of whether the image needed it). That traded away legibility on every scan
// to guard against a rate limit that, most of the time, isn't actually close.
// Instead: normal case is 1400px / quality 82 (sharp), and resize() already
// uses fit: "inside" + withoutEnlargement: true, so an image that's already
// <= the chosen cap is never touched and never enlarged — no separate check
// needed for that. The cap itself only drops (1400 -> 1200 -> 1100, quality
// 82 -> 80 -> 78-80) when Groq's own remaining-token-budget headers (see
// GroqQuotaSnapshot below) say the vision model's TPM quota is genuinely
// getting tight. See chooseScanResolution().
export const MAX_SCAN_IMAGE_SIZE = 1400;
export const SCAN_IMAGE_SIZE_LOW_QUOTA = 1200;
export const SCAN_IMAGE_SIZE_VERY_LOW_QUOTA = 1100;

export const SCAN_JPEG_QUALITY_DEFAULT = 82;
export const SCAN_JPEG_QUALITY_LOW_QUOTA = 80;
// "quality 78-80" per spec: 80 is used down to CRITICAL, 78 only once the
// quota is closer to actually running out — see QUOTA_RATIO_CRITICAL below.
export const SCAN_JPEG_QUALITY_VERY_LOW_QUOTA = 80;
export const SCAN_JPEG_QUALITY_VERY_LOW_QUOTA_CRITICAL = 78;

// ---------------------------------------------------------------------------
// Groq quota tracking (real headers only — nothing here is estimated/guessed)
// ---------------------------------------------------------------------------
// Groq returns its own remaining-budget headers on every /chat/completions
// response (success AND error) — see https://console.groq.com/docs/rate-limits
// and the near-identical header parsing already done, for display only, in
// /api/ai/test-connection. x-ratelimit-*-tokens is the per-minute (TPM)
// budget, which is what the vision model's scan cost actually competes
// against, so that's what resolution selection below is based on.
//
// A response only tells us the quota AFTER Groq has already answered — but a
// scan's image has to be compressed and sent BEFORE that response exists. So
// this is necessarily the *last known* snapshot from a previous call to that
// same model, not a live read for the call about to be made. That's a
// reasonable trade-off (the alternative is guessing), and it self-corrects:
// every subsequent call refreshes the snapshot again. Tracked per model
// (rather than one shared snapshot) because Groq's TPM budgets differ by
// model, and conflating the text model's headroom with the vision model's
// would be exactly the kind of invented number this is meant to avoid.
export type GroqQuotaSnapshot = {
  remainingTokens: number | null;
  limitTokens: number | null;
  remainingRequests: number | null;
  limitRequests: number | null;
  observedAt: string;
};

const groqQuotaByModel = new Map<string, GroqQuotaSnapshot>();

function toHeaderNumber(v: string | null): number | null {
  return v !== null && !Number.isNaN(Number(v)) ? Number(v) : null;
}

function captureGroqQuota(model: string | undefined, headers: Headers): void {
  if (!model) return;
  const remainingTokens = toHeaderNumber(headers.get("x-ratelimit-remaining-tokens"));
  const limitTokens = toHeaderNumber(headers.get("x-ratelimit-limit-tokens"));
  const remainingRequests = toHeaderNumber(headers.get("x-ratelimit-remaining-requests"));
  const limitRequests = toHeaderNumber(headers.get("x-ratelimit-limit-requests"));
  // Some error responses omit rate-limit headers entirely — don't clobber a
  // perfectly good earlier snapshot with an all-null one in that case.
  if (remainingTokens === null && limitTokens === null && remainingRequests === null && limitRequests === null) return;
  groqQuotaByModel.set(model, { remainingTokens, limitTokens, remainingRequests, limitRequests, observedAt: new Date().toISOString() });
}

// Defaults to the vision model since that's the only caller of
// chooseScanResolution() today; pass a model explicitly for anything else.
export function getGroqQuotaSnapshot(model: string = GROQ_VISION_MODEL): GroqQuotaSnapshot | null {
  return groqQuotaByModel.get(model) ?? null;
}

export type ScanQuotaTier = "comfortable" | "low" | "very-low" | "unknown";
export type ScanResolutionChoice = { maxSize: number; quality: number; tier: ScanQuotaTier };

// Thresholds are against remainingTokens / limitTokens for the vision model's
// last known response. "unknown" (no snapshot yet, e.g. first scan since a
// restart, or a response that carried no rate-limit headers) always falls
// back to the normal 1400/82 behavior, per spec: never invent a quota.
const QUOTA_RATIO_LOW = 0.4;
const QUOTA_RATIO_VERY_LOW = 0.15;
const QUOTA_RATIO_CRITICAL = 0.05;

export function chooseScanResolution(
  quota: GroqQuotaSnapshot | null = getGroqQuotaSnapshot()
): ScanResolutionChoice {
  const ratio =
    quota && quota.remainingTokens !== null && quota.limitTokens !== null && quota.limitTokens > 0
      ? quota.remainingTokens / quota.limitTokens
      : null;

  if (ratio === null) {
    return { maxSize: MAX_SCAN_IMAGE_SIZE, quality: SCAN_JPEG_QUALITY_DEFAULT, tier: "unknown" };
  }
  if (ratio >= QUOTA_RATIO_LOW) {
    return { maxSize: MAX_SCAN_IMAGE_SIZE, quality: SCAN_JPEG_QUALITY_DEFAULT, tier: "comfortable" };
  }
  if (ratio >= QUOTA_RATIO_VERY_LOW) {
    return { maxSize: SCAN_IMAGE_SIZE_LOW_QUOTA, quality: SCAN_JPEG_QUALITY_LOW_QUOTA, tier: "low" };
  }
  const quality = ratio < QUOTA_RATIO_CRITICAL ? SCAN_JPEG_QUALITY_VERY_LOW_QUOTA_CRITICAL : SCAN_JPEG_QUALITY_VERY_LOW_QUOTA;
  return { maxSize: SCAN_IMAGE_SIZE_VERY_LOW_QUOTA, quality, tier: "very-low" };
}

// Same key-lookup pattern used across all /api/ai/* routes:
// env var first, then the SystemSetting row managed from Admin > Instellingen.
export async function getGroqApiKey(): Promise<string> {
  let apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "groq_api_key" } });
    if (setting?.value) apiKey = setting.value;
  }
  return apiKey;
}

// ---------------------------------------------------------------------------
// Shared Groq request helper
// ---------------------------------------------------------------------------
// Every /api/ai/* route used to independently re-implement: fetch + error-status
// mapping to a Dutch message + JSON parsing. None of them had a timeout, so a slow
// or hanging Groq response could hang the whole Next.js request indefinitely, and
// none of them retried a one-off network blip or a transient 5xx/429 — the user just
// saw a failure and had to click the button again. Centralizing this here means:
//  - a single timeout applies everywhere (reliability)
//  - transient failures (429/5xx/network) get a bounded, backed-off retry
//  - every route maps failures to the same status codes / structured error codes
//  - adding a new AI route, or swapping providers later, touches one file, not eight
const GROQ_TIMEOUT_MS = 25_000;

// A 429 is only retried automatically if Groq's own indicated wait is short enough
// that it's still cheaper than surfacing a cooldown to the user (see the
// "never retry immediately after a 429 — respect the delay" requirement). Above
// this threshold we stop immediately and hand `retryAfterSeconds` back to the
// caller instead — every /api/ai/* UI already reads that field to show a live
// countdown (see extractRetrySeconds / the `cooldown` state in the purchases
// drawer), so a long wait is surfaced to the person instead of blocking the
// request or burning more of the same exhausted quota.
const MAX_AUTO_RETRY_WAIT_SECONDS = 3;
// Hard ceiling regardless of what Groq reports, in case of a malformed/huge value.
const MAX_RETRY_AFTER_SECONDS_TRUSTED = 120;

export type GroqChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{ function: { name: string; arguments: string } }>;
    };
  }>;
};

// Structured error codes so every /api/ai/* route (and both Web and Mobile UIs,
// which share these routes) can branch on a stable machine-readable value instead
// of parsing an English sentence. `message` stays as the human-readable fallback.
export type AiErrorCode =
  | "AI_RATE_LIMIT"
  | "AI_TIMEOUT"
  | "AI_PROVIDER_ERROR"
  | "AI_INVALID_RESPONSE"
  | "AI_NOT_CONFIGURED";

export type GroqCallResult =
  | { ok: true; data: GroqChatCompletion }
  | { ok: false; status: number; code: AiErrorCode; message: string; retryAfterSeconds?: number };

// Reads Groq's rate-limit headers (documented at
// https://console.groq.com/docs/rate-limits) and/or the `retry-after` header,
// falling back to parsing "try again in Ns" out of the error body for older/edge
// responses that don't set headers. Returns whole seconds, or null if nothing
// usable was present.
function parseRetryAfterSeconds(response: Response, errText: string): number | null {
  const headerWait = response.headers.get("retry-after");
  if (headerWait) {
    const asSeconds = Number(headerWait);
    if (!Number.isNaN(asSeconds)) return Math.max(0, Math.ceil(asSeconds));
    // retry-after may also be an HTTP-date rather than a delta-seconds value.
    const asDate = Date.parse(headerWait);
    if (!Number.isNaN(asDate)) return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }

  // Groq-specific headers, e.g. "x-ratelimit-reset-requests: 7.66s" — whichever
  // resource (requests or tokens) resets later governs how long the caller
  // actually has to wait before a retry has any chance of succeeding.
  const resetHeaders = ["x-ratelimit-reset-requests", "x-ratelimit-reset-tokens"]
    .map((h) => response.headers.get(h))
    .filter((v): v is string => !!v)
    .map((v) => parseFloat(v))
    .filter((v) => !Number.isNaN(v));
  if (resetHeaders.length > 0) return Math.ceil(Math.max(...resetHeaders));

  try {
    const parsed = JSON.parse(errText);
    const match = /try again in ([\d.]+)s/i.exec(parsed?.error?.message || "");
    if (match) return Math.ceil(parseFloat(match[1]));
  } catch { /* not JSON, ignore */ }

  return null;
}

function rateLimitMessage(waitSeconds: number | null): string {
  return waitSeconds
    ? `Too many AI requests right now. Please try again in about ${waitSeconds} seconds.`
    : "Too many AI requests right now. Please wait a moment and try again.";
}

// Small, bounded exponential backoff with jitter for the cases that ARE worth an
// automatic retry (a short Groq-indicated wait, or a transient 5xx/network blip).
// Never used for a 429 whose indicated wait exceeds MAX_AUTO_RETRY_WAIT_SECONDS —
// see the check at the call site below.
function backoffDelayMs(attempt: number): number {
  const base = Math.min(2000, 300 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 150);
  return base + jitter;
}

// Whether this Groq org's plan supports `service_tier: "auto"` — discovered lazily
// from the first real response rather than assumed, since Groq rejects the whole
// request with a 400 (rather than silently ignoring the field) when a plan doesn't
// have flex-tier access. Once we learn it's unsupported, we stop sending it so
// we're not spending a wasted 400 on every single call for the rest of the process
// lifetime — plan changes are picked up on the next process restart, same tradeoff
// as every other module-level cache in this file.
let serviceTierSupported: boolean | null = null;

function isUnsupportedServiceTierError(status: number, errText: string): boolean {
  if (status !== 400) return false;
  try {
    const parsed = JSON.parse(errText);
    return parsed?.error?.type === "invalid_request_error" && /service_tier/i.test(parsed?.error?.message || "");
  } catch {
    return /service_tier/i.test(errText);
  }
}

export async function callGroq(
  apiKey: string,
  payload: Record<string, unknown>,
  opts: { retries?: number; timeoutMs?: number } = {}
): Promise<GroqCallResult> {
  // Maximum 2-3 retries as specified — clamped here so a caller can't accidentally
  // configure an unbounded retry loop against a paid, rate-limited API.
  const retries = Math.min(opts.retries ?? 1, 3);
  const timeoutMs = opts.timeoutMs ?? GROQ_TIMEOUT_MS;
  // service_tier: "auto" lets Groq use on_demand rate limits first, then fall back
  // to the higher-throughput flex tier automatically once on_demand is exhausted —
  // this is the main lever against 429s on the vision model. Not every Groq
  // plan/org has flex access though, in which case Groq rejects the whole request
  // with a 400 rather than ignoring the field — see the fallback below, which
  // detects that once and stops sending it for the rest of the process. A caller
  // can still override it by setting service_tier explicitly in payload.
  let body: Record<string, unknown> =
    serviceTierSupported === false ? { ...payload } : { service_tier: "auto", ...payload };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      // Capture Groq's real remaining-quota headers regardless of outcome
      // (success or error both carry them) — see captureGroqQuota() above.
      // This is what chooseScanResolution() reads for the *next* scan; it's
      // diagnostic/steering data only and never affects this call's result.
      captureGroqQuota(typeof body.model === "string" ? body.model : undefined, response.headers);

      if (response.ok) {
        serviceTierSupported = serviceTierSupported ?? true;
        return { ok: true, data: await response.json() };
      }

      // 401 is permanent (bad/expired key) — retrying won't help, and we don't want
      // to burn the retry budget on it.
      if (response.status === 401) {
        return {
          ok: false,
          status: 401,
          code: "AI_PROVIDER_ERROR",
          message: "Invalid AI API key. Check your configuration.",
        };
      }

      const errText = await response.text().catch(() => "");

      // This org's plan doesn't have access to service_tier — not a real failure,
      // just a capability we guessed wrong. Drop it and immediately redo the SAME
      // attempt (doesn't count against the retry budget — it's a compatibility
      // fallback, not a transient failure) rather than surfacing a 400 to the user.
      if (serviceTierSupported !== false && isUnsupportedServiceTierError(response.status, errText)) {
        serviceTierSupported = false;
        body = { ...payload };
        attempt -= 1;
        continue;
      }

      // 429: read the real wait time Groq gave us. Only retry automatically if
      // that wait is short — otherwise stop immediately and hand the wait back to
      // the caller instead of blocking the request or hammering an exhausted quota.
      if (response.status === 429) {
        const rawWaitSeconds = parseRetryAfterSeconds(response, errText);
        const waitSeconds = rawWaitSeconds !== null ? Math.min(rawWaitSeconds, MAX_RETRY_AFTER_SECONDS_TRUSTED) : null;

        if (attempt < retries && waitSeconds !== null && waitSeconds <= MAX_AUTO_RETRY_WAIT_SECONDS) {
          await new Promise((r) => setTimeout(r, waitSeconds * 1000 + Math.floor(Math.random() * 150)));
          continue;
        }

        return {
          ok: false,
          status: 429,
          code: "AI_RATE_LIMIT",
          message: rateLimitMessage(waitSeconds),
          // Exposed as a number (not just parsed from the English sentence above) so
          // callers can render a live countdown / auto re-enable a button, without
          // depending on the exact wording of `message` (which may change or be
          // translated later).
          retryAfterSeconds: waitSeconds ?? undefined,
        };
      }

      // json_validate_failed: Groq's JSON mode occasionally produces malformed JSON
      // on a given sample, which is a generation-quality fluke, not a bad request —
      // a retry (fresh sample) often just works. See https://console.groq.com/docs/errors.
      let isJsonValidateFailure = false;
      try {
        const parsed = JSON.parse(errText);
        isJsonValidateFailure = parsed?.error?.code === "json_validate_failed";
      } catch { /* not JSON, ignore */ }

      // 5xx (provider hiccup) and json_validate_failed are worth a short backed-off
      // retry; anything else (e.g. 400 bad request) means our payload was wrong and
      // won't succeed on retry either.
      const retryable = response.status >= 500 || isJsonValidateFailure;
      if (retryable && attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
        continue;
      }

      if (isJsonValidateFailure) {
        return {
          ok: false,
          status: 502,
          code: "AI_INVALID_RESPONSE",
          message: "The AI could not format its answer correctly. Please try again.",
        };
      }
      return {
        ok: false,
        status: 502,
        code: "AI_PROVIDER_ERROR",
        message: `AI-fout: ${errText || response.statusText}`,
      };
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      if (attempt < retries && !isTimeout) {
        // Network-level blips (not a timeout — a timeout at 25s means the provider
        // is genuinely slow/stuck, retrying immediately won't help) get the same
        // short backed-off retry as a 5xx.
        await new Promise((r) => setTimeout(r, backoffDelayMs(attempt)));
        continue;
      }
      return {
        ok: false,
        status: isTimeout ? 504 : 500,
        code: isTimeout ? "AI_TIMEOUT" : "AI_PROVIDER_ERROR",
        message: isTimeout
          ? "The AI request took too long and was aborted. Please try again."
          : `AI-fout: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
    }
  }
  // Unreachable in practice (loop always returns), kept for TypeScript's benefit.
  return { ok: false, status: 500, code: "AI_PROVIDER_ERROR", message: "AI error: unknown" };
}

// ---------------------------------------------------------------------------
// Lightweight per-user rate limiting for AI endpoints
// ---------------------------------------------------------------------------
// None of the /api/ai/* routes had any limit on how often one user could trigger
// them. Each call costs real money (Groq tokens) and a buggy or malicious client
// (e.g. a retry loop, or a script hitting the endpoint directly) could run up cost
// with no guardrail. This is an in-memory sliding window — fine for a single
// Node.js instance; if this app is ever horizontally scaled, swap the Map for a
// shared store (Redis, DB) without changing any call site.
//
// BUGFIX: this used to be keyed by `userId` alone. Every /api/ai/* route shared
// one counter per user regardless of which route's `opts.limit` it was checked
// against — e.g. scan-purchase-document asks for its own tighter 10/min budget
// (vision calls cost more), but its check ran against the SAME timestamp array
// that suggest-category (20/min), summarize-task (20/min), etc. were also
// pushing into. In practice this meant: using "Suggest category" a handful of
// times could push the shared counter past 10, so the very next "Recognize
// with AI" call was rejected with a 429 ("Too many AI requests") even though
// the user had never called that endpoint before — this is what produced the
// simultaneous, seemingly-unrelated 429s on the purchase-document screen
// (web and mobile both call these same two routes). Keying by `userId:scope`
// gives each declared budget (see `scope` on requireAiAccess) its own counter,
// while routes that don't pass a scope still share one general per-user bucket
// among themselves, same as before.
const rateLimitBuckets = new Map<string, number[]>();

function bucketKey(userId: string, scope: string): string {
  return `${userId}:${scope}`;
}

export function checkAiRateLimit(
  userId: string,
  opts: { limit: number; windowMs: number } = { limit: 20, windowMs: 60_000 },
  scope = "general"
): boolean {
  return checkAiRateLimitDetailed(userId, opts, scope).allowed;
}

// Same check as checkAiRateLimit, but also reports how many seconds until the
// oldest request in the window falls out of it — i.e. how long the caller
// actually has to wait. Callers that only need the boolean can keep using
// checkAiRateLimit; requireAiAccess uses this version so the 429 body can
// carry a real countdown instead of a generic "wait a moment".
export function checkAiRateLimitDetailed(
  userId: string,
  opts: { limit: number; windowMs: number } = { limit: 20, windowMs: 60_000 },
  scope = "general"
): { allowed: boolean; retryAfterSeconds?: number } {
  const key = bucketKey(userId, scope);
  const now = Date.now();
  const timestamps = (rateLimitBuckets.get(key) || []).filter((t) => now - t < opts.windowMs);
  if (timestamps.length >= opts.limit) {
    rateLimitBuckets.set(key, timestamps);
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((opts.windowMs - (now - oldest)) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  timestamps.push(now);
  rateLimitBuckets.set(key, timestamps);
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// In-flight de-duplication — concurrent calls / double-click / double-submit
// ---------------------------------------------------------------------------
// Neither the scanner nor the categorizer had any protection against two
// requests for the *same* purchase document (or the same categorization
// input) running concurrently — a double-click before the button's `disabled`
// state re-renders, two browser tabs, or a retried request all resulted in two
// full Groq calls for the same thing. This is a simple in-memory lock keyed by
// whatever the caller considers the "same work" (e.g. `scan:${purchaseDocumentId}`):
// the second caller awaits the first call's promise instead of starting its own.
// Same single-instance caveat as the rate limiter above — swap for a shared
// store (Redis, DB advisory lock) if this app is ever horizontally scaled.
const inFlight = new Map<string, Promise<unknown>>();

export async function dedupeInFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => {
    // Only clear the entry if it's still the one we set — avoids a race where a
    // fast subsequent call already replaced it.
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Category-suggestion cache — avoid re-asking Groq for the same categorization
// ---------------------------------------------------------------------------
// /api/ai/suggest-category has no persistence: a page refresh, remount, or a
// second look at the same invoice/description used to mean a brand new Groq
// call for a question that was already answered a moment ago. This is a
// short-lived in-memory cache keyed by the categorization input (invoiceId, or
// a normalized hash of the free-text description for a purchase document) —
// same single-instance caveat as above. A cache hit is only skipped when the
// caller explicitly asks to regenerate (`force: true`) or when the input text
// itself changed, which naturally produces a different key.
const CATEGORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — long enough to survive a
// refresh/navigation/re-render, short enough that a ledger account added or
// deactivated later the same day isn't suggested from a stale cache forever.
const categorySuggestionCache = new Map<string, { value: unknown; expiresAt: number }>();

export function getCachedSuggestion<T>(key: string): T | null {
  const entry = categorySuggestionCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    categorySuggestionCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCachedSuggestion<T>(key: string, value: T): void {
  categorySuggestionCache.set(key, { value, expiresAt: Date.now() + CATEGORY_CACHE_TTL_MS });
}

// Small stable hash (not cryptographic — just needs to be a short, deterministic
// cache key) for free-text categorization input that has no other stable id.
export function hashForCacheKey(text: string): string {
  let hash = 0;
  const normalized = text.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

// ---------------------------------------------------------------------------
// Input hygiene for free-text going into prompts
// ---------------------------------------------------------------------------
// Client messages, voice transcripts, and descriptions are untrusted input that
// gets embedded directly into a prompt. They can't grant the AI any new capability
// here (every route already only accepts a fixed JSON/tool-call shape back, and
// every "fact" the AI can state is either DB-grounded or validated afterwards), but
// an unbounded paste still inflates token cost unpredictably. Capping length keeps
// cost bounded and bounds the size of any injected instruction text.
export function truncateForPrompt(text: string, maxChars = 4000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + " […ingekort…]";
}

// Standard 429 response body/status for routes that hit the rate limit above.
export const AI_RATE_LIMIT_RESPONSE = {
  error: "Too many AI requests in quick succession. Wait a moment and try again.",
} as const;

// ---------------------------------------------------------------------------
// Unified entry-gate for /api/ai/* routes
// ---------------------------------------------------------------------------
// Every route under /api/ai/* independently repeated the same four checks —
// session -> permission -> rate limit -> API key configured — with slightly
// different error copy each time (e.g. summarize-task's "AI API key not
// configured" vs. every other route's longer "Add GROQ_API_KEY via Admin >
// Settings." message). Centralizing it here means one place to fix wording,
// one place to add a check for every route at once, and each route body
// shrinks from ~15 lines of boilerplate to a single call.
export type AiAccessResult =
  | { ok: true; userId: string; role: Role; apiKey: string }
  | { ok: false; status: number; body: { error: string; code?: AiErrorCode; retryAfterSeconds?: number } };

export async function requireAiAccess(
  permission: Permission,
  rateLimitOpts?: { limit: number; windowMs: number },
  // Bucket name for the rate limiter. Routes that pass their own `rateLimitOpts`
  // (a different budget than the 20/min default) should also pass a matching
  // `scope` — otherwise their custom limit is checked against the shared
  // general-purpose counter and can be tripped by unrelated routes. Defaults to
  // "general" so every route that doesn't care keeps sharing one budget, as before.
  scope = "general"
): Promise<AiAccessResult> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, body: { error: "Not logged in" } };

  const check = await requirePermission(session, permission);
  if (!check.ok) return { ok: false, status: check.status, body: { error: "No access" } };

  const rl = checkAiRateLimitDetailed(check.user.id, rateLimitOpts, scope);
  if (!rl.allowed) {
    return {
      ok: false,
      status: 429,
      body: { ...AI_RATE_LIMIT_RESPONSE, code: "AI_RATE_LIMIT", retryAfterSeconds: rl.retryAfterSeconds },
    };
  }

  const apiKey = await getGroqApiKey();
  if (!apiKey) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "AI API key is not configured. Add GROQ_API_KEY via Admin > Settings.",
        code: "AI_NOT_CONFIGURED",
      },
    };
  }

  return { ok: true, userId: check.user.id, role: check.user.role, apiKey };
}

// ---------------------------------------------------------------------------
// Consistent JSON parsing for Groq's response_format: json_object replies
// ---------------------------------------------------------------------------
// Three routes each hand-rolled `try { JSON.parse(raw) } catch { ... }` with
// different fallback behavior on failure — two returned a 502, one silently
// degraded to a truncated raw string as the result. Silent degradation means
// the bookkeeper can end up saving a garbled title with no indication
// anything went wrong; failing loudly (like the other two routes already do)
// is the safer default, so this helper standardizes on that.
export function parseGroqJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    // response_format: json_object is supposed to guarantee raw is pure JSON, but a model
    // occasionally wraps it in a ```json fence or adds a stray sentence before/after it
    // anyway. Before giving up, try stripping a markdown fence and, failing that, extracting
    // the outermost {...} block — cheap fallbacks that turn an otherwise-good answer into a
    // save instead of a "please try again" for the bookkeeper.
    const fenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    if (fenced !== raw) {
      try {
        return JSON.parse(fenced) as T;
      } catch { /* fall through to brace extraction */ }
    }
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch { /* give up below */ }
    }
    return null;
  }
}
