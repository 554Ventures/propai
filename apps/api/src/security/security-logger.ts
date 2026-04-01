import prisma from "../lib/prisma.js";

export type SecurityEventInput = {
  userId?: string | null;
  sessionId?: string | null;
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
  metadata?: Record<string, unknown>;
};

export const logAiSecurityEvent = async (event: SecurityEventInput) => {
  try {
    await prisma.aiSecurityEvent.create({
      data: {
        userId: event.userId ?? null,
        sessionId: event.sessionId ?? null,
        type: event.type,
        severity: event.severity,
        message: event.message,
        metadata: (event.metadata ?? {}) as any
      }
    });
  } catch (error) {
    // Avoid breaking request flow if logging fails.
    console.error("Failed to log AI security event", error);
  }
};
