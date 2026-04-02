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
    aiDraft?: {
      planId: string;
      kind: string;
      summary: string;
      fields: Record<string, unknown>;
    };
    aiReceipt?: {
      title: string;
      href?: string;
      detail?: string;
    };
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

type AiPlanResponse =
  | {
      mode: "draft";
      draft: {
        planId: string;
        kind: string;
        summary: string;
        fields: Record<string, unknown>;
      };
    }
  | { mode: "chat"; message: string };

type AiConfirmResponse = {
  ok: true;
  result: {
    id: string;
    href?: string;
    [key: string]: unknown;
  };
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
  const [confirmingPlanId, setConfirmingPlanId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isWriteIntent = useCallback((text: string) => {
    const lower = text.toLowerCase();
    const hasVerb = /(log|add|create|record|enter)/.test(lower);
    const hasNoun = /(expense|income|transaction|payment|spent|received)/.test(lower);
    return hasVerb && hasNoun;
  }, []);

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
      if (isWriteIntent(trimmed)) {
        const data = await apiFetch<AiPlanResponse>("/ai/plan", {
          method: "POST",
          auth: true,
          body: JSON.stringify({ message: trimmed })
        });

        if (data.mode === "draft") {
          const assistantMessage: ChatMessage = {
            id: `assistant-draft-${Date.now()}`,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
            metadata: {
              aiDraft: data.draft
            }
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else {
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: data.message,
            createdAt: new Date().toISOString()
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
      } else {
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }, [isWriteIntent]);

  const confirmDraft = useCallback(async (planId: string) => {
    setError(null);
    setConfirmingPlanId(planId);
    try {
      const data = await apiFetch<AiConfirmResponse>("/ai/confirm", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ planId })
      });

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.metadata?.aiDraft?.planId !== planId) return msg;
          return {
            ...msg,
            content: "",
            metadata: {
              ...msg.metadata,
              aiDraft: undefined,
              aiReceipt: {
                title: "Saved",
                href: data.result.href,
                detail: `Created record ${data.result.id}`
              }
            }
          };
        })
      );

      // Best-effort: notify rest of app to refresh data.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("propai:data:changed", { detail: { kind: "cashflow" } }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setConfirmingPlanId(null);
    }
  }, []);

  const cancelDraft = useCallback(async (planId: string) => {
    setError(null);
    try {
      await apiFetch<{ ok: true }>("/ai/cancel", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ planId })
      });
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.metadata?.aiDraft?.planId !== planId) return msg;
          return {
            ...msg,
            content: "",
            metadata: {
              ...msg.metadata,
              aiDraft: undefined,
              aiReceipt: {
                title: "Cancelled",
                detail: "No changes were made."
              }
            }
          };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
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
              {msg.role === "assistant" && msg.metadata?.aiDraft ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Draft</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">{msg.metadata.aiDraft.summary}</p>
                  </div>

                  <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Fields</p>
                    <ul className="mt-2 space-y-1">
                      {Object.entries(msg.metadata.aiDraft.fields).map(([key, value]) => (
                        <li key={key} className="flex items-start justify-between gap-3">
                          <span className="text-slate-400">{key}</span>
                          <span className="text-right text-slate-100">
                            {typeof value === "string" ? value : JSON.stringify(value)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => confirmDraft(msg.metadata!.aiDraft!.planId)}
                      disabled={loading || confirmingPlanId === msg.metadata.aiDraft.planId}
                    >
                      {confirmingPlanId === msg.metadata.aiDraft.planId ? "Confirming…" : "Confirm"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => cancelDraft(msg.metadata!.aiDraft!.planId)}
                      disabled={loading || confirmingPlanId === msg.metadata.aiDraft.planId}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : msg.role === "assistant" && msg.metadata?.aiReceipt ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-100">{msg.metadata.aiReceipt.title}</p>
                  {msg.metadata.aiReceipt.detail ? (
                    <p className="text-xs text-slate-300">{msg.metadata.aiReceipt.detail}</p>
                  ) : null}
                  {msg.metadata.aiReceipt.href ? (
                    <a
                      href={msg.metadata.aiReceipt.href}
                      className="text-xs font-semibold text-cyan-200 hover:text-cyan-100"
                    >
                      View
                    </a>
                  ) : null}
                </div>
              ) : msg.role === "assistant" ? (
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
