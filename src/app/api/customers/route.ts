import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Staff clientId scoping added for the new bookkeeper Customers list
// (RELATIONSHIPS > Customers) — this route previously always scoped to
// session.userId, so a bookkeeper had no way to list a client's customers
// (only /api/customers/[id]/financial-profile existed, added earlier for
// the same reason — see that file's comment). Mirrors the isStaff-bypass
// pattern already used by GET /api/purchases/all, /api/bank/transactions
// and /api/fiscal; client-role behaviour is unchanged.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const isStaff = session.role === "bookkeeper" || session.role === "admin";
  const requestedClientId = new URL(request.url).searchParams.get("clientId");
  const effectiveUserId = isStaff && requestedClientId ? requestedClientId : session.userId;

  const customers = await prisma.customer.findMany({
    where: { userId: effectiveUserId },
    orderBy: { name: "asc" },
  });

  return Response.json(customers);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const body = await request.json();
  const { name, email, phone, address, vatNumber, paymentTermValue, paymentTermUnit, defaultDescription, defaultUnitPrice, defaultVatRate, kvkNumber, legalForm, sbiCode, sbiDescription, city, postalCode } = body;

  if (!name || !name.trim()) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const customer = await prisma.customer.create({
    data: {
      userId: session.userId,
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      vatNumber: vatNumber?.trim() || null,
      paymentTermValue: paymentTermValue || null,
      paymentTermUnit: paymentTermUnit || null,
      defaultDescription: defaultDescription || null,
      defaultUnitPrice: defaultUnitPrice || null,
      defaultVatRate: defaultVatRate ?? null,
      kvkNumber: kvkNumber?.trim() || null,
      legalForm: legalForm?.trim() || null,
      sbiCode: sbiCode?.trim() || null,
      sbiDescription: sbiDescription?.trim() || null,
      city: city?.trim() || null,
      postalCode: postalCode?.trim() || null,
    },
  });

  return Response.json(customer);
}
