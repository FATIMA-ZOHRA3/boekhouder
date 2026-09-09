import { prisma } from "@/lib/prisma";
import { GROQ_MODEL, callGroq, requireAiAccess, truncateForPrompt } from "@/lib/ai";

export async function POST(request: Request) {
  const access = await requireAiAccess("ai.use");
  if (!access.ok) return Response.json(access.body, { status: access.status });
  const { apiKey } = access;

  const body = await request.json();
  const { conversationId } = body;

  if (!conversationId) {
    return Response.json({ error: "Conversation ID is required" }, { status: 400 });
  }

  // Fetch conversation with messages and customer context
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      user: { select: { name: true, company: true, email: true, legalForm: true, kvkNumber: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 20 },
    },
  });

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Build conversation context for the AI
  const customerInfo = [
    conversation.user.company && `Company: ${conversation.user.company}`,
    conversation.user.name && `Name: ${conversation.user.name}`,
    conversation.user.legalForm && `Rechtsvorm: ${conversation.user.legalForm}`,
  ].filter(Boolean).join(", ");

  const messageHistory = truncateForPrompt(
    conversation.messages.map((m: { senderRole: string; text: string }) =>
      `${m.senderRole === "client" ? "Customer" : "Bookkeeper"}: ${m.text}`
    ).join("\n\n"),
    8000
  );

  const groqResult = await callGroq(apiKey, {
    model: GROQ_MODEL,
    max_tokens: 500,
    // A reply draft should read naturally rather than identically every time, but
    // this is still a professional message going to a real customer — moderate
    // temperature, not the ~1.0 default used implicitly before.
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content: `You are a friendly and professional assistant for a bookkeeper. You help draft replies for customers of a bookkeeping firm.

Rules:
- Write in simple English, understandable for people without accounting knowledge
- Use short, clear sentences
- Be friendly, calm and helpful
- Avoid unnecessary jargon
- If you're not sure of the answer, say so honestly and suggest looking it up
- NEVER give tax or legal advice that hasn't been reviewed
- Keep the answer concise (max 3-4 sentences unless more detail is needed)
- Don't start with "Dear customer" — the bookkeeper adds the salutation themselves
- This is a draft that the bookkeeper will review and adjust before sending`,
      },
      {
        role: "user",
        content: `Customer information: ${customerInfo || "Not available"}
Subject: ${conversation.subject}

Conversation so far:
${messageHistory}

Create a draft reply to the customer's last message. The reply should be professional but approachable.`     },
    ],
  });

  if (!groqResult.ok) {
    return Response.json({ error: groqResult.message }, { status: groqResult.status });
  }

  const draft = groqResult.data.choices?.[0]?.message?.content || "";

  return Response.json({
    draft,
    model: GROQ_MODEL,
    conversationId,
    generatedAt: new Date().toISOString(),
  });
}
