import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  parseMessageToToolCalls,
  supportedActionToolNames,
  executeActionTool,
  type AiActionPlan,
  type AiPlannedToolCall,
  type AiActionToolName
} from "../lib/ai/action-tools.js";
import { getOpenAIClient, getOpenAIModel } from "../lib/openai.js";
import type { ResponseFunctionToolCall } from "openai/resources/responses/responses";
import { planAgentTurn } from "../lib/ai/agent-planner.js";
import { extractPendingArgsPatch } from "../lib/ai/pending-action-extractor.js";
import { chatToolDefinitions, executeChatTool } from "../lib/ai/chat-tools.js";
import { filterAiOutput } from "../security/output-filter.js";
import { moderateText } from "../security/moderation.js";
import { calculateAiCostUsd, emptyUsage, mergeUsage } from "../security/costs.js";
import { extractUsage } from "../security/usage.js";
import { logAiSecurityEvent } from "../security/security-logger.js";
import { updateChatSessionRollingSummary } from "../lib/ai/rolling-summary.js";
import { validateChatToolArgs, validateWriteToolArgs } from "../lib/ai/tool-arg-validators.js";

const router: Router = Router();

type PlanRequestBody = {
  message?: string;
  pendingActionId?: string;
  scope?: {
    propertyId?: string;
  };
  // When true, this request is an explicit confirmation to execute a pending action.
  confirm?: boolean;
  // Optional idempotency key for confirm requests (recommended).
  clientRequestId?: string;
};

type ChatRequestBody = {
  sessionId?: string;
  message?: string;
  pendingActionId?: string;
  scope?: {
    propertyId?: string;
  };
  confirm?: boolean;
  clientRequestId?: string;
};

const allowedToolNames = new Set(chatToolDefinitions.map((tool) => tool.name));

const buildChatSystemPrompt = (opts: { propertyName?: string | null; sessionSummary?: string | null }) => {
  const { propertyName, sessionSummary } = opts;
  const scopeLine = propertyName
    ? `Current property context: ${propertyName}.`
    : "No single property is selected; aggregate across the portfolio unless specified.";

  const summaryLine = sessionSummary
    ? `Session memory (summary):\n${sessionSummary}`
    : "Session memory (summary): (none yet)";

  return [
    "You are PropAI, an assistant for property managers.",
    scopeLine,
    summaryLine,
    "Use the provided tools for any data-driven questions about rent, expenses, leases, or documents.",
    "If a request is unclear, ask a brief follow-up question.",
    "When you use tools, summarize results with concise numbers and mention the timeframe.",
    "Never fabricate data."
  ].join("\n");
};

const extractChatToolCalls = (response: { output?: unknown[] }): ResponseFunctionToolCall[] => {
  if (!Array.isArray(response.output)) return [];
  return response.output.filter(
    (item): item is ResponseFunctionToolCall =>
      typeof item === "object" && item !== null && "type" in item && item.type === "function_call"
  );
};

const ensureChatSession = async (opts: {
  organizationId: string;
  userId: string;
  sessionId?: string;
  propertyId?: string | null;
}) => {
  const { organizationId, userId, sessionId, propertyId } = opts;
  let session = null as any;
  if (sessionId) {
    session = await prisma.chatSession.findFirst({
      where: { id: sessionId, organizationId, userId }
    });
  }
  if (!session) {
    session = await prisma.chatSession.create({
      data: {
        userId,
        organizationId,
        propertyId: propertyId ?? null
      }
    });
  }
  if (propertyId && session.propertyId !== propertyId) {
    session = await prisma.chatSession.update({
      where: { id: session.id },
      data: { propertyId }
    });
  }
  return session as { id: string; propertyId: string | null };
};

const getChatSessionContext = async (opts: {
  sessionId: string;
  organizationId: string;
  userId: string;
}) => {
  const { sessionId, organizationId, userId } = opts;
  return prisma.chatSession.findFirst({
    where: { id: sessionId, organizationId, userId },
    include: { property: { select: { id: true, name: true } } }
  });
};

type ConfirmRequestBody = {
  actionId?: string;
  // Back-compat with older web payloads.
  planId?: string;
};

type CancelRequestBody = {
  actionId?: string;
  // Back-compat with older web payloads.
  planId?: string;
};

type ClarifyChoiceOption = {
  label: string;
  value: string | number | boolean | null;
};

type ClarifyChoice = {
  field: string;
  options: ClarifyChoiceOption[];
};

const toISODate = (d: Date) => {
  // YYYY-MM-DD
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const computeMissingFields = (toolName: string, args: Record<string, unknown>) => {
  const missing: string[] = [];
  const has = (key: string) => {
    const v = (args as any)[key];
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return true;
  };

  if (toolName === "createCashflowTransaction") {
    if (!has("type")) missing.push("type");
    if (!has("amount")) missing.push("amount");
    if (!has("date")) missing.push("date");
    if (!has("category")) missing.push("category");
  } else if (toolName === "createProperty") {
    if (!has("name")) missing.push("name");
    if (!has("addressLine1")) missing.push("addressLine1");
    if (!has("city")) missing.push("city");
    if (!has("state")) missing.push("state");
    if (!has("postalCode")) missing.push("postalCode");
  } else if (toolName === "createTenant") {
    if (!has("firstName")) missing.push("firstName");
    if (!has("lastName")) missing.push("lastName");
  } else if (toolName === "createMaintenanceRequest") {
    if (!has("propertyId")) missing.push("propertyId");
    if (!has("title")) missing.push("title");
  }
  return missing;
};

/**
 * Best-effort follow-up patching for pending actions.
 *
 * IMPORTANT: Only apply plain-text fallbacks to fields that are currently missing.
 * This prevents unrelated follow-ups like "add 4 units" from being mis-applied as
 * cashflow category/type.
 */
const buildPendingArgsPatch = (opts: {
  toolName: string;
  currentArgs: Record<string, unknown>;
  userText: string;
}): { patch: Record<string, unknown>; unhandledText: boolean } => {
  const { toolName, currentArgs, userText } = opts;
  const t = String(userText ?? "").trim();
  if (!t) return { patch: {}, unhandledText: true };

  // 1) JSON object patch (explicit)
  if (t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { patch: parsed as Record<string, unknown>, unhandledText: false };
      }
    } catch {
      // fall through to heuristics
    }
  }

  // 2) Plain-text fallbacks, limited to *currently missing fields only*
  const missing = computeMissingFields(toolName, currentArgs);
  const lower = t.toLowerCase();

  if (toolName === "createCashflowTransaction") {
    // If only one field is missing, treat the whole text as that field.
    if (missing.length === 1) {
      return { patch: { [missing[0]]: t }, unhandledText: false };
    }

    // Small convenience: accept "expense"/"income" for type, but only when type missing.
    if (missing.includes("type") && (lower === "expense" || lower === "income")) {
      return { patch: { type: lower }, unhandledText: false };
    }

    // If category is missing and user gave a short label-like string, treat it as category.
    // Avoid phrases that look like a different command.
    if (missing.includes("category")) {
      const looksLikeCommand = /\b(add|create|make|new|delete|remove|update|edit)\b/i.test(t);
      if (!looksLikeCommand && t.length <= 40) {
        return { patch: { category: t }, unhandledText: false };
      }
    }

    return { patch: {}, unhandledText: true };
  }

  // For non-cashflow tools, we don't have safe plain-text heuristics yet.
  return { patch: {}, unhandledText: true };
};

const buildClarifyChoices = async (opts: {
  organizationId: string;
  toolName: AiActionToolName;
  args: Record<string, unknown>;
  missing: string[];
}): Promise<ClarifyChoice[]> => {
  const { organizationId, toolName, args, missing } = opts;
  const choices: ClarifyChoice[] = [];

  // Quick picks for cashflow.
  if (toolName === "createCashflowTransaction") {
    if (missing.includes("type")) {
      choices.push({
        field: "type",
        options: [
          { label: "Expense", value: "expense" },
          { label: "Income", value: "income" }
        ]
      });
    }

    if (missing.includes("date")) {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      choices.push({
        field: "date",
        options: [
          { label: "Today", value: toISODate(today) },
          { label: "Yesterday", value: toISODate(yesterday) }
        ]
      });
    }

    if (missing.includes("category")) {
      choices.push({
        field: "category",
        options: [
          { label: "Repairs", value: "Repairs" },
          { label: "Utilities", value: "Utilities" },
          { label: "Supplies", value: "Supplies" },
          { label: "Insurance", value: "Insurance" },
          { label: "Taxes", value: "Taxes" },
          { label: "HOA", value: "HOA" }
        ]
      });
    }

    // Property is optional; offer quick picks when user has properties.
    if (args.propertyId == null) {
      const properties = await prisma.property.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { createdAt: "desc" }
      });
      if (properties.length > 0) {
        choices.push({
          field: "propertyId",
          options: [
            { label: "No property", value: null },
            ...properties.map((p) => ({ label: p.name, value: p.id }))
          ]
        });
      }
    }
  }

  // For maintenance requests, property choice is high-value.
  if (toolName === "createMaintenanceRequest" && missing.includes("propertyId")) {
    const properties = await prisma.property.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" }
    });
    if (properties.length > 0) {
      choices.push({
        field: "propertyId",
        options: properties.map((p) => ({ label: p.name, value: p.id }))
      });
    }
  }

  return choices;
};

const buildSystemPrompt = (opts?: { sessionSummary?: string | null; propertyName?: string | null }) => {
  const sessionSummary = opts?.sessionSummary ?? null;
  const propertyName = opts?.propertyName ?? null;

  const scopeLine = propertyName
    ? `Current property context: ${propertyName}.`
    : "No single property is selected; aggregate across the portfolio unless specified.";

  const summaryLine = sessionSummary
    ? `Session memory (summary):\n${sessionSummary}`
    : "Session memory (summary): (none yet)";

  return [
    "You are PropAI Action Planner.",
    scopeLine,
    summaryLine,
    "Your job is to translate the user's request into ONE OR MORE tool calls for write actions.",
    "Only use the allowed tools.",
    "Never execute actions; only plan.",
    "If required fields are missing, do not call tools; instead respond with a short clarification question.",
    "Allowed tools: " + supportedActionToolNames.join(", ")
  ].join("\n");
};

const actionToolDefinitions = [
  {
    type: "function" as const,
    name: "createCashflowTransaction",
    description: "Create a cashflow transaction (income or expense).",
    parameters: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {
        type: { type: "string" as const, description: "income|expense" },
        amount: { type: "number" as const },
        date: { type: "string" as const, description: "ISO date" },
        category: { type: "string" as const },
        propertyId: { type: "string" as const, nullable: true },
        notes: { type: "string" as const, nullable: true }
      },
      required: ["type", "amount", "date", "category"] as const
    },
    strict: true as const
  },
  {
    type: "function" as const,
    name: "createProperty",
    description: "Create a property.",
    parameters: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {
        name: { type: "string" as const },
        addressLine1: { type: "string" as const },
        addressLine2: { type: "string" as const, nullable: true },
        city: { type: "string" as const },
        state: { type: "string" as const },
        postalCode: { type: "string" as const },
        country: { type: "string" as const, nullable: true },
        notes: { type: "string" as const, nullable: true }
      },
      required: ["name", "addressLine1", "city", "state", "postalCode"] as const
    },
    strict: true as const
  },
  {
    type: "function" as const,
    name: "createTenant",
    description: "Create a tenant.",
    parameters: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {
        firstName: { type: "string" as const },
        lastName: { type: "string" as const },
        email: { type: "string" as const, nullable: true },
        phone: { type: "string" as const, nullable: true }
      },
      required: ["firstName", "lastName"] as const
    },
    strict: true as const
  },
  {
    type: "function" as const,
    name: "createMaintenanceRequest",
    description: "Create a maintenance request.",
    parameters: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {
        propertyId: { type: "string" as const },
        unitId: { type: "string" as const, nullable: true },
        tenantId: { type: "string" as const, nullable: true },
        title: { type: "string" as const },
        description: { type: "string" as const, nullable: true },
        cost: { type: "number" as const, nullable: true }
      },
      required: ["propertyId", "title"] as const
    },
    strict: true as const
  }
];

const extractToolCalls = (response: { output?: unknown[] }): ResponseFunctionToolCall[] => {
  if (!Array.isArray(response.output)) return [];
  return response.output.filter(
    (item): item is ResponseFunctionToolCall =>
      typeof item === "object" && item !== null && "type" in item && item.type === "function_call"
  );
};

const normalizePlannedCalls = (calls: Array<{ name: string; arguments?: string }>): AiPlannedToolCall[] => {
  return calls
    .map((call) => {
      if (!supportedActionToolNames.includes(call.name as AiActionToolName)) {
        return null;
      }
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
      } catch {
        parsedArgs = {};
      }
      return { toolName: call.name as AiActionToolName, args: parsedArgs };
    })
    .filter(Boolean) as AiPlannedToolCall[];
};

const planWithOpenAI = async (message: string, context?: { sessionSummary?: string | null; propertyName?: string | null }) => {
  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const response: any = await client.responses.create({
    model,
    input: [
      { role: "system", content: buildSystemPrompt(context) },
      { role: "user", content: message }
    ] as any,
    tools: actionToolDefinitions as any,
    temperature: 0.1
  });

  const toolCalls = extractToolCalls(response);
  const planned = normalizePlannedCalls(toolCalls.map((t) => ({ name: t.name, arguments: t.arguments })));
  const assistantText = String(response.output_text ?? "").trim();
  return { planned, assistantText };
};

router.post(
  "/plan",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId;
    const userId = req.auth?.userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { message, scope, pendingActionId } = req.body as PlanRequestBody;
    const trimmedMessage = String(message ?? "").trim();
    if (!trimmedMessage) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    // If we have an in-progress action, let the user provide missing fields as JSON.
    if (pendingActionId) {
      const id = String(pendingActionId).trim();
      const existing = await prisma.aiActionLog.findFirst({ where: { id, organizationId, userId } });
      if (!existing) {
        res.status(404).json({ error: "Pending action not found" });
        return;
      }

      // Expected follow-up formats:
      // - JSON: {"category":"Utilities"}
      // - Plain text: treated as category when missing category
      const payload = existing.payload as any;
      const plan = payload?.plan as AiActionPlan | undefined;
      if (!plan || !Array.isArray(plan.toolCalls) || plan.toolCalls.length === 0) {
        res.status(409).json({ error: "Pending action is not planable" });
        return;
      }

      const call = plan.toolCalls[0];
      const args = { ...(call.args ?? {}) } as Record<string, unknown>;

      const { patch, unhandledText } = buildPendingArgsPatch({
        toolName: call.toolName,
        currentArgs: args,
        userText: trimmedMessage
      });

      if (unhandledText && Object.keys(patch).length === 0) {
        // Don't silently mis-apply unrelated follow-ups. Keep the draft unchanged and ask.
        const missing = computeMissingFields(call.toolName, args);
        res.status(409).json({
          error:
            missing.length > 0
              ? `I’m not sure how to apply that to the pending ${call.toolName}. Please provide: ${missing.join(", ")}. You can reply with JSON like {" + missing[0] + ": "..."} or answer one field at a time.`
              : `I’m not sure how to apply that to the pending ${call.toolName}. If you meant a new action, start a new message without pendingActionId.`
        });
        return;
      }

      call.args = { ...args, ...patch };

      await prisma.aiActionLog.update({
        where: { id: existing.id },
        data: {
          payload: { ...payload, plan, lastUserMessage: trimmedMessage } as any
        }
      });

      const missing = computeMissingFields(call.toolName, call.args ?? {});
      if (missing.length > 0) {
        const choices = await buildClarifyChoices({
          organizationId,
          toolName: call.toolName,
          args: call.args ?? {},
          missing
        });

        res.json({
          pendingActionId: existing.id,
          plan: {
            summary: `I still need: ${missing.join(", ")}.`,
            toolCalls: plan.toolCalls
          },
          clarify: {
            pendingActionId: existing.id,
            choices
          },
          requiresConfirm: false
        });
        return;
      }

      res.json({
        pendingActionId: existing.id,
        plan,
        requiresConfirm: true
      });
      return;
    }

    // 1) Prefer local deterministic parsing (tests + offline mode)
    let plannedCalls = parseMessageToToolCalls(trimmedMessage);
    let assistantText: string | null = null;

    // 2) If not parseable and OpenAI is configured, ask it to produce tool calls
    if (plannedCalls.length === 0 && process.env.OPENAI_API_KEY) {
      const aiPlan = await planWithOpenAI(trimmedMessage);
      plannedCalls = aiPlan.planned;
      assistantText = aiPlan.assistantText || null;
    }

    if (plannedCalls.length === 0) {
      res.json({
        pendingActionId: null,
        plan: {
          summary: assistantText ?? "No supported write action detected.",
          toolCalls: []
        },
        requiresConfirm: false
      });
      return;
    }

    // If we have a single planned call but missing required fields, start a pending action and ask.
    if (plannedCalls.length === 1) {
      const missing = computeMissingFields(plannedCalls[0].toolName, plannedCalls[0].args ?? {});
      if (missing.length > 0) {
        const plan: AiActionPlan = {
          summary: `I need a bit more info: ${missing.join(", ")}.`,
          toolCalls: plannedCalls
        };

        const created = await prisma.aiActionLog.create({
          data: {
            userId,
            organizationId,
            actionType: plannedCalls[0].toolName,
            status: "PENDING",
            payload: {
              message: trimmedMessage,
              scope: scope ?? null,
              plan
            } as any
          }
        });

        const choices = await buildClarifyChoices({
          organizationId,
          toolName: plannedCalls[0].toolName,
          args: plannedCalls[0].args ?? {},
          missing
        });

        res.json({
          pendingActionId: created.id,
          plan: {
            summary: plan.summary,
            toolCalls: plan.toolCalls
          },
          clarify: {
            pendingActionId: created.id,
            choices
          },
          requiresConfirm: false
        });
        return;
      }
    }

    const plan: AiActionPlan = {
      summary: `Planned ${plannedCalls.length} action${plannedCalls.length === 1 ? "" : "s"}.`,
      toolCalls: plannedCalls
    };

    const actionType = plannedCalls.length === 1 ? plannedCalls[0].toolName : "multi";

    const created = await prisma.aiActionLog.create({
      data: {
        userId,
        organizationId,
        actionType,
        status: "PENDING",
        payload: {
          message: trimmedMessage,
          scope: scope ?? null,
          plan
        } as any
      }
    });

    res.json({
      pendingActionId: created.id,
      plan,
      requiresConfirm: true
    });
  })
);

/**
 * Unified AI chat endpoint.
 *
 * Stable integration contract so the frontend does not need heuristics to decide between plan vs chat.
 * Response modes:
 * - chat: normal assistant message (no pending action)
 * - clarify: pending action exists but missing required fields; includes choices
 * - draft: pending action ready to confirm
 * - result: confirm executed; includes tool outputs
 */
router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId;
    const userId = req.auth?.userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { sessionId, message, pendingActionId, scope, confirm, clientRequestId } = req.body as ChatRequestBody;
    const propertyId = scope?.propertyId ?? null;
    const chatSession = await ensureChatSession({ organizationId, userId, sessionId, propertyId });

    // CONFIRM path
    if (confirm) {
      const id = String(pendingActionId ?? "").trim();
      if (!id) {
        res.status(400).json({ error: "pendingActionId is required" });
        return;
      }

      const idem = String(clientRequestId ?? "").trim();
      if (!idem) {
        res.status(400).json({ error: "clientRequestId is required for confirm" });
        return;
      }

      const action = await prisma.aiActionLog.findFirst({ where: { id, organizationId, userId } });
      if (!action) {
        res.status(404).json({ error: "Action not found" });
        return;
      }

      // Persist the confirm action as a chat message (best-effort)
      await prisma.chatMessage.create({
        data: {
          sessionId: chatSession.id,
          role: "user",
          content: "[Confirm action]",
          metadata: { kind: "ai_confirm", actionId: id } as any
        }
      });

      // Idempotency: if we already executed this confirm request, return stored result.
      const existingExec = await prisma.aiActionExecution.findFirst({
        where: { actionId: id, clientRequestId: idem, organizationId, userId }
      });
      if (existingExec) {
        if (existingExec.error) {
          res.status(400).json({ error: existingExec.error });
          return;
        }
        const assistantMessage = await prisma.chatMessage.create({
          data: {
            sessionId: chatSession.id,
            role: "assistant",
            content: "",
            metadata: { aiReceipt: { title: "Saved" } } as any
          }
        });
        await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });
        try {
          await updateChatSessionRollingSummary({ sessionId: chatSession.id, organizationId, userId });
        } catch {
          // best-effort
        }

        res.json({
          mode: "result",
          pendingActionId: null,
          receipt: { title: "Saved" },
          result: existingExec.result ?? null,
          sessionId: chatSession.id,
          messageId: assistantMessage.id
        });
        return;
      }

      if (action.status === "CANCELED") {
        res.status(409).json({ error: "Action was canceled" });
        return;
      }

      if (action.status === "CONFIRMED") {
        const assistantMessage = await prisma.chatMessage.create({
          data: {
            sessionId: chatSession.id,
            role: "assistant",
            content: "",
            metadata: { aiReceipt: { title: "Saved" }, result: action.result ?? null } as any
          }
        });
        await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });
        try {
          await updateChatSessionRollingSummary({ sessionId: chatSession.id, organizationId, userId });
        } catch {
          // best-effort
        }

        res.json({
          mode: "result",
          pendingActionId: null,
          receipt: { title: "Saved" },
          result: action.result ?? null,
          sessionId: chatSession.id,
          messageId: assistantMessage.id
        });
        return;
      }

      if (action.status !== "PENDING") {
        res.status(409).json({ error: `Action is not pending (status=${action.status})` });
        return;
      }

      const payload = action.payload as any;
      const toolCalls = (payload?.plan?.toolCalls ?? []) as AiPlannedToolCall[];
      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        await prisma.aiActionLog.update({ where: { id: action.id }, data: { status: "FAILED", error: "No planned tool calls" } });
        res.status(400).json({ error: "No planned tool calls" });
        return;
      }

      try {
        const result = await prisma.$transaction(async () => {
          const outputs: unknown[] = [];
          for (const call of toolCalls) {
            const toolName = call.toolName as AiActionToolName;
            if (!supportedActionToolNames.includes(toolName)) {
              throw new Error(`Tool not permitted: ${String(toolName)}`);
            }
            const output = await executeActionTool(toolName, (call.args ?? {}) as Record<string, unknown>, {
              userId,
              organizationId
            });
            outputs.push({ toolName, output });
          }
          return outputs;
        });

        // Store idempotent execution result
        await prisma.aiActionExecution.create({
          data: {
            organizationId,
            userId,
            actionId: action.id,
            clientRequestId: idem,
            status: "CONFIRMED",
            result: result as any
          }
        });

        const updated = await prisma.aiActionLog.update({
          where: { id: action.id },
          data: { status: "CONFIRMED", result: result as any, error: null }
        });

        const assistantMessage = await prisma.chatMessage.create({
          data: {
            sessionId: chatSession.id,
            role: "assistant",
            content: "",
            metadata: { aiReceipt: { title: "Saved" }, result: updated.result ?? null } as any
          }
        });
        await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });
        try {
          await updateChatSessionRollingSummary({ sessionId: chatSession.id, organizationId, userId });
        } catch {
          // best-effort
        }

        res.json({
          mode: "result",
          pendingActionId: null,
          receipt: { title: "Saved" },
          result: updated.result,
          sessionId: chatSession.id,
          messageId: assistantMessage.id
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Action execution failed";
        try {
          await prisma.aiActionExecution.create({
            data: {
              organizationId,
              userId,
              actionId: action.id,
              clientRequestId: idem,
              status: "FAILED",
              error: message
            }
          });
        } catch {
          // best-effort
        }
        await prisma.aiActionLog.update({ where: { id: action.id }, data: { status: "FAILED", error: message } });
        res.status(400).json({ error: message });
      }

      return;
    }

    // PLAN/CHAT path
    const trimmedMessage = String(message ?? "").trim();

    await prisma.chatMessage.create({
      data: {
        sessionId: chatSession.id,
        role: "user",
        content: trimmedMessage
      }
    });

    // Follow-up / merge into draft when pendingActionId is present.
    if (pendingActionId) {
      const id = String(pendingActionId).trim();
      const existing = await prisma.aiActionLog.findFirst({ where: { id, organizationId, userId } });
      if (!existing) {
        res.status(404).json({ error: "Pending action not found" });
        return;
      }

      const payload = existing.payload as any;
      const plan = payload?.plan as AiActionPlan | undefined;
      if (!plan || !Array.isArray(plan.toolCalls) || plan.toolCalls.length === 0) {
        res.status(409).json({ error: "Pending action is not planable" });
        return;
      }

      const call = plan.toolCalls[0];
      const args = { ...(call.args ?? {}) } as Record<string, unknown>;

      const { patch, unhandledText } = buildPendingArgsPatch({
        toolName: call.toolName,
        currentArgs: args,
        userText: trimmedMessage
      });

      // If the basic patcher couldn't handle the follow-up, use an LLM extractor to pull
      // missing fields from natural language (agentic follow-ups like: "Name: X, Address: ...").
      let extractedPatch: Record<string, unknown> | null = null;
      if (unhandledText && Object.keys(patch).length === 0 && process.env.OPENAI_API_KEY) {
        const missingForExtract = computeMissingFields(call.toolName, args);
        try {
          const sessionContext = await getChatSessionContext({
            sessionId: chatSession.id,
            organizationId,
            userId
          });
          const extracted = await extractPendingArgsPatch({
            toolName: call.toolName,
            currentArgs: args,
            missing: missingForExtract,
            userMessage: trimmedMessage,
            memorySummary: (sessionContext as any)?.summary ?? null
          });
          extractedPatch = extracted?.patch ?? null;
        } catch {
          extractedPatch = null;
        }
      }

      if (unhandledText && Object.keys(patch).length === 0 && (!extractedPatch || Object.keys(extractedPatch).length === 0)) {
        // Don't silently mis-apply unrelated follow-ups (e.g. "add 4 units").
        // Leave draft unchanged and ask for explicit field(s).
        const missing = computeMissingFields(call.toolName, args);
        const choices = await buildClarifyChoices({ organizationId, toolName: call.toolName, args, missing });

        const assistantMessage = await prisma.chatMessage.create({
          data: {
            sessionId: chatSession.id,
            role: "assistant",
            content:
              missing.length > 0
                ? `I’m not sure how to apply that to the pending ${call.toolName}. Please provide: ${missing.join(", ")}. (You can reply with JSON like {"${missing[0]}": "..."}.)`
                : `I’m not sure how to apply that to the pending ${call.toolName}. If you meant a new action, start a new message (no pendingActionId).`,
            metadata: {
              aiDraft: {
                planId: existing.id,
                kind: call.toolName,
                summary:
                  missing.length > 0
                    ? `I still need: ${missing.join(", ")}.`
                    : plan.summary,
                fields: args,
                toolCalls: plan.toolCalls,
                clarify: missing.length > 0 ? { choices } : undefined
              }
            } as any
          }
        });
        await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });

        res.json({
          mode: missing.length > 0 ? "clarify" : "draft",
          pendingActionId: existing.id,
          summary:
            missing.length > 0
              ? `I still need: ${missing.join(", ")}.`
              : plan.summary,
          draft: { kind: call.toolName, fields: args, toolCalls: plan.toolCalls },
          clarify: missing.length > 0 ? { choices } : undefined,
          requiresConfirm: missing.length === 0,
          sessionId: chatSession.id,
          messageId: assistantMessage.id
        });
        return;
      }

      call.args = { ...args, ...patch, ...(extractedPatch ?? {}) };

      await prisma.aiActionLog.update({
        where: { id: existing.id },
        data: { payload: { ...payload, plan, lastUserMessage: trimmedMessage } as any }
      });

      const missing = computeMissingFields(call.toolName, call.args ?? {});
      if (missing.length > 0) {
        const choices = await buildClarifyChoices({ organizationId, toolName: call.toolName, args: call.args ?? {}, missing });
        const assistantMessage = await prisma.chatMessage.create({
          data: {
            sessionId: chatSession.id,
            role: "assistant",
            content: `I still need: ${missing.join(", ")}.`,
            metadata: {
              aiDraft: {
                planId: existing.id,
                kind: call.toolName,
                summary: `I still need: ${missing.join(", ")}.`,
                fields: call.args ?? {},
                toolCalls: plan.toolCalls,
                clarify: { choices }
              }
            } as any
          }
        });
        await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });

        res.json({
          mode: "clarify",
          pendingActionId: existing.id,
          summary: `I still need: ${missing.join(", ")}.`,
          draft: { kind: call.toolName, fields: call.args ?? {}, toolCalls: plan.toolCalls },
          clarify: { choices },
          sessionId: chatSession.id,
          messageId: assistantMessage.id
        });
        return;
      }

      const assistantMessage = await prisma.chatMessage.create({
        data: {
          sessionId: chatSession.id,
          role: "assistant",
          content: "",
          metadata: {
            aiDraft: {
              planId: existing.id,
              kind: call.toolName,
              summary: plan.summary,
              fields: call.args ?? {},
              toolCalls: plan.toolCalls
            }
          } as any
        }
      });
      await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });

      res.json({
        mode: "draft",
        pendingActionId: existing.id,
        summary: plan.summary,
        draft: { kind: call.toolName, fields: call.args ?? {}, toolCalls: plan.toolCalls },
        requiresConfirm: true,
        sessionId: chatSession.id,
        messageId: assistantMessage.id
      });
      return;
    }

    if (!trimmedMessage) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    // Deterministic-first: use local parser when it can.
    let plannedCalls = parseMessageToToolCalls(trimmedMessage);
    let assistantText: string | null = null;

    // If local parser can't decide, use a strict JSON planner that MUST choose read/write/clarify.
    if (plannedCalls.length === 0 && process.env.OPENAI_API_KEY) {
      const sessionContext = await getChatSessionContext({
        sessionId: chatSession.id,
        organizationId,
        userId
      });

      const plan = await planAgentTurn({
        message: trimmedMessage,
        memorySummary: (sessionContext as any)?.summary ?? null,
        propertyName: sessionContext?.property?.name ?? null,
        maxRetries: 1
      });

      if (plan.intent === "write" && Array.isArray(plan.writePlans) && plan.writePlans.length > 0) {
        plannedCalls = plan.writePlans
          .map((p) => {
            const validated = validateWriteToolArgs(p.toolName, p.args);
            if (!validated.ok) return null;
            return { toolName: p.toolName, args: validated.value };
          })
          .filter(Boolean) as any;
      } else if (plan.intent === "clarify") {
        assistantText = plan.clarificationQuestion ?? "I need a bit more information to do that.";
      } else if (plan.intent === "write") {
        // Planner believed this was a write, but failed to produce a valid tool plan.
        // Do NOT fall back to read-only chat mode (prevents hallucinated success narratives).
        const assistantMessage = await prisma.chatMessage.create({
          data: {
            sessionId: chatSession.id,
            role: "assistant",
            content:
              "I can create/update things in PropAI, but I couldn’t form a valid action plan from that message. What would you like to do: create a property, log a cashflow transaction, create a tenant, or create a maintenance request?"
          }
        });
        await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });
        res.json({
          mode: "clarify",
          pendingActionId: null,
          summary: "I need a bit more info to draft the action.",
          draft: null,
          clarify: null,
          requiresConfirm: false,
          sessionId: chatSession.id,
          messageId: assistantMessage.id
        });
        return;
      }

      // If the strict planner couldn't produce a write plan, fall back to the legacy
      // OpenAI tool-call planner (still guarded by strict tool schemas + server-side arg validation).
      if (plannedCalls.length === 0) {
        const aiPlan = await planWithOpenAI(trimmedMessage, {
          sessionSummary: (sessionContext as any)?.summary ?? null,
          propertyName: sessionContext?.property?.name ?? null
        });
        plannedCalls = aiPlan.planned
          .map((p) => {
            const validated = validateWriteToolArgs(p.toolName, p.args);
            if (!validated.ok) return null;
            return { toolName: p.toolName, args: validated.value };
          })
          .filter(Boolean) as any;
        if (!assistantText && aiPlan.assistantText) {
          assistantText = aiPlan.assistantText;
        }
      }
    }

    // If the planner returned a clarification question, do NOT fall back into read-only chat mode.
    // Clarify must be represented as a first-class state (mode=clarify), not a normal chat response.
    if (plannedCalls.length === 0 && assistantText) {
      const assistantMessage = await prisma.chatMessage.create({
        data: {
          sessionId: chatSession.id,
          role: "assistant",
          content: assistantText
        }
      });
      await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });
      res.json({
        mode: "clarify",
        pendingActionId: null,
        summary: assistantText,
        draft: null,
        clarify: null,
        requiresConfirm: false,
        sessionId: chatSession.id,
        messageId: assistantMessage.id
      });
      return;
    }

    if (plannedCalls.length === 0) {
      // Read-only chat mode: run the same tool-loop as /api/chat (when OpenAI is configured).
      if (!process.env.OPENAI_API_KEY) {
        const fallback =
          assistantText ??
          "AI chat isn't configured on the server (missing OPENAI_API_KEY). I can still help you plan write actions (expenses, properties, tenants, maintenance).";

        const assistantMessage = await prisma.chatMessage.create({
          data: {
            sessionId: chatSession.id,
            role: "assistant",
            content: fallback
          }
        });
        await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });
        res.json({
          mode: "chat",
          pendingActionId: null,
          message: fallback,
          sessionId: chatSession.id,
          messageId: assistantMessage.id
        });
        return;
      }

      const sessionContext = await getChatSessionContext({
        sessionId: chatSession.id,
        organizationId,
        userId
      });

      const recentMessages = await prisma.chatMessage.findMany({
        where: { sessionId: chatSession.id },
        orderBy: { createdAt: "desc" },
        take: 20
      });
      const orderedMessages = recentMessages.reverse();

      const input = [
        {
          role: "system",
          content: buildChatSystemPrompt({
            propertyName: sessionContext?.property?.name ?? null,
            sessionSummary: (sessionContext as any)?.summary ?? null
          })
        },
        ...orderedMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      ];

      const client = getOpenAIClient();
      const model = getOpenAIModel();

      let response: any = await client.responses.create({
        model,
        input: input as any,
        tools: chatToolDefinitions as any,
        temperature: 0.2,
        user: userId
      });
      let usageSnapshot = mergeUsage(emptyUsage(), extractUsage(response));

      const toolCallLogs: Array<{
        toolName: string;
        inputs: Record<string, unknown>;
        outputs: unknown;
        status: "success" | "error";
      }> = [];
      const citations: Array<{ label: string; detail: string }> = [];

      for (let iteration = 0; iteration < 3; iteration += 1) {
        const toolCalls = extractChatToolCalls(response);
        if (toolCalls.length === 0) break;

        const toolOutputs = [] as Array<{ type: "function_call_output"; call_id: string; output: string }>;

        for (const toolCall of toolCalls) {
          if (!allowedToolNames.has(toolCall.name)) {
            await logAiSecurityEvent({
              userId,
              sessionId: chatSession.id,
              type: "tool_call_blocked",
              severity: "high",
              message: "Attempted to call unauthorized tool",
              metadata: { toolName: toolCall.name }
            });
            toolOutputs.push({
              type: "function_call_output",
              call_id: toolCall.call_id,
              output: JSON.stringify({ error: "Tool not permitted" })
            });
            continue;
          }

          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
          } catch {
            parsedArgs = {};
          }

          // Drop unknown keys / enforce minimal shapes before executing.
          const validated = validateChatToolArgs(toolCall.name, parsedArgs);
          if (!validated.ok) {
            await logAiSecurityEvent({
              userId,
              sessionId: chatSession.id,
              type: "tool_args_invalid",
              severity: "medium",
              message: "Invalid tool arguments",
              metadata: { toolName: toolCall.name, error: validated.error }
            });
            toolCallLogs.push({
              toolName: toolCall.name,
              inputs: parsedArgs,
              outputs: { error: validated.error },
              status: "error"
            });
            toolOutputs.push({
              type: "function_call_output",
              call_id: toolCall.call_id,
              output: JSON.stringify({ error: validated.error })
            });
            continue;
          }

          parsedArgs = validated.value;

          try {
            const result = await executeChatTool(toolCall.name, parsedArgs, {
              userId,
              organizationId
            });
            toolCallLogs.push({
              toolName: toolCall.name,
              inputs: parsedArgs,
              outputs: result.data,
              status: "success"
            });
            if (result.citations) citations.push(...result.citations);

            toolOutputs.push({
              type: "function_call_output",
              call_id: toolCall.call_id,
              output: JSON.stringify(result.data)
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Tool execution failed";
            toolCallLogs.push({
              toolName: toolCall.name,
              inputs: parsedArgs,
              outputs: { error: message },
              status: "error"
            });
            toolOutputs.push({
              type: "function_call_output",
              call_id: toolCall.call_id,
              output: JSON.stringify({ error: message })
            });
          }
        }

        response = await client.responses.create({
          model,
          input: toolOutputs,
          previous_response_id: response.id,
          temperature: 0.2,
          user: userId
        });
        usageSnapshot = mergeUsage(usageSnapshot, extractUsage(response));
      }

      const responseText = response.output_text?.trim() || "Sorry, I could not generate a response.";
      let safeResponseText = responseText;
      let outputBlockedReason: string | null = null;

      const outputFilter = filterAiOutput(responseText);
      if (!outputFilter.allowed) {
        outputBlockedReason = outputFilter.reason ?? "output_filter";
      }

      if (!outputBlockedReason && process.env.AI_OUTPUT_MODERATION_ENABLED !== "false") {
        try {
          const outputModeration = await moderateText(responseText);
          if (outputModeration.flagged) {
            outputBlockedReason = "output_moderation";
            await logAiSecurityEvent({
              userId,
              sessionId: chatSession.id,
              type: "output_moderation_flag",
              severity: "high",
              message: "Assistant output flagged by moderation",
              metadata: { categories: outputModeration.categories, model: outputModeration.model }
            });
          }
        } catch (error) {
          outputBlockedReason = "output_moderation_error";
          await logAiSecurityEvent({
            userId,
            sessionId: chatSession.id,
            type: "output_moderation_error",
            severity: "high",
            message: "Output moderation service failed",
            metadata: { error: error instanceof Error ? error.message : "unknown" }
          });
        }
      }

      if (outputBlockedReason) {
        safeResponseText = "Sorry, I can't help with that request.";
        await logAiSecurityEvent({
          userId,
          sessionId: chatSession.id,
          type: "output_blocked",
          severity: "high",
          message: "Assistant output blocked by safety filter",
          metadata: { reason: outputBlockedReason }
        });
      }

      // Hard guardrail: in read-only chat mode, never allow the assistant to claim that it
      // created/saved/updated records (writes require draft+confirm+execution receipts).
      // If the model tries anyway, override with a deterministic message.
      const successClaim = /\b(successfully|created|saved|done|completed|added|updated|deleted)\b/i.test(
        safeResponseText
      );
      if (successClaim) {
        safeResponseText =
          "I haven’t created or changed anything yet. If you want me to create a property (or log a transaction, tenant, maintenance request), I’ll draft it for confirmation first.";
        await logAiSecurityEvent({
          userId,
          sessionId: chatSession.id,
          type: "hallucinated_write_claim_blocked",
          severity: "high",
          message: "Assistant attempted to claim a write in read-only mode",
          metadata: {
            toolCalls: toolCallLogs.map((t) => ({ toolName: t.toolName, status: t.status }))
          }
        });
      }

      const assistantMessage = await prisma.chatMessage.create({
        data: {
          sessionId: chatSession.id,
          role: "assistant",
          content: safeResponseText,
          metadata: {
            toolCalls: toolCallLogs as any,
            citations: citations as any,
            outputBlockedReason: outputBlockedReason ?? null
          }
        }
      });

      if (toolCallLogs.length > 0) {
        await prisma.toolCallLog.createMany({
          data: toolCallLogs.map((log) => ({
            messageId: assistantMessage.id,
            toolName: log.toolName,
            inputs: log.inputs as any,
            outputs: log.outputs as any,
            status: log.status
          }))
        });
      }

      await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });

      // Update rolling summary/title.
      try {
        await updateChatSessionRollingSummary({ sessionId: chatSession.id, organizationId, userId });
      } catch {
        // best-effort
      }

      // Log usage (best-effort; keep parity with /api/chat)
      try {
        const costUsd = calculateAiCostUsd(usageSnapshot);
        await prisma.aiUsage.create({
          data: {
            userId,
            organizationId,
            sessionId: chatSession.id,
            messageId: assistantMessage.id,
            model,
            inputTokens: usageSnapshot.inputTokens,
            outputTokens: usageSnapshot.outputTokens,
            totalTokens: usageSnapshot.totalTokens,
            costUsd: costUsd > 0 ? costUsd : null
          }
        });
      } catch {
        // best-effort
      }

      res.json({
        mode: "chat",
        pendingActionId: null,
        message: safeResponseText,
        citations,
        toolCalls: toolCallLogs,
        sessionId: chatSession.id,
        messageId: assistantMessage.id
      });
      return;
    }

    if (plannedCalls.length === 1) {
      const missing = computeMissingFields(plannedCalls[0].toolName, plannedCalls[0].args ?? {});
      if (missing.length > 0) {
        const plan: AiActionPlan = {
          summary: `I need a bit more info: ${missing.join(", ")}.`,
          toolCalls: plannedCalls
        };

        const created = await prisma.aiActionLog.create({
          data: {
            userId,
            organizationId,
            actionType: plannedCalls[0].toolName,
            status: "PENDING",
            payload: { message: trimmedMessage, scope: scope ?? null, plan } as any
          }
        });

        const choices = await buildClarifyChoices({
          organizationId,
          toolName: plannedCalls[0].toolName,
          args: plannedCalls[0].args ?? {},
          missing
        });

        const assistantMessage = await prisma.chatMessage.create({
          data: {
            sessionId: chatSession.id,
            role: "assistant",
            content: plan.summary,
            metadata: {
              aiDraft: {
                planId: created.id,
                kind: plannedCalls[0].toolName,
                summary: plan.summary,
                fields: plannedCalls[0].args ?? {},
                toolCalls: plan.toolCalls,
                clarify: { choices }
              }
            } as any
          }
        });
        await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });

        // Set a title on first assistant response if the session has no messages yet (best effort)
        try {
          await prisma.chatSession.update({
            where: { id: chatSession.id },
            data: { /* title field not in schema; ignore if absent */ } as any
          });
        } catch {
          // ignore
        }

        res.json({
          mode: "clarify",
          pendingActionId: created.id,
          summary: plan.summary,
          draft: { kind: plannedCalls[0].toolName, fields: plannedCalls[0].args ?? {}, toolCalls: plan.toolCalls },
          clarify: { choices },
          sessionId: chatSession.id,
          messageId: assistantMessage.id
        });
        return;
      }
    }

    const plan: AiActionPlan = {
      summary: `Planned ${plannedCalls.length} action${plannedCalls.length === 1 ? "" : "s"}.`,
      toolCalls: plannedCalls
    };

    const actionType = plannedCalls.length === 1 ? plannedCalls[0].toolName : "multi";

    const created = await prisma.aiActionLog.create({
      data: {
        userId,
        organizationId,
        actionType,
        status: "PENDING",
        payload: { message: trimmedMessage, scope: scope ?? null, plan } as any
      }
    });

    const primary = plan.toolCalls[0];
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId: chatSession.id,
        role: "assistant",
        content: "",
        metadata: {
          aiDraft: {
            planId: created.id,
            kind: primary?.toolName ?? actionType,
            summary: plan.summary,
            fields: primary?.args ?? {},
            toolCalls: plan.toolCalls
          }
        } as any
      }
    });
    await prisma.chatSession.update({ where: { id: chatSession.id }, data: { updatedAt: new Date() } });

    res.json({
      mode: "draft",
      pendingActionId: created.id,
      summary: plan.summary,
      draft: { kind: primary?.toolName ?? actionType, fields: primary?.args ?? {}, toolCalls: plan.toolCalls },
      requiresConfirm: true,
      sessionId: chatSession.id,
      messageId: assistantMessage.id
    });
  })
);

router.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId;
    const userId = req.auth?.userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { actionId, planId } = req.body as ConfirmRequestBody;
    const id = String(actionId ?? planId ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "actionId is required" });
      return;
    }

    const action = await prisma.aiActionLog.findFirst({
      where: { id, organizationId, userId }
    });

    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    if (action.status === "CANCELED") {
      res.status(409).json({ error: "Action was canceled" });
      return;
    }

    if (action.status === "CONFIRMED") {
      res.json({ ok: true, status: action.status, result: action.result ?? null });
      return;
    }

    if (action.status !== "PENDING") {
      res.status(409).json({ error: `Action is not pending (status=${action.status})` });
      return;
    }

    const payload = action.payload as any;
    const toolCalls = (payload?.plan?.toolCalls ?? []) as AiPlannedToolCall[];

    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      await prisma.aiActionLog.update({
        where: { id: action.id },
        data: { status: "FAILED", error: "No planned tool calls" }
      });
      res.status(400).json({ error: "No planned tool calls" });
      return;
    }

    try {
      const result = await prisma.$transaction(async () => {
        const outputs: unknown[] = [];
        for (const call of toolCalls) {
          if (!call || typeof call !== "object") {
            throw new Error("Invalid tool call");
          }
          const toolName = call.toolName as AiActionToolName;
          if (!supportedActionToolNames.includes(toolName)) {
            throw new Error(`Tool not permitted: ${String(toolName)}`);
          }
          const output = await executeActionTool(toolName, (call.args ?? {}) as Record<string, unknown>, {
            userId,
            organizationId
          });
          outputs.push({ toolName, output });
        }
        return outputs;
      });

      const updated = await prisma.aiActionLog.update({
        where: { id: action.id },
        data: {
          status: "CONFIRMED",
          result: result as any,
          error: null
        }
      });

      res.json({ ok: true, status: updated.status, result: updated.result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action execution failed";
      await prisma.aiActionLog.update({
        where: { id: action.id },
        data: {
          status: "FAILED",
          error: message
        }
      });
      res.status(400).json({ error: message });
    }
  })
);

router.post(
  "/cancel",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId;
    const userId = req.auth?.userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { actionId, planId } = req.body as CancelRequestBody;
    const id = String(actionId ?? planId ?? "").trim();
    if (!id) {
      res.status(400).json({ error: "actionId is required" });
      return;
    }

    const action = await prisma.aiActionLog.findFirst({
      where: { id, organizationId, userId }
    });

    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    if (action.status === "CONFIRMED") {
      res.status(409).json({ error: "Action already confirmed" });
      return;
    }

    if (action.status === "FAILED") {
      res.status(409).json({ error: "Action already failed" });
      return;
    }

    if (action.status === "CANCELED") {
      res.json({ ok: true, status: action.status });
      return;
    }

    const updated = await prisma.aiActionLog.update({
      where: { id: action.id },
      data: { status: "CANCELED" }
    });

    res.json({ ok: true, status: updated.status });
  })
);

export default router;
