import { getSession } from "@/lib/auth";
import { requirePermissionWithUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getSession();
  const check = await requirePermissionWithUser(session, "admin.users.manage");
  if (!check.ok) return null;
  return check.user;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "No access" }, { status: 403 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    include: { administrations: true },
  });

  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  return Response.json(user);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "No access" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  // Only allow updating specific fields
  const allowedFields: Record<string, unknown> = {};
  if (typeof body.emailVerified === "boolean") allowedFields.emailVerified = body.emailVerified;
  if (typeof body.isNew === "boolean") allowedFields.isNew = body.isNew;
  if (typeof body.role === "string" && ["client", "bookkeeper", "admin"].includes(body.role)) {
    allowedFields.role = body.role;
  }

  if (Object.keys(allowedFields).length === 0) {
    return Response.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: allowedFields,
  }).catch(() => null);

  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  return Response.json(user);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "No access" }, { status: 403 });

  const { id } = await params;

  // Don't allow deleting yourself
  if (id === admin.id) {
    return Response.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  // Delete related data first
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.verificationToken.deleteMany({ where: { userId: id } });
  await prisma.resetToken.deleteMany({ where: { userId: id } });
  await prisma.invoiceItem.deleteMany({
    where: { invoice: { clientId: id } },
  });
  await prisma.invoice.deleteMany({ where: { clientId: id } });
  await prisma.administration.deleteMany({ where: { clientId: id } });

  const user = await prisma.user.delete({ where: { id } }).catch(() => null);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  return Response.json({ success: true });
}
