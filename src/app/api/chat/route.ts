import { groq } from "@ai-sdk/groq";
import { createTextStreamResponse, streamText } from "ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { messages, planContext } = await req.json();

  try {
    const result = streamText({
      model: groq("llama-3.3-70b-versatile"),
      system: `You are a concise planning assistant for AWP COP (Central Operations Planning), a poultry supply-chain planning tool.
Answer questions about the current plan using the snapshot below. Be direct and specific — use numbers from the snapshot when relevant. If something isn't in the snapshot, say so rather than guessing.

${planContext}`,
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
