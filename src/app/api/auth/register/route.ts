import { registerClient, getUserByUsername, getUserByEmail } from "@/lib/data";
import type { ClientRegistration } from "@/lib/data";
import { hashPassword, checkPasswordStrength, createVerificationToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json();
  const { registration, username, password } = body as {
    registration: ClientRegistration;
    username: string;
    password: string;
  };

  if (!registration || !username || !password) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const strength = checkPasswordStrength(password);
  if (!strength.isValid) {
    return Response.json({ error: "Password does not meet the requirements" }, { status: 400 });
  }

  if (await getUserByUsername(username)) {
    return Response.json({ error: "Username is already in use" }, { status: 409 });
  }

  if (await getUserByEmail(registration.email)) {
    return Response.json({ error: "E-mailadres is al geregistreerd" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const { user, administration } = await registerClient(registration, username, passwordHash);

  const verificationToken = await createVerificationToken(user.id);
  await sendVerificationEmail(registration.email, registration.contactName, verificationToken);

  return Response.json({
    success: true,
    userId: user.id,
    administrationId: administration.id,
    verificationRequired: true,
  });
}
