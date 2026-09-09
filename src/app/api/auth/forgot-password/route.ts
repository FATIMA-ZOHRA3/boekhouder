import { getUserByEmail } from "@/lib/data";
import { createResetToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return Response.json({ error: "Email address is required" }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (user) {
    const token = await createResetToken(user.id);
    await sendPasswordResetEmail(email, user.name, token);
  }

  return Response.json({ success: true });
}
