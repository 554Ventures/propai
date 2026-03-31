"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { Button } from "./ui/button";
import { CHAT_OPEN_EVENT, CHAT_SEND_EVENT } from "../lib/chat-events";

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
  { label: "Expenses", message: "Show me expenses for Oak Street last month." }
];

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  }, [historyLoaded, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (historyLoaded) return;

    const loadHistory = async () => {
      try {
        const query = sessionId ? `?sessionId=${sessionId}` : "";
        const data = await apiFetch<ChatHistoryResponse>(`/api/chat/history${query}`, { auth: true });
        if (data.sessionId) {
          localStorage.setItem(STORAGE_KEY, data.sessionId);
        }
        setMessages((prev) => {
          const history = data.messages ?? [];
          if (prev.length === 0) return history;
          const historyIds = new Set(history.map((msg) => msg.id));
          const pending = prev.filter((msg) => !historyIds.has(msg.id));
          return [...history, ...pending];
        });
        setHistoryLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      }
    };

    void loadHistory();
  }, [isOpen, historyLoaded, sessionId]);

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, isOpen]);

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

    const handleOpen = () => {
      setIsOpen(true);
    };
    const handleSend = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (!detail?.message) return;
      setIsOpen(true);
      void sendMessage(detail.message);
    };

    window.addEventListener(CHAT_OPEN_EVENT, handleOpen);
    window.addEventListener(CHAT_SEND_EVENT, handleSend);

    return () => {
      window.removeEventListener(CHAT_OPEN_EVENT, handleOpen);
      window.removeEventListener(CHAT_SEND_EVENT, handleSend);
    };
  }, [sendMessage]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 flex h-[600px] w-[400px] max-h-[80vh] max-w-[90vw] flex-col overflow-hidden rounded-3xl border border-slate-700/70 bg-slate-950/95 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-slate-800/70 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/70">PropAI Assistant</p>
                <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
                  ✨ AI
                </span>
              </div>
              <p className="text-sm text-slate-200">Ask about rent, expenses, or leases.</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-slate-700/70 px-2 py-1 text-xs text-slate-300 transition hover:border-cyan-400/70"
            >
              Close
            </button>
          </div>

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
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    msg.role === "user"
                      ? "bg-cyan-500/20 text-cyan-100"
                      : "bg-slate-900/70 text-slate-200"
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <div className="mt-2 text-[11px] text-slate-400">{formatTime(msg.createdAt)}</div>
                  {msg.metadata?.toolCalls && msg.metadata.toolCalls.length > 0 && (
                    <div className="mt-2 rounded-xl border border-slate-800/70 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300">
                      <p className="font-semibold uppercase tracking-[0.15em] text-[10px] text-slate-400">
                        Tools
                      </p>
                      {msg.metadata.toolCalls.map((tool, index) => (
                        <p key={`${tool.toolName}-${index}`}>• {tool.toolName}</p>
                      ))}
                    </div>
                  )}
                  {msg.metadata?.citations && msg.metadata.citations.length > 0 && (
                    <div className="mt-2 rounded-xl border border-slate-800/70 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300">
                      <p className="font-semibold uppercase tracking-[0.15em] text-[10px] text-slate-400">
                        Data sources
                      </p>
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
            <div className="border-t border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="border-t border-slate-800/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <input
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
      )}

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="group relative flex h-[60px] w-[60px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-cyan-500 to-sky-400 text-2xl shadow-xl shadow-indigo-500/40 transition hover:-translate-y-0.5"
        aria-label="Open chat"
        title="AI Assistant"
      >
        <span className="absolute inset-0 rounded-full bg-cyan-400/40 opacity-60 blur-xl transition group-hover:opacity-90" />
        <span className="absolute inset-0 rounded-full border border-cyan-200/40 opacity-60 animate-pulse" />
        <span className="relative z-10">✨💬</span>
      </button>
    </div>
  );
}
