import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  let user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, company: true, vatNumber: true, kvkNumber: true, phone: true, iban: true, bankName: true, accountHolder: true, logoUrl: true, legalForm: true, purchaseEmail: true, reminderEnabled: true, reminder1Days: true, reminder2Days: true, reminder3Days: true, quotationValidityDays: true, notificationPrefs: true },
  });

  // Auto-generate purchase email if not set
  if (user && !user.purchaseEmail) {
    const slug = (user.company || user.name || "customer").toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
    const purchaseEmail = `inkoop-${slug}-${user.id.substring(0, 6)}@hamzadeboekhouder.nl`;
    await prisma.user.update({ where: { id: session.userId }, data: { purchaseEmail } });
    user = { ...user, purchaseEmail };
  }

  return Response.json(user);
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const body = await request.json();
  const stringFields = ["name", "company", "phone", "vatNumber", "kvkNumber", "iBAN", "bankName", "accountHolder", "legalForm"];
  const intFields = ["reminder1Days", "reminder2Days", "reminder3Days", "quotationValidityDays"];
  const boolFields = ["reminderEnabled"];

  const data: Record<string, string | number | boolean | null> = {};
  for (const field of stringFields) {
    if (body[field] !== undefined) data[field] = body[field]?.trim() || null;
  }
  for (const field of intFields) {
    if (body[field] !== undefined) data[field] = parseInt(body[field], 10) || 7;
  }
  for (const field of boolFields) {
    if (body[field] !== undefined) data[field] = !!body[field];
  }
  if (body.notificationPrefs !== undefined && typeof body.notificationPrefs === "object" && body.notificationPrefs !== null) {
    data.notificationPrefs = JSON.stringify(body.notificationPrefs);
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data,
    select: { id: true, name: true, email: true, company: true, vatNumber: true, kvkNumber: true, phone: true, iban: true, bankName: true, accountHolder: true, logoUrl: true, legalForm: true, purchaseEmail: true, reminderEnabled: true, reminder1Days: true, reminder2Days: true, reminder3Days: true, quotationValidityDays: true, notificationPrefs: true },
  });

  return Response.json(user);
}
