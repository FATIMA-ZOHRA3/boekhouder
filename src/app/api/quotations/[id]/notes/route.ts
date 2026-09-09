import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Was previously unauthenticated. DELETE also never checked that the note
// actually belonged to the quotation in the URL (or even to a quotation the
// caller could access) — it deleted by noteId alone. Fixed alongside the
// auth gap since both are the same "who is allowed to touch this note".
async function requireOwnedQuotation(id: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Not logged in" }, { status: 401 }) } as const;
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true } });
  if (!me) return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) } as const;
  const isStaff = me.role === "bookkeeper" || me.role === "admin";
  const q = await prisma.quotation.findUnique({ where: { id }, select: { id: true, clientId: true } });
  if (!q || (!isStaff && q.clientId !== me.id)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { ok: true } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await requireOwnedQuotation(id);
  if ("error" in check) return check.error;
  const notes = await prisma.quotationNote.findMany({ where: { quotationId: id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(notes);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await requireOwnedQuotation(id);
  if ("error" in check) return check.error;
  const body = await request.json();
  if (!body.text?.trim()) return NextResponse.json({ error: "Text is required" }, { status: 400 });
  const note = await prisma.quotationNote.create({ data: { quotationId: id, text: body.text.trim() } });
  return NextResponse.json(note);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await requireOwnedQuotation(id);
  if ("error" in check) return check.error;
  const body = await request.json();
  if (!body.noteId) return NextResponse.json({ error: "ID is required" }, { status: 400 });
  // Confirm the note actually belongs to *this* quotation before deleting —
  // otherwise an owner of quotation A could delete a note on quotation B by
  // passing its noteId while calling A's endpoint.
  const note = await prisma.quotationNote.findUnique({ where: { id: body.noteId } });
  if (!note || note.quotationId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.quotationNote.delete({ where: { id: body.noteId } });
  return NextResponse.json({ success: true });
}
