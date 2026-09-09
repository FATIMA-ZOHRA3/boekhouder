import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, userId: session.userId },
  });

  if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });
  return Response.json(customer);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, userId: session.userId },
  });
  if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

  const body = await request.json();
  const { name, email, phone, address, vatNumber, paymentTermValue, paymentTermUnit, defaultDescription, defaultUnitPrice, defaultVatRate, kvkNumber, legalForm, sbiCode, sbiDescription, city, postalCode, accountantAccess } = body;

  if (name !== undefined && (!name || !name.trim())) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const updated = await prisma.customer.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(email !== undefined && { email: email?.trim() || null }),
      ...(phone !== undefined && { phone: phone?.trim() || null }),
      ...(address !== undefined && { address: address?.trim() || null }),
      ...(vatNumber !== undefined && { vatNumber: vatNumber?.trim() || null }),
      ...(paymentTermValue !== undefined && { paymentTermValue: paymentTermValue || null }),
      ...(paymentTermUnit !== undefined && { paymentTermUnit: paymentTermUnit || null }),
      ...(defaultDescription !== undefined && { defaultDescription: defaultDescription || null }),
      ...(defaultUnitPrice !== undefined && { defaultUnitPrice: defaultUnitPrice || null }),
      ...(defaultVatRate !== undefined && { defaultVatRate: defaultVatRate ?? null }),
      ...(kvkNumber !== undefined && { kvkNumber: kvkNumber?.trim() || null }),
      ...(legalForm !== undefined && { legalForm: legalForm?.trim() || null }),
      ...(sbiCode !== undefined && { sbiCode: sbiCode?.trim() || null }),
      ...(sbiDescription !== undefined && { sbiDescription: sbiDescription?.trim() || null }),
      ...(city !== undefined && { city: city?.trim() || null }),
      ...(postalCode !== undefined && { postalCode: postalCode?.trim() || null }),
      ...(accountantAccess !== undefined && { accountantAccess }),
    },
  });

  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const customer = await prisma.customer.findFirst({
    where: { id, userId: session.userId },
  });
  if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

  await prisma.customer.delete({ where: { id } });
  return Response.json({ success: true });
}
