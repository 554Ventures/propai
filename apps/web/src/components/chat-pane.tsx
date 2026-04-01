"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { apiFetch } from "../lib/api";
import { Button } from "./ui/button";
import { CHAT_SEND_EVENT } from "../lib/chat-events";

const STORAGE_KEY = "propai_chat_session_id";

type ToolCallLog = {
  toolName: string;
  status: string;
  inputs: Record<string, unknown>;
  outputs: unknown;
};

type Citation = {
  label: string;
  detail: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  metadata?: {
    toolCalls?: ToolCallLog[];
    citations?: Citation[];
  } | null;
};

type ChatHistoryResponse = {
  sessionId: string | null;
  messages: ChatMessage[];
};

type ChatResponse = {
  sessionId: string;
  response: string;
  citations?: Citation[];
  toolCalls?: ToolCallLog[];
};

const quickActions = [
  { label: "Rent Summary", message: "How much rent did I collect last month?" },
  { label: "Properties", message: "List my properties." },
  { label: "Cashflow", message: "Show me expenses for Oak Street last month." }
];

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export default function ChatPane() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  }, [historyLoaded]);

  useEffect(() => {
    if (historyLoaded) return;

    const loadHistory = async () => {
      try {
        const query = sessionId ? `?sessionId=${sessionId}` : "";
        const data = await apiFetch<ChatHistoryResponse>(`/api/chat/history${query}`, { auth: true });
        if (data.sessionId) {
          localStorage.setItem(STORAGE_KEY, data.sessionId);
        }
        setMessages(data.messages ?? []);
        setHistoryLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      }
    };

    void loadHistory();
  }, [historyLoaded, sessionId]);

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const optimisticMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const payload = {
        message: trimmed,
        sessionId: localStorage.getItem(STORAGE_KEY) ?? undefined
      };
      const data = await apiFetch<ChatResponse>("/api/chat", {
        method: "POST",
        auth: true,
        body: JSON.stringify(payload)
      });

      if (data.sessionId) {
        localStorage.setItem(STORAGE_KEY, data.sessionId);
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response,
        createdAt: new Date().toISOString(),
        metadata: {
          toolCalls: data.toolCalls ?? [],
          citations: data.citations ?? []
        }
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSend = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (!detail?.message) return;
      inputRef.current?.focus();
      void sendMessage(detail.message);
    };

    window.addEventListener(CHAT_SEND_EVENT, handleSend);
    return () => window.removeEventListener(CHAT_SEND_EVENT, handleSend);
  }, [sendMessage]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-slate-900/80 px-4 py-2">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => sendMessage(action.message)}
            className="rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs text-slate-200 transition hover:border-cyan-400/70"
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                msg.role === "user" ? "bg-cyan-500/20 text-cyan-100" : "bg-slate-900/70 text-slate-200"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="mb-2 list-disc pl-4">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-2 list-decimal pl-4">{children}</ol>,
                      li: ({ children }) => <li className="mb-1">{children}</li>,
                      code: ({ children }) => (
                        <code className="rounded bg-slate-800/50 px-1 py-0.5 text-cyan-300">{children}</code>
                      ),
                      pre: ({ children }) => (
                        <pre className="mb-2 overflow-x-auto rounded-lg bg-slate-950/80 p-3">{children}</pre>
                      ),
                      strong: ({ children }) => <strong className="font-semibold text-cyan-200">{children}</strong>,
                      em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
                      h1: ({ children }) => <h1 className="mb-2 text-lg font-bold">{children}</h1>,
                      h2: ({ children }) => <h2 className="mb-2 text-base font-bold">{children}</h2>,
                      h3: ({ children }) => <h3 className="mb-1 text-sm font-bold">{children}</h3>
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              )}
              <div className="mt-2 text-[11px] text-slate-400">{formatTime(msg.createdAt)}</div>
              {msg.metadata?.toolCalls && msg.metadata.toolCalls.length > 0 && (
                <div className="mt-2 rounded-xl border border-slate-800/70 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Tools</p>
                  {msg.metadata.toolCalls.map((tool, index) => (
                    <p key={`${tool.toolName}-${index}`}>• {tool.toolName}</p>
                  ))}
                </div>
              )}
              {msg.metadata?.citations && msg.metadata.citations.length > 0 && (
                <div className="mt-2 rounded-xl border border-slate-800/70 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Data sources</p>
                  {msg.metadata.citations.map((cite, index) => (
                    <p key={`${cite.label}-${index}`}>
                      • {cite.label}: {cite.detail}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="border-t border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">{error}</div>
      )}

      <div className="border-t border-slate-800/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage(input);
              }
            }}
            placeholder="Ask about rent, properties, expenses..."
            className="flex-1 rounded-2xl border border-slate-800/70 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/70 focus:outline-none"
            disabled={loading}
          />
          <Button onClick={() => sendMessage(input)} disabled={loading}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
