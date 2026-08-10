import { google } from "@ai-sdk/google";
import { createTextStreamResponse, streamText } from "ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { messages, planContext } = await req.json();

  const result = streamText({
    model: google("gemini-2.0-flash"),
    system: `You are a concise planning assistant for AWP COP (Central Operations Planning), a poultry supply-chain planning tool.
Answer questions about the current plan using the snapshot below. Be direct and specific — use numbers from the snapshot when relevant. If something isn't in the snapshot, say so rather than guessing.

${planContext}`,
    messages,
    maxOutputTokens: 512,
  });

  return createTextStreamResponse({ stream: result.textStream as ReadableStream<string> });
}
