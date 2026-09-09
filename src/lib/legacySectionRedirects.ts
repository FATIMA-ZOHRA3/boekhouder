// ---------------------------------------------------------------------------
// The old shell exposed every module as /bookkeeper?section=X. Now that
// each module has a real path, this map lets any old bookmark or link
// still land in the right place instead of silently showing the Home
// dashboard with an ignored query string.
// ---------------------------------------------------------------------------
export const LEGACY_SECTION_REDIRECTS: Record<string, string> = {
  administraties: "/bookkeeper/administration",
  dashboard: "/bookkeeper",
  sales: "/bookkeeper/sales",
  verkoop: "/bookkeeper/sales",
  purchases: "/bookkeeper/purchases",
  inkoop: "/bookkeeper/purchases",
  bank: "/bookkeeper/banking",
  afletteren: "/bookkeeper/banking",
  kas: "/bookkeeper/cash",
  memoriaal: "/bookkeeper/accounting",
  boekingen: "/bookkeeper/accounting",
  "general ledger": "/bookkeeper/accounting",
  grootboek: "/bookkeeper/accounting",
  taken: "/bookkeeper/tasks",
  agenda: "/bookkeeper/tasks",
  exceptions: "/bookkeeper/exceptions",
  berichten: "/bookkeeper/messages",
  fiscaal: "/bookkeeper/taxes",
  settings: "/bookkeeper/settings",
  instellingen: "/bookkeeper/settings",
};
