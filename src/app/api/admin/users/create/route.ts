import { getSession, hashPassword, checkPasswordStrength } from "@/lib/auth";
import { requirePermissionWithUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getSession();
  const check = await requirePermissionWithUser(session, "admin.users.manage");
  if (!check.ok) return null;
  return check.user;
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "No access" }, { status: 403 });

  const body = await request.json();
  const { name, email, role, password, company, kvkNumber, legalForm, phone } = body;

  if (!name || !email || !role || !password) {
    return Response.json({ error: "Name, email, role and password are required" }, { status: 400 });
  }

  if (!["client", "bookkeeper", "admin"].includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }

  const strength = checkPasswordStrength(password);
  if (!strength.isValid) {
    return Response.json({ error: "Password must contain at least 8 characters, 1 uppercase letter and 1 digit" }, { status: 400 });
  }

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "This email address is already in use" }, { status: 409 });
  }

  // Check if username already exists
  const existingUsername = await prisma.user.findUnique({ where: { username: email } });
  if (existingUsername) {
    return Response.json({ error: "This username is already in use" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      username: email,
      passwordHash,
      emailVerified: true, // Admin-created accounts are pre-verified
      isNew: role === "client",
      company: company || null,
      kvkNumber: kvkNumber || null,
      legalForm: legalForm || null,
      phone: phone || null,
    },
  });

  // Create administration for clients
  if (role === "client" && legalForm) {
    const taxType = legalForm === "bv" ? "vennootschapsbelasting" : "inkomstenbelasting";
    await prisma.administration.create({
      data: { clientId: user.id, taxType },
    });
  }

  return Response.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}
