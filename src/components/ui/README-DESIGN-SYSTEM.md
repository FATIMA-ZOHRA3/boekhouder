# FinTech Design System — status & usage

Introduced to give the accountant portal one consistent "premium FinTech SaaS"
visual identity (deep navy + professional blue primary accent, large rounded
cards, subtle shadows, sparklines on KPIs) instead of each page inventing its
own look. Violet/purple is reserved for AI-related highlights only.

## What's here

- `Card.tsx` — `Card`, `PageHeader`, `EmptyState`, `ErrorState`, `SkeletonLine`, `SkeletonCard`
- `KpiCard.tsx` — `KpiCard` (with optional real-data `Sparkline`)
- `Badge.tsx` — `Badge` (semantic tones), `Button` (primary/secondary/ghost)

All are presentational only — no data fetching, no business logic. They take
props and render; every page keeps its own state, hooks, and API calls
exactly as before.

## Design tokens (src/app/globals.css)

Added **on top of** the existing `--color-brand-*` tokens, not replacing
them — see the comment in `globals.css`. New tokens:

- `--color-primary` (blue-600, `#2563EB`) — the primary accent for
  buttons, links, active nav states, focus rings. `--color-brand-primary`
  (`#1B2559`, deep navy) remains the sidebar/dark-surface color.
- `--color-accent-2` (violet-600) — for AI-related highlights/gradients.
- Semantic status colors (red/amber/emerald/blue) are **unchanged** — they
  carry meaning (critical/warning/success/info) independently of brand, so
  they were left alone everywhere, including in this new system's `Badge`
  and `KpiCard` tone props.

## Migration status

Applied to (redesigned with these primitives):
- Sidebar & header shell (`app/bookkeeper/layout.tsx`)
- Dashboard (`app/bookkeeper/page.tsx`, `section=dashboard` block only)
- Control Center (`app/bookkeeper/control-center/` + its subcomponents)
- AI Insights (`app/bookkeeper/ai-insights/` + its subcomponents)
- Global Search results (`components/search/SearchResultsView.tsx`)
- Activity & Audit Timeline (`app/bookkeeper/activity/`)
- Customer Financial Profile (`app/bookkeeper/customers/[id]/`)

**Not yet migrated to the `<Card>`/`<KpiCard>` primitives** (structure left
exactly as-is): the rest of `app/bookkeeper/page.tsx` (Invoices/Sales list —
"debiteurenbeheer", Purchases, Banking, Accounting / memoriaal sections), the
invoice detail page, and the client-portal pages. These weren't touched in
this pass because they live inside the ~6,500-line `bookkeeper/page.tsx`
monolith or are large standalone pages, and a careful migration of each
deserves its own reviewed pass rather than a rushed mechanical find-and-replace
across the whole file in one go. Reusing these same primitives there is the
natural next step. Their *colors* were brought in line with the navy/blue
palette during the 2026 color refresh (a handful of leftover teal hover
states — `#008FA8`, `#003845`, `#009AB5` — were also caught and fixed), even
though the components themselves still predate `<Card>`/`<KpiCard>`.

## Conventions for new/migrated code

- Wrap content blocks in `<Card>` instead of repeating
  `bg-white rounded-xl shadow-sm border border-gray-100 p-5`.
- Use `<PageHeader title=… subtitle=… actions=…>` instead of a hand-rolled
  `<h1>`/`<p>` pair.
- Use `<KpiCard>` for headline numbers; pass `sparklineData` only when real
  historical values are available (never fabricate a trend line).
- Use `<EmptyState>` / `<ErrorState>` for the "nothing here" / "retry"
  moments instead of a bespoke SVG + text block per page.
- Keep semantic status colors (red/amber/emerald/blue) for meaning; use
  indigo only for brand/primary actions and active states.
