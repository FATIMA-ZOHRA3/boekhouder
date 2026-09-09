import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function getFileExtension(mimeType: string): string {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "bin";
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const label = (formData.get("label") as string) || null;
  // Staff can upload on behalf of a customer (used by the new bookkeeper
  // Purchases page) — this previously always attached the document to the
  // uploader's own userId, so a bookkeeper's upload silently landed on
  // their own account instead of the selected company's. Mirrors the same
  // isAccountant/targetUserId pattern already used by POST /api/tasks.
  const requestedUserId = (formData.get("userId") as string) || null;
  const me = await prisma.user.findUnique({ where: { id: session.userId }, select: { role: true } });
  const isStaff = me && (me.role === "bookkeeper" || me.role === "admin");
  const targetUserId = isStaff && requestedUserId ? requestedUserId : session.userId;

  if (!file) {
    return Response.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: "Invalid file type. Only PDF, JPG and PNG are allowed." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: "Bestand is te groot. Maximaal 10MB." }, { status: 400 });
  }

  const ext = getFileExtension(file.type);
  const timestamp = Date.now();
  const safeName = `${session.userId}-${timestamp}.${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "purchases");
  const filePath = path.join(uploadDir, safeName);
  const fileUrl = `/uploads/purchases/${safeName}`;

  try {
    await mkdir(uploadDir, { recursive: true });
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    const document = await prisma.purchaseDocument.create({
      data: {
        userId: targetUserId,
        fileName: file.name,
        fileUrl,
        fileType: ext,
        fileSize: file.size,
        status: "uploaded",
        label: label || file.name.replace(/\.[^.]+$/, ""),
      },
    });

    await logAudit({
      userId: session.userId,
      userRole: session.role,
      action: "purchase.upload",
      entity: "PurchaseDocument",
      entityId: document.id,
      after: { fileName: document.fileName, status: document.status },
    });

    return Response.json(document);
  } catch {
    return Response.json({ error: "Something went wrong while uploading" }, { status: 500 });
  }
}
