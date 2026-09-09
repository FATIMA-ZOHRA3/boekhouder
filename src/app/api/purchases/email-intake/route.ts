import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// Webhook endpoint for incoming purchase emails (e.g. from Brevo/SendGrid inbound parse)
// This is a public endpoint — authenticated by matching the purchase email address
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const to = (formData.get("to") as string || "").toLowerCase();
    const from = formData.get("from") as string || "";
    const subject = formData.get("subject") as string || "";

    if (!to) {
      return Response.json({ error: "Missing recipient" }, { status: 400 });
    }

    // Find the user by purchase email address
    const user = await prisma.user.findFirst({
      where: { purchaseEmail: to },
    });

    if (!user) {
      return Response.json({ error: "Unknown purchase email address" }, { status: 404 });
    }

    // Process attachments
    const uploadDir = path.join(process.cwd(), "public", "uploads", "purchases");
    await mkdir(uploadDir, { recursive: true });

    let imported = 0;

    // Check for file attachments
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("attachment") && value instanceof File) {
        const file = value;
        const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
        if (!allowedTypes.includes(file.type)) continue;

        const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/jpeg" ? "jpg" : "png";
        const safeName = `${user.id}-email-${Date.now()}-${imported}.${ext}`;
        const filePath = path.join(uploadDir, safeName);
        const fileUrl = `/uploads/purchases/${safeName}`;

        const bytes = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(bytes));

        // Extract supplier name from email sender
        const senderName = from.replace(/<.*>/, "").trim().replace(/"/g, "") || from;

        await prisma.purchaseDocument.create({
          data: {
            userId: user.id,
            fileName: file.name,
            fileUrl,
            fileType: ext,
            fileSize: file.size,
            status: "uploaded",
            label: subject || file.name.replace(/\.[^.]+$/, ""),
            source: "email",
            supplierName: senderName || null,
          },
        });
        imported++;
      }
    }

    // If no attachments but there is a subject, create a placeholder entry
    if (imported === 0 && subject) {
      await prisma.purchaseDocument.create({
        data: {
          userId: user.id,
          fileName: `email-${Date.now()}.txt`,
          fileUrl: "",
          fileType: "email",
          fileSize: 0,
          status: "uploaded",
          label: subject,
          source: "email",
          supplierName: from.replace(/<.*>/, "").trim().replace(/"/g, "") || null,
          notes: `Email from: ${from}\nSubject: ${subject}`,
        },
      });
      imported = 1;
    }

    return Response.json({ success: true, imported });
  } catch {
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
