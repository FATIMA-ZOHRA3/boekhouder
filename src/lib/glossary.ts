// Task #12: centralized glossary behind the <TermTooltip> component. Adding a term here
// makes it explainable anywhere in the app — wrap the jargon word with
// <TermTooltip term="lettering">Lettering</TermTooltip> and it gets a plain-language
// definition on hover/tap, no other wiring needed.
//
// This is static, human-written content (not AI-generated) — the same "no invented facts"
// principle as task #5's grounding table, just simpler since there's no AI involved here at
// all. Keep definitions short (1-2 sentences) and jargon-free themselves.
//
// Deployment is intentionally progressive (per the product vision doc) — not every jargon
// word in the app has been wrapped yet. Add more <TermTooltip> usages page by page as they
// come up, using the terms already defined here or adding a new one.
export const GLOSSARY: Record<string, string> = {
  lettering: "Linking a payment to its corresponding invoice, so the system knows that invoice has been settled.",
  afletteren: "Linking a payment to its corresponding invoice, so the system knows that invoice has been settled.",
  boekingsregel: "A single line in an entry that indicates which general ledger account an amount is booked to.",
  grootboekrekening: "A category in the bookkeeping under which income or expenses are classified, for example 'Revenue' or 'Office expenses'.",
  grootboek: "The overview of all general ledger accounts of a company and the amounts booked to them.",
  debiteursaldo: "The total amount customers still owe you on open invoices.",
  crediteursaldo: "The total amount you still owe suppliers on open purchase invoices.",
  creditfactuur: "A correction invoice that fully or partially reverses an earlier invoice, for example in the case of a return.",
  memoriaal: "An entry that doesn't come from an invoice or bank, but is entered manually, for example for corrections.",
  bookkeepingStatus: "Indicates whether an invoice still needs to be processed by the bookkeeper (to book) or is already done (booked).",
};

export type GlossaryTermKey = keyof typeof GLOSSARY;
