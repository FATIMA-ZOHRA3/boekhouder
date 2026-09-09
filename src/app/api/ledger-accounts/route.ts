import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "ledger.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const type = searchParams.get("type") || "";
  const active = searchParams.get("active");

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { accountNumber: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }
  if (type) where.accountType = type;
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;

  const accounts = await prisma.ledgerAccount.findMany({
    where,
    orderBy: { sortOrder: "asc" },
    include: { defaultVatCode: true },
  });

  return Response.json(accounts);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "ledger.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const body = await request.json();
  const { accountNumber, name, description, accountType, category, statementSection, normalBalance, isBalanceSheet, vatCodeId, sortOrder } = body;

  if (!accountNumber || !name || !accountType || !category || !normalBalance) {
    return Response.json({ error: "Required fields are missing" }, { status: 400 });
  }

  if (!/^\d{4}$/.test(accountNumber)) {
    return Response.json({ error: "Account number must be 4 digits" }, { status: 400 });
  }

  const validTypes = ["asset", "liability", "equity", "revenue", "expense", "contra"];
  if (!validTypes.includes(accountType)) {
    return Response.json({ error: "Invalid account type" }, { status: 400 });
  }

  if (!["debit", "credit"].includes(normalBalance)) {
    return Response.json({ error: "Invalid normal balance" }, { status: 400 });
  }

  const existing = await prisma.ledgerAccount.findUnique({ where: { accountNumber } });
  if (existing) {
    return Response.json({ error: "Account number already exists" }, { status: 400 });
  }

  const account = await prisma.ledgerAccount.create({
    data: {
      accountNumber,
      name: name.trim(),
      description: description?.trim() || null,
      accountType,
      category: category.trim(),
      statementSection: statementSection?.trim() || null,
      normalBalance,
      isBalanceSheet: isBalanceSheet ?? false,
      vatCodeId: vatCodeId || null,
      sortOrder: sortOrder ?? parseInt(accountNumber, 10),
      isSystem: false,
    },
    include: { defaultVatCode: true },
  });

  return Response.json(account);
}
