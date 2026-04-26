import type { Request, Response, NextFunction } from "express";
import { refreshUserContextSoon } from "../lib/ai/user-context-service.js";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const skippedPrefixes = ["/api/chat", "/ai", "/api/agent", "/auth"];
const attachedRequests = new WeakSet<Request>();

export const agentContextRefreshOnMutation = (req: Request, res: Response, next: NextFunction) => {
  if (!mutationMethods.has(req.method)) {
    next();
    return;
  }

  if (attachedRequests.has(req)) {
    next();
    return;
  }
  attachedRequests.add(req);

  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    if (skippedPrefixes.some((prefix) => req.originalUrl.startsWith(prefix))) return;
    refreshUserContextSoon({ organizationId: req.auth?.organizationId, userId: req.auth?.userId });
  });

  next();
};
