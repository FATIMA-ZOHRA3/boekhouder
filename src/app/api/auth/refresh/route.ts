import { refreshSession } from "@/lib/auth";

export async function POST() {
  const session = await refreshSession();
  if (!session) {
    return Response.json({ error: "No active session" }, { status: 401 });
  }
  return Response.json({ success: true });
}
