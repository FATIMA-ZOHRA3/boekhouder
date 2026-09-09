// Mirrors src/lib/auth.ts Role on the backend. Kept as a small hand-copied
// type rather than a shared package — see mobile/README.md ("Types") for
// why a cross-package types refactor was deliberately skipped for now.
export type Role = "client" | "bookkeeper" | "admin";

export type AuthUser = {
  id: string;
  name: string;
  role: Role;
  company: string | null;
};

// Mirrors the Invoice + InvoiceItem Prisma models (prisma/schema.prisma).
export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  category: string | null;
  vatCode: string | null;
};

export type Invoice = {
  id: string;
  clientId: string;
  customerId: string | null;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  customerName: string;
  customerAddress: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  paidAmount: number;
  status: string; // draft, sent, paid, overdue, ... (whatever the backend sets)
  bookkeepingStatus: string; // pending, to_book, booked
  notes: string | null;
  isCredit: boolean;
  createdAt: string;
  items: InvoiceItem[];
};

// Mirrors the PurchaseDocument Prisma model, as returned by GET /api/purchases.
export type PurchaseDocument = {
  id: string;
  userId: string;
  fileName: string;
  fileUrl: string;
  fileType: string; // "pdf" | "jpg" | "png"
  status: string; // uploaded, processing, booked
  label: string | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  amount: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  documentDate: string | null;
  category: string | null;
  createdAt: string;
  // Only populated when fetched via a staff-only route (GET
  // /api/purchases/all or GET /api/purchases/[id] as staff) — see
  // src/app/api/purchases/[id]/route.ts's getDoc(). Absent on the
  // client's own GET /api/purchases.
  user?: { id: string; name: string; company: string | null; email: string };
};

// Mirrors the response shape of POST /api/ai/scan-purchase-document.
export type PurchaseScanResult = {
  purchaseDocumentId: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  documentDate: string | null;
  amount: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  vatType: string | null;
  description: string | null;
  confidence: "high" | "medium" | "low";
  pageNote: string | null;
  // true when this came back from the server's cache (the document already had
  // scanned/filled-in data) instead of a fresh Groq call — see scanPurchaseDocument().
  fromCache: boolean;
  generatedAt: string;
};

// Structured error codes shared by every /api/ai/* route (see src/lib/ai.ts on
// the backend) — lets the UI branch on a stable value instead of parsing text.
export type AiErrorCode =
  | "AI_RATE_LIMIT"
  | "AI_TIMEOUT"
  | "AI_PROVIDER_ERROR"
  | "AI_INVALID_RESPONSE"
  | "AI_NOT_CONFIGURED";

// Mirrors the Customer Prisma model (only the fields the mobile app shows/edits).
export type Customer = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  vatNumber: string | null;
  city: string | null;
  postalCode: string | null;
  paymentTermValue: number | null;
  paymentTermUnit: string | null; // "days" | "weeks" | "months"
  defaultVatRate: number | null;
};

// Mirrors the BankTransaction Prisma model. Staff-only (bank.read is a
// STAFF_PERMISSIONS-only permission in src/lib/permissions.ts) — client
// accounts don't have a Bank tab in the mobile app, matching the backend.
export type BankTransaction = {
  id: string;
  userId: string;
  bankAccount: string | null;
  transactionDate: string;
  amount: number;
  direction: "debit" | "credit";
  description: string;
  counterparty: string | null;
  status: string; // new, processing, matched, reconciled
  createdAt: string;
  // Only populated for staff (GET /api/bank/transactions always includes
  // it server-side — see src/app/api/bank/transactions/route.ts).
  user?: { id: string; name: string; company: string | null };
};

// Mirrors the User Prisma model, trimmed to the fields the mobile app's
// Clients (bookkeeper) and Profile screens actually use — deliberately
// NOT the full row GET /api/clients returns (see src/app/api/clients/route.ts),
// which includes internal fields like passwordHash the app never reads.
export type ClientSummary = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  vatNumber: string | null;
  kvkNumber: string | null;
  city?: string | null;
};

// Mirrors the Notification Prisma model.
export type AppNotification = {
  id: string;
  userId: string;
  type: string;
  category: string;
  title: string;
  message: string;
  priority: number;
  isRead: boolean;
  actionUrl: string | null;
  actionLabel: string | null;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
};

// Mirrors ExceptionItem (src/lib/exceptionSeverity.ts / prisma/schema.prisma),
// enriched server-side with `amount` and `severity` — see GET
// /api/exceptions's own header comment for why those two fields aren't on
// the Prisma model itself.
export type ExceptionItem = {
  id: string;
  userId: string;
  createdByUserId: string;
  type: string;
  title: string;
  description: string;
  status: string; // open, responded, resolved
  invoiceId: string | null;
  purchaseDocId: string | null;
  bankTransactionId: string | null;
  customerResponse: string | null;
  customerNotes: string | null;
  customerFileUrl: string | null;
  customerFileName: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  amount: number | null;
  severity: "critical" | "high" | "medium" | "low";
  user: { id: string; name: string; company: string | null; email: string };
  createdBy: { id: string; name: string };
};

// Mirrors FiscalSummary / TaxEstimate (src/lib/data.ts), as returned by
// GET /api/fiscal (?clientId= for staff).
export type TaxEstimate = {
  taxType: "ib" | "vpb" | string;
  year: number;
  revenue: number;
  costs: number;
  profit: number;
  estimatedTax: number;
  breakdown: string[];
  assumption: string;
};

export type FiscalSummary = {
  totalRevenue: number;
  totalVatCollected: number;
  totalVatDeductible: number;
  vatToPay: number;
  invoiceCount: number;
  paidCount: number;
  overdueCount: number;
  totalOutstanding: number;
  totalOverdue: number;
  paidThisMonth: number;
  expectedIncome: number;
  taxEstimate: TaxEstimate;
};

// Mirrors the Quotation + QuotationItem Prisma models (prisma/schema.prisma).
// Same shape as Invoice/InvoiceItem — the backend deliberately keeps these
// two resources structurally parallel (see src/app/api/quotations/route.ts).
export type QuotationItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};

export type Quotation = {
  id: string;
  clientId: string;
  customerId: string | null;
  quotationNumber: string;
  date: string;
  validUntil: string;
  customerName: string;
  customerAddress: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  status: string; // draft, sent, accepted, converted, expired, ...
  notes: string | null;
  convertedInvoiceId: string | null;
  createdAt: string;
  items: QuotationItem[];
};

// Mirrors the RecurringInvoice Prisma model, as returned by
// GET /api/recurring-invoices (always scoped to the caller — see that
// route's header comment). `customer` is only the sliver the list needs.
export type RecurringInvoice = {
  id: string;
  clientId: string;
  customerId: string;
  interval: string; // weekly, monthly, quarterly, yearly
  intervalDays: number | null;
  nextDate: string;
  templateData: string; // JSON string — { items: [...] }, parsed client-side
  autoSend: boolean;
  active: boolean;
  customer: { name: string };
};

// Mirrors the Task Prisma model (prisma/schema.prisma), as returned by
// GET /api/tasks. `date`/`time` are plain strings, matching how the web
// bookkeeper Tasks page and src/app/api/tasks/route.ts treat them.
export type Task = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  date: string; // YYYY-MM-DD
  time: string | null;
  category: string | null;
  completed: boolean;
  completedAt: string | null;
  assignedTo: string | null;
  createdByUserId: string;
  sourceType: string;
  sourceId: string | null;
  conversationId: string | null;
};

// ---------------------------------------------------------------------------
// AI integration phase — Financial Insights, Suggest Category, Draft Reply,
// Summarize Conversation, Summarize Task, Explain Tax Concept.
// Every shape below mirrors an existing backend response 1:1 (see the
// matching /api/ai/* route referenced in each comment) — mobile only
// displays what the backend already computed, per the "backend is the
// source of truth" rule for this phase.
// ---------------------------------------------------------------------------

// Mirrors src/lib/aiInsights.ts (InsightPeriod/FinancialInsight) as
// returned by GET /api/ai/financial-insights.
export type InsightPeriod = "today" | "this_week" | "this_month" | "last_month" | "this_quarter" | "this_year" | "custom";
export type InsightCategory = "performance" | "cash_flow" | "invoices" | "expenses" | "banking" | "accounting";
export type InsightPriority = "critical" | "high" | "medium" | "low" | "informational";
export type InsightStatus = "new" | "reviewed" | "dismissed";

export type InsightWhy = { label: string; value: string };

export type FinancialInsight = {
  id: string;
  category: InsightCategory;
  priority: InsightPriority;
  icon: string;
  title: string;
  summary: string;
  whyItMatters: string;
  whatToConsider: string;
  why: InsightWhy[];
  metricLabel: string | null;
  cta: { label: string; href: string } | null;
  aiEnhanced: boolean;
  confidence: "High" | "Medium" | "Low";
  status?: InsightStatus;
};

export type FinancialInsightsResponse = {
  period: { label: string; start: string; end: string; prevStart: string; prevEnd: string };
  insights: FinancialInsight[];
  aiAvailable: boolean;
};

// Mirrors POST /api/ai/suggest-category's response.
export type CategorySuggestion = {
  accountNumber: string;
  accountName: string;
  ledgerAccount: string;
  defaultVatCode: { code: string; name: string; percentage: number } | null;
  reasoning: string;
  // true when this came back from the server's cache (same invoice/description
  // already categorized) instead of a fresh Groq call — see suggestCategory().
  fromCache: boolean;
  generatedAt: string;
};

// Mirrors POST /api/ai/draft-reply's response.
export type DraftReplyResult = {
  draft: string;
  model: string;
  conversationId: string;
  generatedAt: string;
};

// Mirrors POST /api/ai/summarize-conversation's response.
export type ConversationSummary = {
  summary: string;
  openQuestion: string | null;
  messageCount: number;
  conversationId: string;
  generatedAt: string;
};

// Mirrors POST /api/ai/summarize-task's response.
export type TaskSummary = {
  title: string;
  description: string;
};

// Mirrors POST /api/ai/explain-tax-concept's response.
export type TaxConceptExplanation = {
  concept: string;
  label: string;
  explanation: string;
  disclaimer: string;
  generatedAt: string;
};

// Mirrors the Conversation + Message Prisma models (prisma/schema.prisma),
// as returned by GET /api/conversations, GET /api/conversations/[id] and
// POST /api/conversations/[id]/messages.
export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderRole: "client" | "bookkeeper";
  text: string;
  createdAt: string;
  sender?: { id: string; name: string; role: Role };
};

export type Conversation = {
  id: string;
  userId: string;
  subject: string;
  lastMessage: string | null;
  lastAt: string;
  unreadByUser: boolean;
  unreadByAccountant: boolean;
  contextType: string | null;
  contextId: string | null;
  createdAt: string;
  user: { id: string; name: string; company: string | null };
  messages?: ConversationMessage[];
};

// Mirrors GET /api/audit-logs's response (src/app/api/audit-logs/route.ts,
// entity list from src/lib/auditActivity.ts's AuditEntity union). This
// route is staff-only server-side (requireRole(["bookkeeper","admin"])) —
// there is no client-visible activity log anywhere in the backend, so
// mobile never builds an entry point to this for the client role.
export type AuditEntity =
  | "Invoice"
  | "Quotation"
  | "PurchaseDocument"
  | "BankTransaction"
  | "CashTransaction"
  | "ExceptionItem"
  | "JournalEntry"
  | "Customer"
  | "User"
  | "LedgerAccount"
  | "VatCode"
  | "RecurringInvoice"
  | "SystemSetting";

export type AuditLogItem = {
  id: string;
  createdAt: string;
  entity: AuditEntity;
  action: string;
  entityId: string;
  description: string;
  actorName: string;
  amountLabel: string | null;
  href: string | null;
};

export type AuditLogResponse = {
  items: AuditLogItem[];
  nextCursor: string | null;
  hasMore: boolean;
  clientId: string | null;
  availableEntities: AuditEntity[];
  availableActions: string[];
};

// Mirrors POST /api/ai/voice-invoice/parse-item's response — see the
// backend route for the exact contract. Kept separate from InvoiceItem
// (no `id`/`category`/`vatCode` yet — those only exist once the invoice
// is actually saved).
export type VoiceInvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};

export type VoiceInvoiceParseResult = {
  items: VoiceInvoiceItem[];
  spoken_confirmation?: string;
  clarification_needed?: string | null;
  done?: boolean;
};

// Aliases matching the terminology used in the mobile Voice Invoice screen
// (app/(tabs)/invoices/voice-invoice.tsx) — same shapes as above, just the
// names that screen's own code/comments use.
export type VoiceInvoiceResponse = VoiceInvoiceParseResult;
export type ParsedVoiceInvoice = VoiceInvoiceItem;

// Editable draft state for the Voice Invoice review step — never sent to
// the backend as-is; createInvoice() (services/invoices.ts) maps this
// into the plain POST /api/invoices body.
export type InvoiceLineDraft = {
  // Stable per-line key for React list rendering / edits — never sent to
  // the backend (POST /api/invoices takes plain description/quantity/
  // unitPrice/vatRate per line, no id).
  key: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};

export type InvoiceDraft = {
  customerId: string | null;
  customerName: string;
  customerAddress: string;
  date: string;
  dueDate: string;
  notes: string;
  items: InvoiceLineDraft[];
};

// Chat turn for the AI Assistant screen. Mirrors the shape POST
// /api/ai/assistant accepts/returns — see services/ai.ts.
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  // Set on a message that failed to send, so the UI can offer a retry
  // instead of silently dropping it.
  failed?: boolean;
  // Client-side send/receive time (ISO string), purely for the small
  // timestamp shown under each bubble — never sent to the backend.
  createdAt?: string;
};
