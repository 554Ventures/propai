import prisma from "../prisma.js";
import { getOpenAIClient, getOpenAIModel } from "../openai.js";

const MAX_SUMMARY_CHARS = 1200;

const clamp = (text: string, max = MAX_SUMMARY_CHARS) => {
  const t = String(text ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trim()}…`;
};

const normalizeLine = (s: string) => {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    // Avoid control characters (defensive against bad tool outputs)
    .split("\u0000")
    .join("")
    .trim();
};

export const summarizeSessionTitle = (text: string) => {
  const trimmed = normalizeLine(text);
  if (!trimmed) return "Chat";
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
};

const buildDeterministicRollingSummary = (opts: {
  previousSummary: string | null;
  messages: Array<{ role: string; content: string }>;
}) => {
  const { previousSummary, messages } = opts;

  const last = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .slice(-12);

  const lines: string[] = [];

  const prev = normalizeLine(previousSummary ?? "");
  if (prev) {
    lines.push(`Prior summary: ${prev}`);
  }

  for (const msg of last) {
    const content = normalizeLine(msg.content);
    if (!content) continue;
    const prefix = msg.role === "user" ? "User" : "Assistant";
    lines.push(`${prefix}: ${content}`);
  }

  return clamp(lines.join("\n"));
};

const buildOpenAIRollingSummary = async (opts: {
  previousSummary: string | null;
  messages: Array<{ role: string; content: string }>;
}) => {
  const { previousSummary, messages } = opts;

  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const last = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .slice(-20);

  const inputText = [
    previousSummary ? `Previous summary:\n${previousSummary}` : null,
    "Recent messages (most recent last):",
    ...last.map((m) => `${m.role}: ${m.content}`)
  ]
    .filter(Boolean)
    .join("\n\n");

  const response: any = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "You maintain a short rolling memory for a chat session. Produce a concise summary for future context.\n" +
          "Rules:\n" +
          "- Output plain text (no JSON).\n" +
          `- Max ${MAX_SUMMARY_CHARS} characters.\n` +
          "- Keep stable facts: properties, ids/names, goals, decisions, and any pending action context.\n" +
          "- Omit chit-chat and filler.\n" +
          "- If there are numbers/dates, keep them."
      },
      { role: "user", content: inputText }
    ] as any,
    temperature: 0.1
  });

  const out = String(response.output_text ?? "").trim();
  return clamp(out);
};

export const updateChatSessionRollingSummary = async (opts: {
  sessionId: string;
  organizationId: string;
  userId: string;
}) => {
  const { sessionId, organizationId, userId } = opts;

  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, organizationId, userId },
    select: { id: true, summary: true, title: true }
  });
  if (!session) return;

  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { role: true, content: true }
  });

  const shouldUseOpenAI =
    process.env.AI_ROLLING_SUMMARY_USE_OPENAI === "true" && Boolean(process.env.OPENAI_API_KEY);

  let nextSummary = "";
  try {
    nextSummary = shouldUseOpenAI
      ? await buildOpenAIRollingSummary({ previousSummary: session.summary ?? null, messages })
      : buildDeterministicRollingSummary({ previousSummary: session.summary ?? null, messages });
  } catch {
    nextSummary = buildDeterministicRollingSummary({ previousSummary: session.summary ?? null, messages });
  }

  // Best-effort title: first non-empty user message.
  let nextTitle = session.title ?? null;
  if (!nextTitle) {
    const firstUser = messages.find((m) => m.role === "user" && normalizeLine(m.content));
    if (firstUser) {
      nextTitle = summarizeSessionTitle(firstUser.content);
    }
  }

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      summary: nextSummary || null,
      title: nextTitle
    }
  });
};
