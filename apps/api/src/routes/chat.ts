import { Router } from "express";
import prisma from "../lib/prisma";
import { asyncHandler } from "../utils/async-handler";
import { aiRateLimit } from "../middleware/ai-rate-limit";
import { getOpenAIClient, getOpenAIModel } from "../lib/openai";
import { chatToolDefinitions, executeChatTool } from "../lib/ai/chat-tools";
import type { ResponseFunctionToolCall } from "openai/resources/responses/responses";

const router = Router();

const buildSystemPrompt = (propertyName?: string | null) => {
  const scopeLine = propertyName
    ? `Current property context: ${propertyName}.`
    : "No single property is selected; aggregate across the portfolio unless specified.";

  return [
    "You are PropAI, an assistant for property managers.",
    scopeLine,
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
  asyncHandler(async (req, res) => {
    const { message, sessionId, propertyId } = req.body as {
      message?: string;
      sessionId?: string;
      propertyId?: string;
    };

    const trimmedMessage = message?.trim();
    if (!trimmedMessage) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const userId = req.user?.id ?? "";
    const client = getOpenAIClient();
    const model = getOpenAIModel();

    if (propertyId) {
      const property = await prisma.property.findFirst({
        where: { id: propertyId, userId },
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
        where: { id: sessionId, userId },
        include: { property: true }
      });
      if (!session) {
        res.status(404).json({ error: "Chat session not found" });
        return;
      }
    } else {
      session = await prisma.chatSession.create({
        data: {
          userId,
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
      { role: "system", content: buildSystemPrompt(session.property?.name ?? null) },
      ...orderedMessages.map((msg) => ({ role: msg.role as "user" | "assistant", content: msg.content }))
    ];

    let response = await client.responses.create({
      model,
      input,
      tools: chatToolDefinitions,
      temperature: 0.2,
      user: userId
    });

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
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
        } catch {
          parsedArgs = {};
        }

        try {
          const result = await executeChatTool(toolCall.name, parsedArgs, { userId });
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
    }

    const responseText = response.output_text?.trim() || "Sorry, I could not generate a response.";

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: responseText,
        metadata: {
          toolCalls: toolCallLogs,
          citations
        }
      }
    });

    if (toolCallLogs.length > 0) {
      await prisma.toolCallLog.createMany({
        data: toolCallLogs.map((log) => ({
          messageId: assistantMessage.id,
          toolName: log.toolName,
          inputs: log.inputs,
          outputs: log.outputs,
          status: log.status
        }))
      });
    }

    await prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() }
    });

    res.json({
      sessionId: session.id,
      response: responseText,
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
    const sessionId = req.query.sessionId as string | undefined;

    let session = null;
    if (sessionId) {
      session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId }
      });
    } else {
      session = await prisma.chatSession.findFirst({
        where: { userId },
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
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        metadata: message.metadata,
        createdAt: message.createdAt
      }))
    });
  })
);

export default router;
