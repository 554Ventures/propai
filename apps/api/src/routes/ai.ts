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

const router: Router = Router();

type PlanRequestBody = {
  message?: string;
  scope?: {
    propertyId?: string;
  };
};

type ConfirmRequestBody = {
  actionId?: string;
};

type CancelRequestBody = {
  actionId?: string;
};

const buildSystemPrompt = () => {
  return [
    "You are PropAI Action Planner.",
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
    strict: false as const
  },
  {
    type: "function" as const,
    name: "createProperty",
    description: "Create a property.",
    parameters: {
      type: "object" as const,
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
    strict: false as const
  },
  {
    type: "function" as const,
    name: "createTenant",
    description: "Create a tenant.",
    parameters: {
      type: "object" as const,
      properties: {
        firstName: { type: "string" as const },
        lastName: { type: "string" as const },
        email: { type: "string" as const, nullable: true },
        phone: { type: "string" as const, nullable: true }
      },
      required: ["firstName", "lastName"] as const
    },
    strict: false as const
  },
  {
    type: "function" as const,
    name: "createMaintenanceRequest",
    description: "Create a maintenance request.",
    parameters: {
      type: "object" as const,
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
    strict: false as const
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

const planWithOpenAI = async (message: string) => {
  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const response: any = await client.responses.create({
    model,
    input: [
      { role: "system", content: buildSystemPrompt() },
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

    const { message, scope } = req.body as PlanRequestBody;
    const trimmedMessage = String(message ?? "").trim();
    if (!trimmedMessage) {
      res.status(400).json({ error: "message is required" });
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

router.post(
  "/confirm",
  asyncHandler(async (req, res) => {
    const organizationId = req.auth?.organizationId;
    const userId = req.auth?.userId;
    if (!organizationId || !userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { actionId } = req.body as ConfirmRequestBody;
    const id = String(actionId ?? "").trim();
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

    const { actionId } = req.body as CancelRequestBody;
    const id = String(actionId ?? "").trim();
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
