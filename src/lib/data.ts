import { prisma } from "./prisma";

// Re-export Prisma types for backward compatibility
export type { User, InvoiceItem, Administration } from "@/generated/prisma/client";
import type { Invoice as PrismaInvoice, InvoiceItem as PrismaInvoiceItem } from "@/generated/prisma/client";

// Invoice with items included (as returned by API)
export type Invoice = PrismaInvoice & { items: PrismaInvoiceItem[]; customer?: { phone: string | null; email: string | null } | null };

// --- Types ---

export type UserRole = "client" | "bookkeeper";
export type LegalForm = "eenmanszaak" | "vof" | "bv" | "other";
export type VatObligation = "yes" | "no" | "unknown";
export type TaxType = "inkomstenbelasting" | "vennootschapsbelasting";

export interface ClientRegistration {
  companyName: string;
  kvkNumber: string;
  legalForm: LegalForm;
  contactName: string;
  phone: string;
  email: string;
  vatNumber: string;
  vatId: string;
  vatObligation: VatObligation;
  iban: string;
  bankName: string;
  accountHolder: string;
}

export interface FiscalSummary {
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
  taxEstimate?: TaxEstimate;
}

export interface TaxEstimate {
  taxType: TaxType;
  year: number;
  revenue: number;
  costs: number;
  profit: number;
  estimatedTax: number;
  breakdown: string[];
  assumption: string;
}

// --- User functions ---

export async function getUsers() {
  return prisma.user.findMany();
}

export async function getUser(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function getClients() {
  return prisma.user.findMany({ where: { role: "client" } });
}

export async function getUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } });
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

// --- Invoice functions ---

export async function getInvoicesByClient(clientId: string) {
  return prisma.invoice.findMany({
    where: { clientId },
    include: { items: true, customer: { select: { phone: true, email: true } }, _count: { select: { invoiceNotes: true } } },
  });
}

export async function getAllInvoices() {
  return prisma.invoice.findMany({ include: { items: true, customer: { select: { phone: true, email: true } }, _count: { select: { invoiceNotes: true } } }, orderBy: { createdAt: "desc" } });
}

export async function getInvoice(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: { items: true },
  });
}

export async function addInvoice(data: {
  clientId: string;
  customerId?: string | null;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  customerName: string;
  customerAddress: string;
  items: { description: string; quantity: number; unitPrice: number; vatRate: number }[];
  subtotal: number;
  vatAmount: number;
  total: number;
  status?: string;
  notes?: string;
  isCredit?: boolean;
  originalInvoiceId?: string | null;
}) {
  return prisma.invoice.create({
    data: {
      clientId: data.clientId,
      customerId: data.customerId || null,
      invoiceNumber: data.invoiceNumber,
      date: data.date,
      dueDate: data.dueDate,
      customerName: data.customerName,
      customerAddress: data.customerAddress,
      subtotal: data.subtotal,
      vatAmount: data.vatAmount,
      total: data.total,
      status: data.status || "draft",
      notes: data.notes,
      isCredit: data.isCredit || false,
      originalInvoiceId: data.originalInvoiceId || null,
      items: {
        create: data.items,
      },
    },
    include: { items: true },
  });
}

export async function updateInvoiceBookkeepingStatus(
  id: string,
  status: string,
  category?: string,
  vatType?: string
) {
  return prisma.invoice.update({
    where: { id },
    data: {
      bookkeepingStatus: status,
      ...(category && { category }),
      ...(vatType && { vatType }),
      ...(status === "booked" && { bookedAt: new Date() }),
      ...(status !== "booked" && { bookedAt: null }),
    },
    include: { items: true },
  }).catch(() => null);
}

export async function updateInvoiceStatus(id: string, status: string) {
  const data: Record<string, unknown> = { status };
  // When invoice is sent, mark it as "to_book" for the accountant
  if (status === "sent") {
    data.bookkeepingStatus = "to_book";
  }
  return prisma.invoice.update({
    where: { id },
    data,
    include: { items: true },
  }).catch(() => null);
}

// --- Fiscal summary ---

export async function getFiscalSummary(clientId: string): Promise<FiscalSummary> {
  const invoices = await getInvoicesByClient(clientId);
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const today = now.toISOString().split("T")[0];

  // Auto-detect overdue
  for (const inv of invoices) {
    if (inv.status === "sent" && inv.dueDate < today) {
      await prisma.invoice.update({ where: { id: inv.id }, data: { status: "overdue" } });
      inv.status = "overdue";
    }
  }

  const nonCredit = invoices.filter((i) => !i.isCredit);
  const outstanding = nonCredit.filter((i) => i.status === "sent" || i.status === "partial" || i.status === "overdue");
  const overdue = nonCredit.filter((i) => i.status === "overdue");

  // Payments this month
  const payments = await prisma.payment.findMany({
    where: { invoice: { clientId } },
  });
  const paidThisMonth = payments
    .filter((p) => { const d = new Date(p.date); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; })
    .reduce((sum, p) => sum + p.amount, 0);

  // Expected income: sent invoices due this month
  const expected = nonCredit
    .filter((i) => (i.status === "sent" || i.status === "partial") && new Date(i.dueDate).getMonth() === thisMonth && new Date(i.dueDate).getFullYear() === thisYear)
    .reduce((sum, i) => sum + Math.abs(i.total) - i.paidAmount, 0);

  return {
    totalRevenue: nonCredit.reduce((sum, i) => sum + i.subtotal, 0),
    totalVatCollected: nonCredit.reduce((sum, i) => sum + i.vatAmount, 0),
    totalVatDeductible: 0,
    vatToPay: nonCredit.reduce((sum, i) => sum + i.vatAmount, 0),
    invoiceCount: invoices.length,
    paidCount: nonCredit.filter((i) => i.status === "paid").length,
    overdueCount: overdue.length,
    totalOutstanding: outstanding.reduce((sum, i) => sum + Math.abs(i.total) - i.paidAmount, 0),
    totalOverdue: overdue.reduce((sum, i) => sum + Math.abs(i.total) - i.paidAmount, 0),
    paidThisMonth,
    expectedIncome: expected,
  };
}

// --- Tax estimate (income tax / corporate tax) ---
//
// A simplified, best-effort estimate — not a substitute for a real
// aangifte. Uses the 2026 Dutch brackets published by the Belastingdienst.
// Assumes the "urencriterium" is met (so zelfstandigenaftrek applies) and
// does not account for heffingskortingen, FOR, KIA or other personal
// deductions — those need an accountant's input, not a formula.
export async function getTaxEstimate(clientId: string): Promise<TaxEstimate> {
  const user = await prisma.user.findUnique({ where: { id: clientId }, select: { legalForm: true } });
  const taxType = determineTaxType(user?.legalForm || "eenmanszaak");
  const year = new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const invoices = await prisma.invoice.findMany({
    where: { clientId, isCredit: false, date: { gte: start, lte: end } },
    select: { subtotal: true },
  });
  const revenue = invoices.reduce((sum, i) => sum + i.subtotal, 0);

  const purchases = await prisma.purchaseDocument.findMany({
    where: { userId: clientId, documentDate: { gte: start, lte: end } },
    select: { amount: true, totalAmount: true },
  });
  const costs = purchases.reduce((sum, p) => sum + (p.amount ?? p.totalAmount ?? 0), 0);

  const profit = Math.max(0, revenue - costs);
  const breakdown: string[] = [
    `Omzet ${year} (excl. btw): €${Math.round(revenue).toLocaleString("nl-NL")}`,
    `Kosten ${year} (excl. btw): €${Math.round(costs).toLocaleString("nl-NL")}`,
    `Winst: €${Math.round(profit).toLocaleString("nl-NL")}`,
  ];

  let estimatedTax = 0;

  if (taxType === "vennootschapsbelasting") {
    if (profit <= 200000) {
      estimatedTax = profit * 0.19;
      breakdown.push(`Vpb 19% over de winst: €${Math.round(estimatedTax).toLocaleString("nl-NL")}`);
    } else {
      const base = 200000 * 0.19;
      const rest = (profit - 200000) * 0.258;
      estimatedTax = base + rest;
      breakdown.push(`Vpb: 19% tot €200.000 (€${Math.round(base).toLocaleString("nl-NL")}) + 25,8% daarboven (€${Math.round(rest).toLocaleString("nl-NL")})`);
    }
  } else {
    const zelfstandigenaftrek = 1200; // 2026 tarief, aanname: urencriterium gehaald
    const afterOndernemersaftrek = Math.max(0, profit - zelfstandigenaftrek);
    const mkbVrijstelling = afterOndernemersaftrek * 0.127; // 2026: 12,7%
    const taxableIncome = afterOndernemersaftrek - mkbVrijstelling;
    breakdown.push(
      `Zelfstandigenaftrek: -€${zelfstandigenaftrek.toLocaleString("nl-NL")}`,
      `Mkb-winstvrijstelling (12,7%): -€${Math.round(mkbVrijstelling).toLocaleString("nl-NL")}`,
      `Belastbaar inkomen box 1: €${Math.round(taxableIncome).toLocaleString("nl-NL")}`
    );

    const brackets = [
      { upTo: 38883, rate: 0.357 },
      { upTo: 79137, rate: 0.3756 },
      { upTo: Infinity, rate: 0.495 },
    ];
    let remaining = taxableIncome;
    let prevCap = 0;
    for (const b of brackets) {
      if (remaining <= 0) break;
      const bracketSize = b.upTo - prevCap;
      const taxableInBracket = Math.min(remaining, bracketSize);
      estimatedTax += taxableInBracket * b.rate;
      remaining -= taxableInBracket;
      prevCap = b.upTo;
    }
    breakdown.push(`Inkomstenbelasting box 1 (schijven 2026): €${Math.round(estimatedTax).toLocaleString("nl-NL")}`);
  }

  return {
    taxType,
    year,
    revenue,
    costs,
    profit,
    estimatedTax: Math.round(estimatedTax),
    breakdown,
    assumption: "Ruwe schatting op basis van de omzet en kosten die al in de boekhouding staan. Geen rekening gehouden met heffingskortingen, FOR of andere persoonlijke aftrekposten — controleer met de accountant.",
  };
}

// --- Registration ---

function determineTaxType(legalForm: string): TaxType {
  if (legalForm === "bv") return "vennootschapsbelasting";
  return "inkomstenbelasting";
}

export async function registerClient(
  data: ClientRegistration,
  username: string,
  passwordHash: string
) {
  const user = await prisma.user.create({
    data: {
      name: data.contactName,
      email: data.email,
      role: "client",
      company: data.companyName,
      vatNumber: data.vatNumber,
      kvkNumber: data.kvkNumber,
      username,
      passwordHash,
      isNew: true,
      emailVerified: false,
      phone: data.phone,
      vatId: data.vatId,
      vatObligation: data.vatObligation,
      iban: data.iban,
      bankName: data.bankName,
      accountHolder: data.accountHolder,
      legalForm: data.legalForm,
    },
  });

  const administration = await prisma.administration.create({
    data: {
      clientId: user.id,
      taxType: determineTaxType(data.legalForm),
    },
  });

  return { user, administration };
}

export async function getAdministrationByClient(clientId: string) {
  return prisma.administration.findFirst({ where: { clientId } });
}

// --- User updates ---

export async function verifyUserEmail(userId: string): Promise<boolean> {
  const result = await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: true },
  }).catch(() => null);
  return !!result;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<boolean> {
  const result = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  }).catch(() => null);
  return !!result;
}
