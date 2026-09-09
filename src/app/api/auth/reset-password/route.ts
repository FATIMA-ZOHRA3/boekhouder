import { consumeResetToken, hashPassword, checkPasswordStrength } from "@/lib/auth";
import { updateUserPassword } from "@/lib/data";

export async function POST(request: Request) {
  const { token, password } = await request.json();

  if (!token || !password) {
    return Response.json({ error: "Token and password are required" }, { status: 400 });
  }

  const strength = checkPasswordStrength(password);
  if (!strength.isValid) {
    return Response.json({ error: "Password does not meet the requirements" }, { status: 400 });
  }

  const result = await consumeResetToken(token);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  await updateUserPassword(result.userId, passwordHash);

  return Response.json({ success: true });
}
