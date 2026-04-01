import type { Request, Response, NextFunction } from "express";
import { sanitizeUserInput } from "../security/sanitize.js";
import { logAiSecurityEvent } from "../security/security-logger.js";

const maxLength = Number(process.env.AI_MAX_MESSAGE_CHARS ?? 4000);

export const aiInputSanitizer = (req: Request, res: Response, next: NextFunction) => {
  const message = req.body?.message;

  if (typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const result = sanitizeUserInput(message, maxLength);
  req.ai = {
    ...(req.ai ?? {}),
    originalMessage: result.original,
    sanitizedMessage: result.sanitized
  };

  if (!result.sanitized) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  if (result.truncated || result.removedCharacters) {
    logAiSecurityEvent({
      userId: req.user?.id ?? null,
      type: "input_sanitized",
      severity: "low",
      message: "Input sanitized before AI processing",
      metadata: {
        truncated: result.truncated,
        removedCharacters: result.removedCharacters
      }
    });
  }

  next();
};
