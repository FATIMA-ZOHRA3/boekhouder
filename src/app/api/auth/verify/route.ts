import { consumeVerificationToken } from "@/lib/auth";
import { verifyUserEmail } from "@/lib/data";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return Response.json({ error: "Token is required" }, { status: 400 });
  }

  const result = await consumeVerificationToken(token);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  await verifyUserEmail(result.userId);

  return Response.json({ success: true });
}
