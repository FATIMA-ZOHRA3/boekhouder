import { NextRequest, NextResponse } from "next/server";
import { GROQ_MODEL, callGroq, requireAiAccess, truncateForPrompt } from "@/lib/ai";

interface DraftItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

const EXTRACT_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_invoice_items",
    description:
      "Report the invoice line items understood from what the user just said, merged with the items already on the draft.",
    parameters: {
      type: "object" as const,
      properties: {
        items: {
          type: "array",
          description:
            "The FULL updated list of line items (existing items carried over, plus new ones, minus any the user asked to remove, with corrections applied in place).",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unitPrice: { type: "number", description: "Unit price in EUR, excluding VAT" },
              vatRate: { type: "number", description: "VAT rate as a percentage, e.g. 21, 9, 0" },
            },
            required: ["description", "quantity", "unitPrice", "vatRate"],
          },
        },
        done: {
          type: "boolean",
          description: "True only if the user clearly indicated they have no more items to add (e.g. 'that's all', 'done', 'nothing else').",
        },
        clarification_needed: {
          type: ["string", "null"],
          description: "A short question to ask the user, in the SAME language they used, if something essential (price, quantity, description) is missing or ambiguous. Null if nothing to clarify.",
        },
        spoken_confirmation: {
          type: "string",
          description: "A short natural-language confirmation of what was just understood, in the same language the user spoke, to be read back via text-to-speech (e.g. 'Added: 3 hours of consulting at €75, 21% VAT. Anything else?').",
        },
      },
      required: ["items", "done", "clarification_needed", "spoken_confirmation"],
    },
  },
};

export async function POST(request: NextRequest) {
  // Previously only checked that a session existed — no permission check at all — because
  // this route is called from the client portal (/client/invoices/new) and "ai.use" is
  // staff-only, so it would have wrongly blocked its only real caller. It now uses its own
  // permission ("ai.voice-invoice.use", granted to the client role) instead of skipping the
  // check entirely.
  const access = await requireAiAccess("ai.voice-invoice.use");
  if (!access.ok) return NextResponse.json(access.body, { status: access.status });
  const { apiKey } = access;

  const body = await request.json();
  const utterance: string = (body.utterance || "").trim();
  const existingItems: DraftItem[] = Array.isArray(body.existingItems) ? body.existingItems : [];
  const defaultVatRate: number = typeof body.defaultVatRate === "number" ? body.defaultVatRate : 21;

  if (!utterance) {
    return NextResponse.json({ error: "No text received" }, { status: 400 });
  }

  const groqResult = await callGroq(apiKey, {
    model: GROQ_MODEL,
    max_tokens: 1000,
    // Structured extraction via tool-calling — favor consistent parsing of the same
    // utterance over creative variation.
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You help turn spoken sentences into structured sales-invoice line items for an accounting app.
The user may speak Dutch or English — always reply (spoken_confirmation / clarification_needed) in the SAME language they used.
Rules:
- Default VAT rate is ${defaultVatRate}% unless the user states a different rate explicitly.
- If quantity is not mentioned, assume 1.
- Prices are in EUR unless another currency is stated; if another currency is stated, ask for clarification instead of guessing a conversion.
- Always return the FULL merged list of items in "items", not just the new one.
- If the user is correcting a previous item (e.g. "actually make that 5 hours"), update that item in place rather than adding a duplicate.
- Keep "description" short and professional (e.g. "Consulting services", not a verbatim transcript).
- Only set done=true if the user clearly said they are finished adding items.`,
      },
      {
        role: "user",
        content: `Current line items on the draft: ${JSON.stringify(existingItems)}

What the user just said: "${truncateForPrompt(utterance, 2000)}"`,
      },
    ],
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "function", function: { name: "extract_invoice_items" } },
  });

  if (!groqResult.ok) {
    return NextResponse.json({ error: groqResult.message }, { status: groqResult.status });
  }

  const data = groqResult.data;
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    return NextResponse.json({ error: "AI did not give a usable answer" }, { status: 502 });
  }

  try {
    const parsedArgs = JSON.parse(toolCall.function.arguments);
    return NextResponse.json(parsedArgs);
  } catch {
    return NextResponse.json({ error: "AI returned an invalid answer" }, { status: 502 });
  }
}
