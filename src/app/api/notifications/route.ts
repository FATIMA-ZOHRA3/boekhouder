import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// The accountant-wide (top-right) notification center is global: one feed
// across every administration, with each item labeled by the administration
// it belongs to (spec §3/§4).
//
// Per-module notifications (sidebar badges / hover popups) are NOT served
// by this route — they're computed client-side in bookkeeper/layout.tsx
// from the already-scoped invoice/purchase collections.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isStaff = me.role === "bookkeeper" || me.role === "admin";

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const where: Record<string, unknown> = { userId: me.id };
  if (unreadOnly) where.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      skip: offset,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, isRead: false } }),
  ]);

  // Staff-only enrichment: attach the source administration to each
  // notification so the global bell can render "Demo BV — Factuur booked"
  // without every bookkeeper having to reconstruct the link client-side.
  if (isStaff && notifications.length > 0) {
    const invoiceIds = notifications.filter((n) => n.sourceType === "invoice" && n.sourceId).map((n) => n.sourceId as string);
    const purchaseIds = notifications.filter((n) => n.sourceType === "purchase_doc" && n.sourceId).map((n) => n.sourceId as string);

    const [invoices, purchases] = await Promise.all([
      invoiceIds.length > 0
        ? prisma.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, clientId: true, client: { select: { id: true, company: true, name: true } } } })
        : Promise.resolve([]),
      purchaseIds.length > 0
        ? prisma.purchaseDocument.findMany({ where: { id: { in: purchaseIds } }, select: { id: true, userId: true, user: { select: { id: true, company: true, name: true } } } })
        : Promise.resolve([]),
    ]);

    const invById = new Map(invoices.map((i) => [i.id, i.client]));
    const purById = new Map(purchases.map((p) => [p.id, p.user]));

    const enriched = notifications.map((n) => {
      let admin: { id: string; company: string | null; name: string } | null = null;
      if (n.sourceType === "invoice" && n.sourceId) admin = invById.get(n.sourceId) || null;
      else if (n.sourceType === "purchase_doc" && n.sourceId) admin = purById.get(n.sourceId) || null;
      return { ...n, administration: admin };
    });
    return NextResponse.json({ notifications: enriched, total, unreadCount });
  }

  return NextResponse.json({ notifications, total, unreadCount });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.userId;

  const body = await request.json();
  const { type, category, title, message, priority, actionUrl, actionLabel, sourceType, sourceId, metadata, targetUserId } = body;

  if (!type || !category || !title || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const notification = await prisma.notification.create({
    data: {
      userId: targetUserId || userId,
      type,
      category,
      title,
      message,
      priority: priority || 0,
      actionUrl: actionUrl || null,
      actionLabel: actionLabel || null,
      sourceType: sourceType || null,
      sourceId: sourceId || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  return NextResponse.json(notification);
}
