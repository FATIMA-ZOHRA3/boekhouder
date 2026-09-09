import { NextResponse } from "next/server";

// Shared-secret gate for internal/system endpoints that have no human caller
// (scheduled batch jobs) and therefore don't fit the role-based Permission
// model in permissions.ts — see the header comment that used to live in
// reminders/process/route.ts, which first identified this gap during the
// Pilier 2 audit and recommended exactly this fix.
//
// Fails CLOSED: if CRON_SECRET isn't configured, every request is rejected
// (503) rather than silently accepted. That's a deliberate choice — an
// unset secret must never be equivalent to "no auth required". This does
// mean these two routes stop responding to calls (including your real
// scheduler) until CRON_SECRET is set in the environment — see .env.example.
export function requireCronSecret(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  const provided = request.headers.get("x-cron-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return null;
}
