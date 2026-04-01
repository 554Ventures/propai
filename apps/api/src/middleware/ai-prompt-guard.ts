import type { Request, Response, NextFunction } from "express";
import { detectPromptInjection } from "../security/prompt-injection.js";
import { logAiSecurityEvent } from "../security/security-logger.js";

export const aiPromptGuard = (req: Request, res: Response, next: NextFunction) => {
  const message = req.ai?.sanitizedMessage ?? req.body?.message ?? "";
  const result = detectPromptInjection(message);

  req.ai = {
    ...(req.ai ?? {}),
    promptInjectionMatches: result.matches
  };

  if (result.blocked) {
    logAiSecurityEvent({
      userId: req.user?.id ?? null,
      type: "prompt_injection",
      severity: result.severity === "high" ? "high" : "medium",
      message: "Prompt injection attempt blocked",
      metadata: { matches: result.matches }
    });
    res.status(400).json({ error: "Request blocked by AI security policy" });
    return;
  }

  next();
};
