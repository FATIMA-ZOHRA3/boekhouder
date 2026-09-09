import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST() {
  // Same fix as notifications/[id]/route.ts — this read a nonexistent
  // "session" cookie instead of the app's actual "boekhouder_session" one.
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.notification.updateMany({
    where: { userId: session.userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
