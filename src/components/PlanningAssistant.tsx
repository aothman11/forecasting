"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Props {
  planContext: string;
}

let msgIdCounter = 0;
function newId() {
  return `msg-${++msgIdCounter}`;
}

export function PlanningAssistant({ planContext }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new content
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: newId(), role: "user", content: text };
    const assistantId = newId();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          planContext,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }

      // Stream the plain-text response chunk by chunk
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg.includes("API key") || msg.includes("401")
          ? "Gemini API key not set — paste your key in .env.local and restart the dev server."
          : msg
      );
      // Remove the empty assistant placeholder on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "0.5rem",
      }}
    >
      {/* Chat panel */}
      {open && (
        <div
          style={{
            width: 360,
            height: 460,
            background: "#fff",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 14px",
              background: "var(--brand-green)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.8rem",
              letterSpacing: "0.03em",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>✦ AWP Planning Assistant</span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.8)",
                cursor: "pointer",
                fontSize: "1.1rem",
                lineHeight: 1,
                padding: 0,
              }}
              aria-label="Close assistant"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {messages.length === 0 && (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.78rem",
                  color: "#888",
                  lineHeight: 1.55,
                }}
              >
                Ask anything about the current plan — coverage gaps, capacity
                breaches, carcass kg, bird counts, or grade pools.
              </p>
            )}

            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                    background: isUser
                      ? "var(--brand-green)"
                      : "var(--brand-green-tint)",
                    color: isUser ? "#fff" : "var(--foreground)",
                    borderRadius: isUser
                      ? "12px 12px 2px 12px"
                      : "12px 12px 12px 2px",
                    padding: "8px 11px",
                    fontSize: "0.8rem",
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {m.content || (
                    <span style={{ opacity: 0.5, fontStyle: "italic" }}>
                      thinking…
                    </span>
                  )}
                </div>
              );
            })}

            {error && (
              <div
                style={{
                  background: "#fff0ec",
                  color: "var(--brand-alert)",
                  borderRadius: 8,
                  padding: "8px 11px",
                  fontSize: "0.78rem",
                  lineHeight: 1.4,
                }}
              >
                ⚠ {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            style={{
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the plan…"
              disabled={isLoading}
              style={{
                flex: 1,
                padding: "10px 12px",
                border: "none",
                outline: "none",
                fontSize: "0.8rem",
                background: "#fff",
                color: "var(--foreground)",
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              style={{
                padding: "10px 14px",
                background:
                  isLoading || !input.trim()
                    ? "var(--border-subtle)"
                    : "var(--brand-green)",
                color: isLoading || !input.trim() ? "#aaa" : "#fff",
                border: "none",
                cursor:
                  isLoading || !input.trim() ? "default" : "pointer",
                fontWeight: 600,
                fontSize: "0.8rem",
                transition: "background 0.15s",
              }}
            >
              {isLoading ? "…" : "Send"}
            </button>
          </form>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: open
            ? "var(--brand-green-dark)"
            : "var(--brand-green)",
          color: "#fff",
          border: "none",
          borderRadius: 24,
          padding: "10px 18px",
          fontWeight: 600,
          fontSize: "0.8rem",
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(4,120,54,0.35)",
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          transition: "background 0.15s",
          letterSpacing: "0.02em",
        }}
        aria-label={
          open ? "Close planning assistant" : "Open planning assistant"
        }
      >
        <span style={{ fontSize: "1rem" }}>✦</span>
        {open ? "Close" : "Ask AI"}
      </button>
    </div>
  );
}
