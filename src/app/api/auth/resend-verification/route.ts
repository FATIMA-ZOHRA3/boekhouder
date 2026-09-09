import { getUserByEmail } from "@/lib/data";
import { createVerificationToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email) {
    return Response.json({ error: "Email address is required" }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return Response.json({ success: true });
  }

  if (user.emailVerified) {
    return Response.json({ error: "This account is already verified" }, { status: 400 });
  }

  const token = await createVerificationToken(user.id);
  await sendVerificationEmail(email, user.name, token);

  return Response.json({ success: true });
}
