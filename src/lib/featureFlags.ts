// Central place to toggle UI for features that are not fully built yet.
// Flip a flag to `false` to hide the corresponding "Coming soon" placeholder
// entirely instead of showing it. Defaults to `true` (current behavior:
// show translated placeholders) so this file is a no-op until you decide
// otherwise for each area.
export const FEATURES = {
  // Direct bank connection cards on the client & bookkeeper dashboards
  // (client/page.tsx "Bank connection" card, bookkeeper "Bank connections"
  // settings tile).
  bankSync: true,
  // Estimated corporate/income tax calculation cards on the client dashboard.
  taxEstimates: true,
  // Generic "future module" stub cards rendered by <ModuleShell> and the
  // bookkeeper settings tiles (Booking rules, AI settings, etc.).
  moduleStubs: true,
} as const;
