import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { aiRateLimit } from "../middleware/ai-rate-limit.js";
import { aiInputSanitizer } from "../middleware/ai-input-sanitizer.js";
import { aiPromptGuard } from "../middleware/ai-prompt-guard.js";
import { aiModeration } from "../middleware/ai-moderation.js";
import { aiBudgetGuard } from "../middleware/ai-budget-guard.js";
import { getOpenAIClient, getOpenAIModel } from "../lib/openai.js";
import { chatToolDefinitions, executeChatTool } from "../lib/ai/chat-tools.js";
import type { ResponseFunctionToolCall } from "openai/resources/responses/responses";
import { filterAiOutput } from "../security/output-filter.js";
import { moderateText } from "../security/moderation.js";
import { calculateAiCostUsd, emptyUsage, mergeUsage } from "../security/costs.js";
import { extractUsage } from "../security/usage.js";
import { logAiSecurityEvent } from "../security/security-logger.js";
import { updateChatSessionRollingSummary } from "../lib/ai/rolling-summary.js";

const router: Router = Router();
const allowedToolNames = new Set(chatToolDefinitions.map((tool) => tool.name));

const buildSystemPrompt = (opts: { propertyName?: string | null; sessionSummary?: string | null }) => {
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

const extractToolCalls = (response: { output?: unknown[] }): ResponseFunctionToolCall[] => {
  if (!Array.isArray(response.output)) return [];
  return response.output.filter(
    (item): item is ResponseFunctionToolCall =>
      typeof item === "object" && item !== null && "type" in item && item.type === "function_call"
  );
};

router.post(
  "/",
  aiRateLimit,
  aiInputSanitizer,
  aiPromptGuard,
  aiModeration,
  aiBudgetGuard,
  asyncHandler(async (req, res) => {
    const { message, sessionId, propertyId } = req.body as {
      message?: string;
      sessionId?: string;
      propertyId?: string;
    };

    const trimmedMessage = req.ai?.sanitizedMessage ?? message?.trim();
    if (!trimmedMessage) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const userId = req.user?.id ?? "";
    const organizationId = req.auth?.organizationId ?? "";
    const client = getOpenAIClient();
    const model = getOpenAIModel();

    if (propertyId) {
      const property = await prisma.property.findFirst({
        where: { id: propertyId, organizationId },
        select: { id: true, name: true }
      });
      if (!property) {
        res.status(403).json({ error: "Property access denied" });
        return;
      }
    }

    let session = null;
    if (sessionId) {
      session = await prisma.chatSession.findFirst({
        where: { id: sessionId, organizationId, userId },
        include: { property: true }
      });
      // If session not found (stale ID), create a new one instead of erroring
      if (!session) {
        session = await prisma.chatSession.create({
          data: {
            userId,
            organizationId,
            propertyId: propertyId ?? null
          },
          include: { property: true }
        });
      }
    } else {
      session = await prisma.chatSession.create({
        data: {
          userId,
          organizationId,
          propertyId: propertyId ?? null
        },
        include: { property: true }
      });
    }

    if (sessionId && propertyId && session.propertyId !== propertyId) {
      session = await prisma.chatSession.update({
        where: { id: session.id },
        data: { propertyId },
        include: { property: true }
      });
    }

    await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "user",
        content: trimmedMessage
      }
    });

    const recentMessages = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    const orderedMessages = recentMessages.reverse();

    const input = [
      {
        role: "system",
        content: buildSystemPrompt({
          propertyName: session.property?.name ?? null,
          sessionSummary: (session as any).summary ?? null
        })
      },
      ...orderedMessages.map((msg) => ({ role: msg.role as "user" | "assistant", content: msg.content }))
    ];

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
      const toolCalls = extractToolCalls(response);
      if (toolCalls.length === 0) {
        break;
      }

      const toolOutputs = [] as Array<{ type: "function_call_output"; call_id: string; output: string }>;

      for (const toolCall of toolCalls) {
        if (!allowedToolNames.has(toolCall.name)) {
          await logAiSecurityEvent({
            userId,
            sessionId: session.id,
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
          if (result.citations) {
            citations.push(...result.citations);
          }

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
            sessionId: session.id,
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
          sessionId: session.id,
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
        sessionId: session.id,
        type: "output_blocked",
        severity: "high",
        message: "Assistant output blocked by safety filter",
        metadata: { reason: outputBlockedReason }
      });
    }

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: safeResponseText,
        metadata: {
          toolCalls: toolCallLogs as any,
          citations: citations as any,
          outputBlockedReason: outputBlockedReason ?? null
        }
      }
    });

    // Update rolling summary/title after an assistant message is stored.
    try {
      await updateChatSessionRollingSummary({
        sessionId: session.id,
        organizationId,
        userId
      });
    } catch {
      // best-effort
    }

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

    await prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() }
    });

    const costUsd = calculateAiCostUsd(usageSnapshot);
    await prisma.aiUsage.create({
      data: {
        userId,
        organizationId,
        sessionId: session.id,
        messageId: assistantMessage.id,
        model,
        inputTokens: usageSnapshot.inputTokens,
        outputTokens: usageSnapshot.outputTokens,
        totalTokens: usageSnapshot.totalTokens,
        costUsd: costUsd > 0 ? costUsd : null
      }
    });

    res.json({
      sessionId: session.id,
      response: safeResponseText,
      citations,
      toolCalls: toolCallLogs
    });
  })
);

router.get(
  "/history",
  aiRateLimit,
  asyncHandler(async (req, res) => {
    const userId = req.user?.id ?? "";
    const organizationId = req.auth?.organizationId ?? "";
    const sessionId = req.query.sessionId as string | undefined;

    let session = null;
    if (sessionId) {
      session = await prisma.chatSession.findFirst({
        where: { id: sessionId, organizationId, userId }
      });
    } else {
      session = await prisma.chatSession.findFirst({
        where: { organizationId, userId },
        orderBy: { updatedAt: "desc" }
      });
    }

    if (!session) {
      res.json({ sessionId: null, messages: [] });
      return;
    }

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" }
    });

    res.json({
      sessionId: session.id,
      messages: messages.map((message: any) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt
      }))
    });
  })
);

// Session management endpoints (private per user + org)
router.get(
  "/sessions",
  asyncHandler(async (req, res) => {
    const userId = req.user?.id ?? "";
    const organizationId = req.auth?.organizationId ?? "";

    const sessions = await prisma.chatSession.findMany({
      where: { userId, organizationId },
      orderBy: { updatedAt: "desc" },
      include: {
        property: { select: { id: true, name: true } }
      }
    });

    res.json(
      sessions.map((session) => ({
        id: session.id,
        title: (session as any).title ?? null,
        summary: (session as any).summary ?? null,
        propertyId: session.propertyId,
        property: session.property,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }))
    );
  })
);

router.post(
  "/sessions",
  asyncHandler(async (req, res) => {
    const userId = req.user?.id ?? "";
    const organizationId = req.auth?.organizationId ?? "";
    const { propertyId } = req.body as { propertyId?: string | null };

    if (propertyId) {
      const property = await prisma.property.findFirst({
        where: { id: propertyId, organizationId },
        select: { id: true }
      });
      if (!property) {
        res.status(403).json({ error: "Property access denied" });
        return;
      }
    }

    const session = await prisma.chatSession.create({
      data: {
        userId,
        organizationId,
        propertyId: propertyId ?? null
      },
      include: { property: { select: { id: true, name: true } } }
    });

    res.status(201).json({
      id: session.id,
      title: (session as any).title ?? null,
      summary: (session as any).summary ?? null,
      propertyId: session.propertyId,
      property: session.property,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    });
  })
);

router.post(
  "/sessions/:id/clear",
  asyncHandler(async (req, res) => {
    const userId = req.user?.id ?? "";
    const organizationId = req.auth?.organizationId ?? "";
    const sessionId = req.params.id;

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId, organizationId },
      select: { id: true }
    });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // Delete tool call logs first (defensive; also covered by FK cascade in newer schema)
    const messageIds = await prisma.chatMessage.findMany({
      where: { sessionId },
      select: { id: true }
    });
    const ids = messageIds.map((m) => m.id);
    if (ids.length > 0) {
      await prisma.toolCallLog.deleteMany({ where: { messageId: { in: ids } } });
    }
    await prisma.chatMessage.deleteMany({ where: { sessionId } });

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    });

    res.json({ ok: true });
  })
);

router.delete(
  "/sessions/:id",
  asyncHandler(async (req, res) => {
    const userId = req.user?.id ?? "";
    const organizationId = req.auth?.organizationId ?? "";
    const sessionId = req.params.id;

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId, organizationId },
      select: { id: true }
    });
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // Delete children defensively (also covered by FK cascade in newer schema)
    const messageIds = await prisma.chatMessage.findMany({
      where: { sessionId },
      select: { id: true }
    });
    const ids = messageIds.map((m) => m.id);
    if (ids.length > 0) {
      await prisma.toolCallLog.deleteMany({ where: { messageId: { in: ids } } });
    }
    await prisma.chatMessage.deleteMany({ where: { sessionId } });
    await prisma.chatSession.delete({ where: { id: sessionId } });

    res.json({ ok: true });
  })
);

export default router;
