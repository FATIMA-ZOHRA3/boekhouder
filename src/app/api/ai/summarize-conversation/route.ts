import { prisma } from "@/lib/prisma";
import { GROQ_MODEL, callGroq, requireAiAccess, parseGroqJson, truncateForPrompt } from "@/lib/ai";

// Same pattern as /api/ai/draft-reply: bookkeeper-only, Groq, "AI proposes -> accountant checks".
// Difference in purpose: this summarizes the WHOLE thread (for a busy accountant catching up
// on a long conversation), it does not draft a reply.
export async function POST(request: Request) {
  const access = await requireAiAccess("ai.use");
  if (!access.ok) return Response.json(access.body, { status: access.status });
  const { apiKey } = access;

  const body = await request.json();
  const { conversationId } = body;

  if (!conversationId) {
    return Response.json({ error: "Conversation ID is required" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      user: { select: { name: true, company: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (conversation.messages.length === 0) {
    return Response.json({ error: "This conversation has no messages yet" }, { status: 400 });
  }

  // Cap total conversation text sent to the model — a very long thread would otherwise
  // grow token cost unpredictably; the most recent messages matter most for "catch me up".
  const messageHistory = truncateForPrompt(
    conversation.messages.map((m: { senderRole: string; createdAt: Date; text: string }) =>
      `${m.senderRole === "client" ? "Customer" : "Bookkeeper"} (${new Date(m.createdAt).toLocaleDateString("en-US")}): ${m.text}`
    ).join("\n\n"),
    8000
  );

  const groqResult = await callGroq(apiKey, {
    model: GROQ_MODEL,
    max_tokens: 350,
    // Summarizing needs faithfulness to what was actually said, not creative variety —
    // a low temperature keeps re-summaries of the same thread stable and reduces drift.
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an assistant for a bookkeeper who needs to quickly grasp a long conversation with a customer.

Rules:
- Summarize the WHOLE conversation, not just the last message
- Write in simple English, no jargon
- "summary": 2-4 sentences that show the progression and the core of the conversation
- "openQuestion": if there's still an open question/action for the customer or bookkeeper, describe it in 1 short sentence; otherwise null
- Do not make up information that isn't in the conversation
- Return the result as JSON: {"summary": "...", "openQuestion": "..." | null}
- Only return valid JSON, no explanation`,
      },
      {
        role: "user",
        content: `Customer: ${conversation.user.company || conversation.user.name}\nSubject: ${conversation.subject}\n\nFull conversation:\n${messageHistory}\n\nSummarize this conversation as JSON.`,
      },
    ],
  });

  if (!groqResult.ok) {
    return Response.json({ error: groqResult.message }, { status: groqResult.status });
  }

  const raw = groqResult.data.choices?.[0]?.message?.content || "{}";
  const parsed = parseGroqJson<{ summary?: string; openQuestion?: string | null }>(raw);
  if (!parsed) {
    return Response.json({ error: "AI returned an invalid answer" }, { status: 502 });
  }

  return Response.json({
    summary: parsed.summary || "",
    openQuestion: parsed.openQuestion || null,
    messageCount: conversation.messages.length,
    conversationId,
    generatedAt: new Date().toISOString(),
  });
}
