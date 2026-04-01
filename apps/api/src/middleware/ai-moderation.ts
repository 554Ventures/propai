import type { Request, Response, NextFunction } from "express";
import { moderateText } from "../security/moderation.js";
import { logAiSecurityEvent } from "../security/security-logger.js";

const moderationEnabled = process.env.AI_MODERATION_ENABLED !== "false";

export const aiModeration = async (req: Request, res: Response, next: NextFunction) => {
  if (!moderationEnabled) {
    next();
    return;
  }

  const message = req.ai?.sanitizedMessage ?? req.body?.message ?? "";

  try {
    const result = await moderateText(message);
    req.ai = {
      ...(req.ai ?? {}),
      moderation: {
        flagged: result.flagged,
        categories: result.categories
      }
    };

    if (result.flagged) {
      await logAiSecurityEvent({
        userId: req.user?.id ?? null,
        type: "moderation_flag",
        severity: "high",
        message: "User input flagged by moderation",
        metadata: {
          categories: result.categories,
          model: result.model
        }
      });
      res.status(400).json({ error: "Request violates content policy" });
      return;
    }

    next();
  } catch (error) {
    await logAiSecurityEvent({
      userId: req.user?.id ?? null,
      type: "moderation_error",
      severity: "high",
      message: "Moderation service failed",
      metadata: { error: error instanceof Error ? error.message : "unknown" }
    });
    res.status(503).json({ error: "Content moderation unavailable" });
  }
};
