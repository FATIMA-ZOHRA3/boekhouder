import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  GROQ_VISION_MODEL,
  callGroq,
  requireAiAccess,
  parseGroqJson,
  dedupeInFlight,
  chooseScanResolution,
  type AiErrorCode,
  type ScanResolutionChoice,
} from "@/lib/ai";

// [PurchaseScan] — dev-only diagnostic logging. Never logs the API key,
// Authorization header, base64 image data, or the document's own content —
// only identifiers and status, matching the observability requirement.
function logScan(fields: Record<string, string | number | undefined>) {
  if (process.env.NODE_ENV === "production") return;
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`[PurchaseScan] ${parts}`);
}

// Task #7: "help recognize an invoice" — scan an uploaded purchase document (receipt/
// invoice image or PDF) and suggest the bookkeeping fields, same "AI proposes, accountant
// checks" principle as every other AI feature here: nothing is written to the
// PurchaseDocument by this endpoint. The accountant still has to review and click
// "Save" on the existing PATCH /api/purchases/[id] form, exactly as if they'd typed the
// values in themselves.
//
// Only bookkeeper/admin can call this, because only they are allowed to write these
// bookkeeping fields at all (see the isAccountant check in PATCH /api/purchases/[id]).
//
// Groq's vision model (qwen/qwen3.6-27b) only accepts image input, not PDF — so a PDF is
// rendered to a PNG image of its first page first (via pdf-to-img, pure-JS pdfjs-dist +
// node-canvas, no extra system packages needed). Multi-page PDFs: only page 1 is scanned,
// which covers the vast majority of receipts/invoices; a clear note is returned so nothing
// is silently missed for a multi-page document.
//
// Every image is downscaled/recompressed with sharp before it's sent to Groq. Vision
// models bill (and rate-limit) by image resolution, and phone photos / 2x-scaled PDF
// renders were routinely 2000px+ — burning 2500-7000+ tokens per scan against Groq's
// on_demand 8000 TPM budget and tripping "rate limit reached" on the very next document.
//
// The resolution/quality actually used is chosen per-scan by chooseScanResolution()
// (see lib/ai.ts): normal case is 1400px / quality 82, dropping to 1200px/q80 then
// 1100px/q78-80 only when Groq's own last-known remaining-token headers for the vision
// model say the TPM budget is genuinely getting tight — never a flat cap applied to
// every scan regardless of need. `withoutEnlargement: true` (combined with fit: "inside")
// means an already-small image is left at its own size rather than padded up to the
// cap, or reduced below it, on every tier. `.rotate()` with no arguments applies the
// image's own EXIF orientation before resizing (then strips the tag) so a sideways
// phone photo doesn't get measured/resized on the wrong axis.
const MIME_BY_TYPE: Record<string, string> = { jpg: "image/jpeg", png: "image/png" };

export type ScanCompressionStats = {
  originalWidthPx: number | null;
  originalHeightPx: number | null;
  originalBytes: number;
  sentWidthPx: number | null;
  sentHeightPx: number | null;
  sentBytes: number;
  // Which resolution/quality tier was actually used for this scan, and why —
  // surfaced so the Admin diagnostic panel can show the quota's real effect,
  // not just the before/after pixel numbers.
  quotaTier: ScanResolutionChoice["tier"];
  maxSizeUsed: number;
  qualityUsed: number;
};

// `resolutionOverride` lets a caller (currently just tests) force a specific
// tier instead of reading the live Groq quota snapshot — production call
// sites never pass it, so they always get the real chooseScanResolution().
export async function compressForVision(
  buffer: Buffer,
  resolutionOverride?: ScanResolutionChoice
): Promise<{ base64: string; mime: string; stats: ScanCompressionStats }> {
  const originalMeta = await sharp(buffer).metadata();
  const { maxSize, quality, tier } = resolutionOverride ?? chooseScanResolution();
  const resized = await sharp(buffer)
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer({ resolveWithObject: true });
  return {
    base64: resized.data.toString("base64"),
    mime: "image/jpeg",
    stats: {
      originalWidthPx: originalMeta.width ?? null,
      originalHeightPx: originalMeta.height ?? null,
      originalBytes: buffer.length,
      sentWidthPx: resized.info.width ?? null,
      sentHeightPx: resized.info.height ?? null,
      sentBytes: resized.data.length,
      quotaTier: tier,
      maxSizeUsed: maxSize,
      qualityUsed: quality,
    },
  };
}

async function getImageBase64(doc: { fileType: string; fileUrl: string }): Promise<{ base64: string; mime: string; pageNote: string | null; stats: ScanCompressionStats }> {
  const filePath = path.join(process.cwd(), "public", doc.fileUrl);

  if (doc.fileType === "pdf") {
    const { pdf } = await import("pdf-to-img");
    // scale 1.5 (was 2.0) — the sharp resize below caps the final size anyway, so
    // rendering at 2.0 just meant more pixels to immediately throw away.
    const document = await pdf(filePath, { scale: 1.5 });
    let firstPage: Buffer | null = null;
    let pageCount = 0;
    for await (const image of document) {
      pageCount++;
      if (!firstPage) firstPage = image;
    }
    if (!firstPage) throw new Error("Lege PDF");
    const { base64, mime, stats } = await compressForVision(firstPage);
    return {
      base64,
      mime,
      pageNote: pageCount > 1 ? `Note: only page 1 of ${pageCount} was scanned.` : null,
      stats,
    };
  }

  const mime = MIME_BY_TYPE[doc.fileType];
  if (!mime) throw new Error(`File type .${doc.fileType} is not supported for recognition.`);
  const bytes = await readFile(filePath);
  const compressed = await compressForVision(bytes);
  return { base64: compressed.base64, mime: compressed.mime, pageNote: null, stats: compressed.stats };
}

// Last scan's before/after compression numbers (including which quota tier was
// used), kept in memory only (reset on deploy/restart) so the Admin diagnostic
// panel can show the effect of the progressive resolution logic (see
// chooseScanResolution in lib/ai.ts) without adding a DB table for it.
// Deliberately not persisted: this is an operational/debugging aid, not
// business data — lastScanStats itself is not touched by this change.
let lastScanStats: (ScanCompressionStats & { documentId: string; at: string }) | null = null;
export function getLastScanStats() {
  return lastScanStats;
}

// A document is considered "already scanned" when it already carries the core
// fields recognition would fill in — whether they got there via a previous AI
// scan or the accountant typed them by hand, either way there's nothing useful
// for Groq to add. In that case the endpoint returns the existing data straight
// from the database instead of calling Groq again — the rescan only happens
// when the caller explicitly asks for it via `force: true` (see PARTIE C: "un
// document déjà correctement scanné ne doit PAS être renvoyé automatiquement à
// Groq — le rescan doit être explicitement demandé").
function hasExistingScanData(doc: { supplierName: string | null; amount: number | null; totalAmount: number | null; documentDate: string | null }): boolean {
  return !!(doc.supplierName || doc.amount != null || doc.totalAmount != null || doc.documentDate);
}

export async function POST(request: Request) {
  // Vision calls are also token/cost-heavier than text ones, so this endpoint gets
  // its own (tighter) budget rather than sharing the general 20/min AI limit.
  const access = await requireAiAccess("ai.use", { limit: 10, windowMs: 60_000 }, "scan-purchase-document");
  if (!access.ok) return Response.json(access.body, { status: access.status });
  const { apiKey, userId, role } = access;

  const body = await request.json();
  const { purchaseDocumentId, force } = body;
  if (!purchaseDocumentId) {
    return Response.json({ error: "Document ID is required" }, { status: 400 });
  }

  const doc = await prisma.purchaseDocument.findUnique({ where: { id: purchaseDocumentId } });
  if (!doc) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  // Cache short-circuit — no Groq call, no in-flight lock needed (there's nothing
  // to de-duplicate against when we're not calling out at all).
  if (!force && hasExistingScanData(doc)) {
    logScan({ documentId: doc.id, userId, role, administrationId: doc.userId, status: "cache-hit" });
    return Response.json({
      purchaseDocumentId,
      supplierName: doc.supplierName,
      invoiceNumber: doc.invoiceNumber,
      documentDate: doc.documentDate,
      amount: doc.amount,
      vatAmount: doc.vatAmount,
      totalAmount: doc.totalAmount,
      vatType: doc.vatType,
      description: doc.description,
      confidence: "medium" as const,
      pageNote: null,
      fromCache: true,
      generatedAt: doc.updatedAt.toISOString(),
    });
  }

  // Everything below (file read + Groq call) is de-duplicated per document: a
  // double-click, two open tabs, or an accidental double-submit for the SAME
  // purchaseDocumentId share a single in-flight Groq call instead of firing two.
  //
  // The de-duplicated function returns plain { status, body } data rather than a
  // Response object — a Response's body is a stream that can only be consumed
  // once, so if two concurrent callers awaited the very same Response instance,
  // only one of them could actually send it. Each caller builds its own fresh
  // Response from the shared result instead.
  try {
    const result = await dedupeInFlight<{ status: number; body: Record<string, unknown> }>(`scan:${purchaseDocumentId}`, async () => {
      let base64: string, mime: string, pageNote: string | null;
      try {
        const parsedImage = await getImageBase64(doc);
        base64 = parsedImage.base64; mime = parsedImage.mime; pageNote = parsedImage.pageNote;
        lastScanStats = { ...parsedImage.stats, documentId: doc.id, at: new Date().toISOString() };
        logScan({
          documentId: doc.id, userId, role,
          originalPx: `${parsedImage.stats.originalWidthPx ?? "?"}x${parsedImage.stats.originalHeightPx ?? "?"}`,
          sentPx: `${parsedImage.stats.sentWidthPx ?? "?"}x${parsedImage.stats.sentHeightPx ?? "?"}`,
          originalKB: Math.round(parsedImage.stats.originalBytes / 1024),
          sentKB: Math.round(parsedImage.stats.sentBytes / 1024),
          status: "compressed",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read the file";
        return { status: 400, body: { error: message } };
      }

      const groqResult = await callGroq(
        apiKey,
        {
          model: GROQ_VISION_MODEL,
          max_completion_tokens: 500,
          // Field extraction from a document — the goal is the correct reading, not
          // variety, so keep this near-deterministic.
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are an assistant that reads purchase invoices/receipts for a bookkeeper.

Read this image and extract the following data. Use null for anything you cannot read with confidence — NEVER make up a value.

Return exactly this JSON format, no explanation:
{
  "supplierName": string | null,
  "invoiceNumber": string | null,
  "documentDate": string | null (format YYYY-MM-DD),
  "amount": number | null (amount excl. VAT),
  "vatAmount": number | null,
  "totalAmount": number | null (amount incl. VAT),
  "vatType": "high" | "low" | "zero" | "exempt" | null (21% = high, 9% = low),
  "description": string | null (short description of what was purchased),
  "confidence": "high" | "medium" | "low"
}`,
                },
                {
                  type: "image_url",
                  image_url: { url: `data:${mime};base64,${base64}` },
                },
              ],
            },
          ],
        },
        // Vision + strict JSON is the most failure-prone combination of every AI route here
        // (see json_validate_failed handling in callGroq) — one extra retry attempt over the
        // shared default (3 total instead of 2, the maximum allowed) meaningfully cuts the
        // odds of surfacing "could not format its answer" to the bookkeeper for what's
        // usually a one-off generation hiccup. Retries are still bounded by callGroq's own
        // "never retry a long 429 wait" rule, so this cannot turn into a burst against an
        // exhausted quota.
        { timeoutMs: 40_000, retries: 2 } // image analysis + potential PDF rasterization needs more headroom than a text call
      );

      if (!groqResult.ok) {
        logScan({
          documentId: doc.id, userId, role, administrationId: doc.userId,
          model: GROQ_VISION_MODEL, status: `error:${groqResult.code}`, httpStatus: groqResult.status,
        });
        return {
          status: groqResult.status,
          body: { error: groqResult.message, code: groqResult.code, retryAfterSeconds: groqResult.retryAfterSeconds },
        };
      }

      const raw = groqResult.data.choices?.[0]?.message?.content || "{}";
      const parsed = parseGroqJson<{
        supplierName?: string | null; invoiceNumber?: string | null; documentDate?: string | null;
        amount?: number | null; vatAmount?: number | null; totalAmount?: number | null;
        vatType?: string | null; description?: string | null; confidence?: string;
      }>(raw);
      if (!parsed) {
        logScan({ documentId: doc.id, userId, role, administrationId: doc.userId, model: GROQ_VISION_MODEL, status: "error:AI_INVALID_RESPONSE" });
        const code: AiErrorCode = "AI_INVALID_RESPONSE";
        return { status: 502, body: { error: "AI returned an invalid answer", code } };
      }

      logScan({
        documentId: doc.id, userId, role, administrationId: doc.userId,
        fileType: doc.fileType, fileSize: doc.fileSize, model: GROQ_VISION_MODEL, status: "success",
      });

      return {
        status: 200,
        body: {
          purchaseDocumentId,
          supplierName: parsed.supplierName || null,
          invoiceNumber: parsed.invoiceNumber || null,
          documentDate: parsed.documentDate || null,
          amount: typeof parsed.amount === "number" ? parsed.amount : null,
          vatAmount: typeof parsed.vatAmount === "number" ? parsed.vatAmount : null,
          totalAmount: typeof parsed.totalAmount === "number" ? parsed.totalAmount : null,
          vatType: parsed.vatType || null,
          description: parsed.description || null,
          confidence: parsed.confidence || "medium",
          pageNote,
          fromCache: false,
          generatedAt: new Date().toISOString(),
        },
      };
    });
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    // getImageBase64 already handles its own errors above; this covers anything
    // unexpected in the response-building step itself.
    const message = err instanceof Error ? err.message : "Unknown error";
    logScan({ documentId: doc.id, userId, role, administrationId: doc.userId, status: "error:AI_PROVIDER_ERROR" });
    const code: AiErrorCode = "AI_PROVIDER_ERROR";
    return Response.json({ error: `AI-fout: ${message}`, code }, { status: 500 });
  }
}
