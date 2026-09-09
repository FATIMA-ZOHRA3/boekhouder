import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "vat.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";
  const active = searchParams.get("active");

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (active === "true") where.isActive = true;
  if (active === "false") where.isActive = false;

  const vatCodes = await prisma.vatCode.findMany({
    where,
    orderBy: [{ type: "asc" }, { code: "asc" }],
    include: { ledgerAccount: true },
  });

  return Response.json(vatCodes);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "vat.manage");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  const body = await request.json();
  const { code, name, description, percentage, type, rubricCode, ledgerAccountId } = body;

  if (!code || !name || percentage === undefined || !type) {
    return Response.json({ error: "Required fields are missing" }, { status: 400 });
  }

  if (!["sales", "purchase"].includes(type)) {
    return Response.json({ error: "Type must be 'sales' or 'purchase'" }, { status: 400 });
  }

  const existing = await prisma.vatCode.findUnique({ where: { code } });
  if (existing) {
    return Response.json({ error: "VAT code already exists" }, { status: 400 });
  }

  const vatCode = await prisma.vatCode.create({
    data: {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description?.trim() || null,
      percentage: parseFloat(percentage),
      type,
      rubricCode: rubricCode || null,
      ledgerAccountId: ledgerAccountId || null,
      isSystem: false,
    },
    include: { ledgerAccount: true },
  });

  return Response.json(vatCode);
}
