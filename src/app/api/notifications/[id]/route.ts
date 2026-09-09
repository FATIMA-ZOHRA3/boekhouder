import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // This previously read a cookie literally named "session", which the
  // rest of the app doesn't set (see src/lib/auth.ts — the real cookie is
  // "boekhouder_session"), so this route 401'd unconditionally. Swapped
  // for the shared getSession() helper every other route already uses.
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: {
      ...(body.isRead !== undefined && { isRead: body.isRead, readAt: body.isRead ? new Date() : null }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.notification.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
