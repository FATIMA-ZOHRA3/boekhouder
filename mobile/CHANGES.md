# Voice Invoice — full audit + state-machine rebuild

Full audit + rebuild of Client → Invoices → Create Invoice → Voice, per a
dedicated spec asking the mobile version to match the web app's real
mechanism exactly rather than a simplified workaround.

## Audit findings (web = source of truth)
- Web's implementation lives in `src/components/VoiceInvoiceAssistant.tsx`
  (mounted only from `src/app/client/invoices/new/page.tsx` — client
  portal only, no bookkeeper entry point exists on web either).
- Speech-to-text is 100% client-side in the browser: `window
  .SpeechRecognition` / `window.webkitSpeechRecognition` (the Web Speech
  API). Text-to-speech prompts use `window.speechSynthesis`. **No audio is
  ever uploaded to the backend** — confirmed by reading both the
  component and every `/api/ai/*` route; there is no audio/transcription
  endpoint anywhere in the API.
- The ONLY backend AI call in the whole flow is
  `POST /api/ai/voice-invoice/parse-item` (client-only permission
  `ai.voice-invoice.use`), used exclusively to turn one sentence about
  line items into structured `{description, quantity, unitPrice,
  vatRate}`. Customer matching, dates and totals are deterministic logic
  on the web side (`src/lib/customerMatch.ts` + plain arithmetic) — never
  sent through the AI. Mobile reuses this exact endpoint, unchanged.

## What changed
- Rewrote `app/(tabs)/invoices/voice-invoice.tsx` as an explicit state
  machine — `collect → review → creating → success/error` — with a real
  big-mic-button idle/recording/processing sub-flow, replacing the
  previous single long scrolling form.
- **On Expo Web**, the mic button drives the genuine
  `window.SpeechRecognition` API — the identical mechanism the web app
  uses, not an approximation (feature-detected the same way the web
  component does).
- **On iOS/Android** (Expo Go, no native speech module), the same staging
  falls back to the device keyboard's own dictation (its mic key) typing
  into a text field — a real platform limitation, not a shortcut; adding
  a native speech-to-text dependency was judged out of scope again this
  phase, consistent with every earlier phase's constraint.
- Review stage now shows and allows editing every field the spec asked
  for: customer (via "Change"), invoice date, due date, notes, and full
  per-line editing (description/qty/unit price/VAT, add line, remove
  line) with live-recalculated subtotal/VAT/total.
- Added explicit client-side validation before `createInvoice()` is ever
  called (customer present, ≥1 line, non-empty description, quantity >
  0, price ≥ 0, VAT 0–100, both dates present) — mirrors the web form's
  minimum requirements; nothing is submitted from raw, unreviewed AI
  output.
- Added a double-submit guard (`submittingRef`) around invoice creation
  for the "double-tap Create Invoice" case.
- `services/api.ts`: `ApiError` now also carries `method`/`url`, and a
  failed request logs `[API] METHOD /path -> STATUS <body>` in dev — so a
  failing `/api/ai/voice-invoice/parse-item` or `/api/invoices` call
  surfaces its real backend message/status instead of being flattened
  into a generic "Connection lost" (that message is now reserved for an
  actual network failure).
- `types/api.ts`: added `InvoiceDraft` / `InvoiceLineDraft` (the review
  step's editable local state) and `VoiceInvoiceResponse` /
  `ParsedVoiceInvoice` aliases matching the spec's naming, without
  renaming the pre-existing `VoiceInvoiceParseResult` / `VoiceInvoiceItem`
  types other files already depend on.

## NOT changed
- `services/invoices.ts` (`createInvoice`) and `services/ai.ts`
  (`parseVoiceInvoiceItem`) — already matched the backend contract
  exactly from the prior phase; no backend or contract changes were
  needed or made.
- No Web UI or backend route touched.
- No native speech-to-text dependency added (see above).
- No multi-currency support — the web app itself doesn't have one, so
  there's nothing to mirror.

## Tested
- `npx tsc --noEmit` — 0 errors, whole project.
- NOT tested: an actual on-device run (no Expo runtime / phone / Groq API
  key available in this environment) — the flows above are verified by
  code review and type-checking only, not a live walkthrough of the 7
  spec test cases. Flagged explicitly rather than claimed as verified.

---



Extends the staff (bookkeeper/admin) role, reachable from the Accounting
hub. All three are read-only, computed client-side from data the app
already fetches elsewhere (GET /api/invoices, GET /api/purchases/all,
GET /api/quotations, all unscoped = every client, same convention as the
rest of the Accounting hub) — mirroring how the web bookkeeper pages for
these three derive them, since none of the three has a dedicated backend
resource (no Report/Supplier model; Documents is a combined view).

## New files
- app/reports/ (index.tsx) — invoice aging buckets + top expense categories
- app/suppliers/ (index.tsx) — purchase documents grouped by supplierName
- app/documents/ (index.tsx) — combined purchases/invoices/quotations list with kind filter

## Modified files
- app/(tabs)/accounting/index.tsx — added Reports/Suppliers/Documents hub cards

## NOT changed
- Nothing under /src or /prisma.
- Ledger/journal/VAT-code management (double-entry bookkeeping UI) — not
  attempted this pass; the existing web app's grand livre/journal/VAT
  screens are genuinely complex CRUD and were judged too large to safely
  build without a dedicated pass. Messaging, Audit, and AI Insights are
  also still outstanding, per the prompt's bookkeeper checklist.

---

# Phase 6 changes — client-side feature parity: Quotations, Recurring invoices, Tasks

Extends the client role only (per the mobile-parity prompt), reachable from
Profile alongside Customers/Tax & VAT/Exceptions. Read-only for Quotations
(list + detail + PDF, same pattern as Invoices); Recurring invoices get a
toggle-active switch and delete (no create form yet — see that screen's
header comment); Tasks get a checkbox to mark complete.

## New files
- services/quotations.ts, services/recurring.ts, services/tasks.ts
- app/quotations/ (index.tsx, [id].tsx)
- app/recurring/ (index.tsx)
- app/tasks/ (index.tsx)

## Modified files
- types/api.ts — added Quotation, QuotationItem, RecurringInvoice, Task
- app/(tabs)/profile.tsx — added client-only Quotations/Recurring invoices/Tasks links

## NOT changed
- Nothing under /src or /prisma (the Next.js web app and backend).
- Bookkeeper-side screens for these resources (comptabilité avancée,
  rapports, fournisseurs, documents, messagerie, audit, insights IA,
  admin) — out of scope for this pass, next up per the prompt.

---

# Phase 5 changes — scan/upload fix + role-aware navigation

See mobile/README.md's new "Phase 5" section for the full writeup. Quick
file-level summary of what changed vs. the version this was built from:

## New files
- lib/fileType.ts — MIME/type normalization for the scanner (PART 1)
- services/clients.ts, services/exceptions.ts, services/fiscal.ts
- app/(tabs)/clients/ (_layout.tsx, index.tsx, [id].tsx)
- app/(tabs)/accounting/ (_layout.tsx, index.tsx)
- app/exceptions/ (index.tsx, [id].tsx)
- app/fiscal/ (index.tsx)

## Modified files
- app/(tabs)/_layout.tsx — role-aware tab bar
- app/(tabs)/index.tsx — split into ClientHome / StaffHome
- app/(tabs)/profile.tsx — removed dead staff Customers/Bank links, added client Tax & Exceptions links
- app/(tabs)/purchases/scan.tsx — real MIME detection + PDF picker (PART 1)
- app/(tabs)/purchases/index.tsx, [id].tsx — staff cross-client view via GET /api/purchases/all
- app/(tabs)/invoices/index.tsx — optional clientId scoping, client label for staff
- app/bank/index.tsx — optional clientId/status params
- app/customers/index.tsx — optional clientId param
- services/purchases.ts, invoices.ts, bank.ts, customers.ts — clientId/status params, getAllPurchases(), userId upload param
- services/api.ts — one pre-existing TS strict-mode nit fixed (String(message))
- types/api.ts — PurchaseDocument.user, BankTransaction.user, ClientSummary, ExceptionItem, FiscalSummary, TaxEstimate
- package.json — added expo-document-picker

## NOT changed
- Nothing under /src or /prisma (the Next.js web app and backend) — verified
  with a full recursive diff against the original upload.

## Verified
- `cd mobile && npx tsc --noEmit` → 0 errors (ran with a fresh `npm install`).
