import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// POST: customer responds to exception (with optional file upload)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const { id } = await params;
  const item = await prisma.exceptionItem.findUnique({ where: { id } });
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  if (item.userId !== session.userId) return Response.json({ error: "No access" }, { status: 403 });

  const formData = await request.formData();
  const response = formData.get("response") as string || "";
  const notes = formData.get("notes") as string || "";
  const file = formData.get("file") as File | null;

  const data: Record<string, unknown> = {
    customerResponse: response,
    customerNotes: notes || null,
    status: "responded",
    respondedAt: new Date(),
  };

  // Handle file upload
  if (file && file.size > 0) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const safeName = `exception-${id}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "purchases");
    await mkdir(uploadDir, { recursive: true });
    const bytes = await file.arrayBuffer();
    await writeFile(path.join(uploadDir, safeName), Buffer.from(bytes));
    data.customerFileUrl = `/uploads/purchases/${safeName}`;
    data.customerFileName = file.name;
  }

  const updated = await prisma.exceptionItem.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, name: true, company: true, email: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "exception.respond",
    entity: "ExceptionItem",
    entityId: id,
    before: { status: item.status },
    after: { status: updated.status, customerResponse: updated.customerResponse },
  });

  return Response.json(updated);
}
