"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { sendChatMessage } from "../lib/chat-events";

const exampleQuestions = [
  "How much rent did I collect last month?",
  "Show me my expenses",
  "List my properties",
  "Any leases ending soon?"
];

export default function DashboardAiChat() {
  const [input, setInput] = useState("");

  const handleSend = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    sendChatMessage(trimmed);
    setInput("");
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-indigo-400/30 bg-gradient-to-br from-indigo-600/50 via-slate-950/80 to-cyan-500/30 p-8 shadow-2xl shadow-indigo-500/20">
      <div className="pointer-events-none absolute -left-10 top-6 h-40 w-40 rounded-full bg-indigo-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-6 -top-10 h-48 w-48 rounded-full bg-cyan-400/30 blur-3xl" />

      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold text-white">Ask PropAI ✨</h2>
              <span className="rounded-full border border-indigo-200/40 bg-indigo-300/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-100">
                ✨ AI
              </span>
            </div>
            <p className="mt-2 text-sm text-indigo-100/80">
              Your AI command center for rent, expenses, leases, and portfolio insight.
            </p>
          </div>
          <span className="rounded-full border border-cyan-200/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
            Magical answers, instantly
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex-1">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend(input);
                }
              }}
              placeholder="Ask anything about your portfolio..."
              className="w-full rounded-2xl border border-indigo-200/30 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-indigo-200/60 focus:border-cyan-300/70 focus:outline-none"
            />
          </div>
          <Button
            className="h-12 rounded-2xl bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400 text-sm text-white shadow-lg shadow-cyan-500/30"
            onClick={() => handleSend(input)}
          >
            Send to PropAI
          </Button>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {exampleQuestions.map((question) => (
            <button
              key={question}
              onClick={() => handleSend(question)}
              className="rounded-full border border-indigo-200/30 bg-slate-950/60 px-4 py-2 text-xs text-indigo-100 transition hover:border-cyan-300/70 hover:text-white"
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
