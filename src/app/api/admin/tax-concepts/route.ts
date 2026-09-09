import { getSession } from "@/lib/auth";
import { requirePermissionWithUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getSession();
  const check = await requirePermissionWithUser(session, "admin.tax-concepts.manage");
  if (!check.ok) return null;
  return check.user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "No access" }, { status: 403 });
  const concepts = await prisma.taxConcept.findMany({ orderBy: [{ category: "asc" }, { label: "asc" }] });
  return Response.json(concepts);
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "No access" }, { status: 403 });

  const body = await request.json();
  const { key, label, groundingFact, category } = body;
  if (!key || !label || !groundingFact) {
    return Response.json({ error: "Key, label and fact are required" }, { status: 400 });
  }

  try {
    const created = await prisma.taxConcept.create({
      data: { key, label, groundingFact, category: category || "vAT" },
    });
    return Response.json(created);
  } catch {
    return Response.json({ error: "This key already exists" }, { status: 400 });
  }
}
