import { getSession } from "@/lib/auth";
import { requirePermissionWithUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getSession();
  const check = await requirePermissionWithUser(session, "admin.tax-concepts.manage");
  if (!check.ok) return null;
  return check.user;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "No access" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { label, groundingFact, category, isActive } = body;

  const data: Record<string, unknown> = {};
  if (label !== undefined) data.label = label;
  if (groundingFact !== undefined) data.groundingFact = groundingFact;
  if (category !== undefined) data.category = category;
  if (isActive !== undefined) data.isActive = isActive;

  const updated = await prisma.taxConcept.update({ where: { id }, data });
  return Response.json(updated);
}
