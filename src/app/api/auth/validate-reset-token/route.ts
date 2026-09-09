import { validateResetToken } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return Response.json({ valid: false, error: "Token is required" }, { status: 400 });
  }

  const result = await validateResetToken(token);
  return Response.json(result);
}
