# Boekhouder — Mobile (React Native + Expo)

Companion mobile app for the existing Boekhouder web application. It talks
to the **same backend and the same PostgreSQL/Prisma database** as the web
app — there is no second database and no duplicated business logic here.

## Status: Phase 4 (Business features) complete

Phase 1 — Foundation:
- Expo + TypeScript + Expo Router
- Design system (`constants/theme.ts`) reusing the web app's navy/glacier-blue palette
- Centralized API client (`services/api.ts`)
- Authentication wired to the real `/api/auth/login` and `/api/auth/logout`
- Session persisted with `expo-secure-store`, protected navigation (`app/_layout.tsx`)
- Bottom tab navigation, **role-aware since Phase 5** (see below): Home, Invoices,
  Purchases, Alerts, Profile for a client account; Home, Clients, Accounting, Alerts,
  Profile for bookkeeper/admin.

Phase 2 — Core:
- **Home dashboard**: outstanding balance + overdue count (computed client-side by
  summing the `total`/`paidAmount`/`status` fields the backend already returns —
  no accounting logic reimplemented on-device) and a merged recent-activity feed
  from `GET /api/invoices` + `GET /api/purchases`. Loading, error (with retry) and
  empty states, pull-to-refresh.
- **Invoices**: list (`app/(tabs)/invoices/index.tsx`) with client-side search over
  customer name / invoice number, status badges, pull-to-refresh; detail screen
  (`.../invoices/[id].tsx`) with line items, totals and a "View PDF" button that
  opens `GET /api/invoices/[id]/pdf?download=1` in the system viewer.
- **Profile**: real data from `GET /api/profile`, logout.

Phase 3 — Mobile power features:
- **Purchases list** (`.../purchases/index.tsx`): own uploads via `GET /api/purchases`,
  with a floating camera button.
- **Camera scanner** (`.../purchases/scan.tsx`): capture with `expo-camera` or pick
  from the library with `expo-image-picker` → preview → retake → confirm → upload via
  `POST /api/purchases/upload` (same endpoint the web upload dialog posts to) → lands
  on the new document's detail screen.
- **Document detail + AI recognition** (`.../purchases/[id].tsx`): preview (image
  inline, PDF opened externally), metadata, and — **staff accounts only**
  (bookkeeper/admin) — a "Recognize with AI" button calling the existing
  `POST /api/ai/scan-purchase-document`. The extracted fields are shown as an
  **editable draft** the accountant can correct before a "Confirm & save" button
  PATCHes them to `PATCH /api/purchases/[id]` — the same "AI proposes, accountant
  reviews, accountant confirms, backend saves" contract the web app follows.
  Client accounts don't see this section: `scan-purchase-document` requires the
  `ai.use` permission, which only bookkeeper/admin have server-side
  (`src/lib/permissions.ts`) — a client calling it would get a 403, so the button
  is hidden rather than shown-and-failing. The role used for this check is cached
  locally at login (`services/api.ts` / `useAuth`), display-only — the backend
  still re-checks the real role on every request.

Phase 4 — Business features:
- **Customers** (`app/customers/index.tsx`): list with search, from `GET /api/customers`.
  Reachable from the Profile screen for a client account (their own customers), or
  from a Client detail screen for staff (`?clientId=`) — see Phase 5.
- **Bank** (`app/bank/index.tsx`): read-only recent-transactions feed from
  `GET /api/bank/transactions`, **staff accounts only**. `bank.read` isn't in the
  client role's permission set at all (`src/lib/permissions.ts` — this app's real
  roles don't match the task brief's illustrative "client sees Bank" example), so
  the screen is only reachable by bookkeeper/admin, via the Accounting tab or a
  Client detail screen (see Phase 5), and double-checks before querying. No
  amounts are recomputed — every field displayed is exactly what the backend stored.
- **Notifications**: real data from `GET /api/notifications` (unread count, mark
  one or all as read, tap-through to the related invoice/purchase). This uncovered
  and fixed a real backend bug (see below).

**Backend fix (Phase 4)**: `PATCH/DELETE /api/notifications/[id]` and
`POST /api/notifications/mark-all-read` were reading a cookie literally named
`"session"`, which nothing in the app ever sets — the real cookie, set by
`createSession()`, is `"boekhouder_session"`. Both routes always 401'd, on web
and would have on mobile too. Swapped both for the shared `getSession()` helper
every other route already uses (the same one with the Phase 1 Bearer-token
fallback), which fixes "mark as read" for the web app too, not just mobile.

Not yet implemented: push notifications (Expo Notifications), AI assistant chat,
customer/purchase create-edit forms. See the phase plan below.

## Phase 5 — Document scan fix + role-aware navigation

Two problems were fixed here, at their root cause rather than patched over —
see each changed file's own header comment for the detail; this is the summary.

**1. Scan/upload rejecting valid images.** `purchases/scan.tsx` hardcoded
`type: "image/jpeg"` on every camera capture *and* every gallery pick instead
of reading what Expo actually reports on the asset (`asset.mimeType`), and had
no way to pick a PDF at all despite the backend accepting one. Fixed with a
single shared helper, `lib/fileType.ts`'s `normalizeAsset()`, used by every
capture path: it detects the real MIME type in priority order
(`asset.mimeType` → extension on `asset.fileName` → extension in the URI →
a capture-appropriate fallback) and always keeps the file's name extension and
MIME type in agreement, instead of assuming. A PDF path was added via
`expo-document-picker` (new dependency). No backend change was needed — the
existing `ALLOWED_TYPES` check in `src/app/api/purchases/upload/route.ts` was
already correct; the client was just sending it bad data.

**2. Client and bookkeeper had nearly identical navigation.** The bottom tabs
were the same 5 items for every role, and the Home dashboard called
`getInvoices()` (all clients' invoices for a staff session — meaningless as
"my outstanding balance") and `getPurchases()` (always scoped to the caller's
own uploads — near-empty for a bookkeeper). Fixed by making the tab bar
role-aware (`app/(tabs)/_layout.tsx`, using expo-router's `href: null` to hide
a tab from the bar while keeping the route reachable via `router.push`) and
wiring in backend endpoints that already existed but weren't used by mobile:
`GET /api/clients` (new **Clients** tab — the bookkeeper's portfolio, list +
detail), `GET /api/purchases/all` (new **Accounting** tab's purchase queue,
staff-only), `GET /api/bank/transactions` (unmatched-transaction count),
`GET /api/exceptions` (open-exception count, plus a client-facing respond
screen at `app/exceptions/`), and `GET /api/fiscal` (a `Fiscal / VAT` screen
at `app/fiscal/`, reused for both a client's own "Tax & VAT" profile link and
a bookkeeper's per-client view). `invoices/`, `purchases/`, `bank/` and
`customers/` all now accept an optional `clientId`, used when a staff member
drills into one client from the Clients tab — unscoped, staff get the full
cross-client view instead. No backend route needed to change; every
permission check involved already existed in `src/lib/permissions.ts`.

Known pre-existing issue, out of scope for this fix: `GET /api/clients`
returns full `User` rows (including `passwordHash`) to any bookkeeper/admin
caller — same as it already does for the web app. The mobile app never reads
that field (`services/clients.ts` picks out only the fields it uses), but the
route itself sending it is worth a follow-up since it's shared with the web
UI and this fix intentionally didn't touch it.

## Setup

```bash
cd mobile
npm install
cp .env.example .env
```

Edit `.env` and set `EXPO_PUBLIC_API_URL` to your backend's address:

- **Physical phone**: your computer's LAN IP, e.g. `http://192.168.1.50:3000`
  (a phone cannot reach your computer's `localhost`). Your phone and
  computer must be on the same Wi-Fi network.
- **iOS Simulator**: `http://localhost:3000` works directly.
- **Android Emulator**: use `http://10.0.2.2:3000` instead of `localhost`.

Then, with the backend already running (`npm run dev` at the project
root), start the mobile app:

```bash
npx expo start
```

Press `a` for Android, `i` for iOS, or scan the QR code with Expo Go.

## Why a Bearer token instead of the web app's cookie?

The web app authenticates via an `httpOnly` session cookie
(`boekhouder_session`), which a native app can't read or persist across
restarts the way a browser does. Rather than build a second auth system,
`POST /api/auth/login` was given one small additive field: it now also
returns the raw session id in the JSON body. This app stores that id in
`expo-secure-store` and sends it as `Authorization: Bearer <sessionId>`.

The backend change (`src/lib/auth.ts`) is a single fallback check — if a
request has no session cookie, it looks for that header instead — added
once in the shared `getSession()`/`refreshSession()`/`destroySession()`
helpers. None of the ~90 existing API routes had to change, and the
existing web app's cookie flow is untouched.

## Project structure

```text
mobile/
├── app/            # Expo Router screens
│   ├── (auth)/      login
│   ├── (tabs)/      home, invoices/, purchases/ (client role); home, clients/, accounting/ (staff role); notifications, profile (shared)
│   ├── bank/        staff-only, optional ?clientId=
│   ├── customers/   optional ?clientId= for staff
│   ├── fiscal/      optional ?clientId= for staff
│   ├── exceptions/  list + [id] respond
│   └── assistant/   AI chat
├── components/      shared UI primitives (Card, PrimaryButton, ...)
├── services/        typed functions per backend resource — api.ts, auth.ts, invoices.ts, purchases.ts, clients.ts, exceptions.ts, fiscal.ts
├── hooks/           useAuth (session state)
├── lib/             format.ts (currency/date/status helpers), fileType.ts (asset MIME normalization)
├── constants/       theme.ts (design tokens)
└── types/           API response types (Invoice, InvoiceItem, PurchaseDocument, ClientSummary, ExceptionItem, ...)
```

## Types

The backend's Prisma-generated types weren't imported directly to avoid
coupling the mobile app's build to the web app's Prisma client version.
`types/api.ts` hand-copies the small `Role` type instead. If this becomes
painful once more resources are added, extracting a `packages/types`
shared between web and mobile is a reasonable follow-up — deliberately not
done in Phase 1 to keep this change isolated, per the "don't touch what
isn't necessary" rule for the existing web app.
