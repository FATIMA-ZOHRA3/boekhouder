import { GROQ_MODEL, callGroq, requireAiAccess, parseGroqJson, truncateForPrompt } from "@/lib/ai";

export async function POST(request: Request) {
  const access = await requireAiAccess("ai.use");
  if (!access.ok) return Response.json(access.body, { status: access.status });
  const { apiKey } = access;

  const body = await request.json();
  const { messageText, customerName } = body;

  if (!messageText || typeof messageText !== "string") {
    return Response.json({ error: "Message text is required" }, { status: 400 });
  }

  const groqResult = await callGroq(apiKey, {
    model: GROQ_MODEL,
    max_tokens: 200,
    // Short, consistent extraction task — same reasoning as suggest-category.
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an assistant for a bookkeeper. Create a short, clear task title and description based on a customer message.

Rules:
- Task title: max 8 words, action-oriented (e.g. "Check VAT difference customer", "Request missing receipt")
- Description: 1-2 sentences, simple English
- If the message contains multiple requests, focus on the most important one
- Return the result as JSON: {"title": "...", "description": "..."}
- Only return valid JSON, no explanation`,
      },
      {
        role: "user",
        content: `Customer: ${typeof customerName === "string" ? customerName : "Unknown"}\nMessage: "${truncateForPrompt(messageText)}"\n\nCreate a task summary as JSON.`,
      },
    ],
  });

  if (!groqResult.ok) {
    return Response.json({ error: groqResult.message }, { status: groqResult.status });
  }

  const raw = groqResult.data.choices?.[0]?.message?.content || "{}";
  // Previously fell back to the raw text truncated as a "title" on parse failure — that
  // silently hands the bookkeeper a garbled task title with no sign anything went wrong.
  // Failing loudly here matches suggest-category and summarize-conversation, which both
  // already treat an unparseable answer as an error rather than a degraded result.
  const parsed = parseGroqJson<{ title?: string; description?: string }>(raw);
  if (!parsed) {
    return Response.json({ error: "AI returned an invalid answer" }, { status: 502 });
  }
  return Response.json({ title: parsed.title || "", description: parsed.description || "" });
}
