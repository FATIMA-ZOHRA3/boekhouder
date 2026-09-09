import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Was previously unauthenticated. PATCH/DELETE also never checked that the
// note belonged to the invoice in the URL (or to an invoice the caller could
// access) — they updated/deleted by noteId alone. Fixed alongside the auth
// gap, same reasoning as quotations/[id]/notes.
async function requireOwnedInvoice(id: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) } as const;
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) } as const;
  const isStaff = me.role === "bookkeeper" || me.role === "admin";
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { id: true, clientId: true } });
  if (!invoice || (!isStaff && invoice.clientId !== me.id)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { ok: true } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await requireOwnedInvoice(id);
  if ("error" in check) return check.error;
  const notes = await prisma.invoiceNote.findMany({
    where: { invoiceId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(notes);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await requireOwnedInvoice(id);
  if ("error" in check) return check.error;
  const body = await request.json();
  if (!body.text?.trim()) {
    return NextResponse.json({ error: "Note may not be empty" }, { status: 400 });
  }
  const note = await prisma.invoiceNote.create({
    data: { invoiceId: id, text: body.text.trim() },
  });
  return NextResponse.json(note);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await requireOwnedInvoice(id);
  if ("error" in check) return check.error;
  const body = await request.json();
  const { noteId, text } = body;
  if (!noteId || !text?.trim()) {
    return NextResponse.json({ error: "Note ID and text are required" }, { status: 400 });
  }
  const existing = await prisma.invoiceNote.findUnique({ where: { id: noteId } });
  if (!existing || existing.invoiceId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const note = await prisma.invoiceNote.update({
    where: { id: noteId },
    data: { text: text.trim() },
  });
  return NextResponse.json(note);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await requireOwnedInvoice(id);
  if ("error" in check) return check.error;
  const body = await request.json();
  if (!body.noteId) return NextResponse.json({ error: "Note ID is required" }, { status: 400 });
  const existing = await prisma.invoiceNote.findUnique({ where: { id: body.noteId } });
  if (!existing || existing.invoiceId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.invoiceNote.delete({ where: { id: body.noteId } });
  return NextResponse.json({ success: true });
}
