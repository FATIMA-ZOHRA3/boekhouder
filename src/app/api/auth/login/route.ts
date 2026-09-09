import { getUserByUsername } from "@/lib/data";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 });
  }

  const user = await getUserByUsername(username);
  if (!user || !user.passwordHash) {
    return Response.json({ error: "Invalid username or password" }, { status: 401 });
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "Invalid username or password" }, { status: 401 });
  }

  if (!user.emailVerified) {
    return Response.json({
      error: "Verify your email address first before you can log in",
      emailNotVerified: true,
      email: user.email,
    }, { status: 403 });
  }

  const session = await createSession(user.id);

  return Response.json({
    success: true,
    user: { id: user.id, name: user.name, role: user.role, company: user.company },
    // Additive field, ignored by the existing web client (which relies on the
    // httpOnly cookie set above). The mobile app has no access to that cookie,
    // so it stores this raw session id instead and sends it back as
    // `Authorization: Bearer <sessionId>` — see src/lib/auth.ts.
    sessionId: session.id,
  });
}
