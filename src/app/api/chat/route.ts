import { groq } from "@ai-sdk/groq";
import { createTextStreamResponse, streamText } from "ai";

export const runtime = "nodejs";

const MAX_PLAN_CONTEXT_CHARS = 10_000;
const MAX_MESSAGES = 40;

export async function POST(req: Request) {
  let body: { messages?: unknown; planContext?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { messages, planContext } = body;

  if (!Array.isArray(messages)) {
    return new Response("messages must be an array", { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return new Response(`messages array exceeds limit of ${MAX_MESSAGES}`, { status: 400 });
  }

  const contextStr =
    typeof planContext === "string"
      ? planContext.slice(0, MAX_PLAN_CONTEXT_CHARS)
      : "";

  try {
    const result = streamText({
      model: groq("llama-3.3-70b-versatile"),
      system: `You are a concise planning assistant for AWP COP (Central Operational Planning), a poultry supply-chain planning tool.
Answer questions about the current plan using the snapshot below. Be direct and specific — use numbers from the snapshot when relevant. If something isn't in the snapshot, say so rather than guessing.

${contextStr}`,
      messages,
      maxOutputTokens: 512,
    });

    return createTextStreamResponse({ stream: result.textStream as ReadableStream<string> });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("429") || msg.includes("quota") ? 429
      : msg.includes("401") || msg.includes("API key") ? 401
      : 500;
    return new Response(msg, { status });
  }
}
