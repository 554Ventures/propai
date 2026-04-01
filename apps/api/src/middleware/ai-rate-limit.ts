import type { Request, Response, NextFunction } from "express";
import { logAiSecurityEvent } from "../security/security-logger.js";

type Bucket = { count: number; resetAt: number };

type LimitConfig = {
  name: string;
  scope: "user" | "ip";
  windowMs: number;
  max: number;
};

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const limiters: LimitConfig[] = [
  {
    name: "user_hour",
    scope: "user",
    windowMs: parseNumber(process.env.AI_RATE_LIMIT_USER_HOURLY_WINDOW_MS, 60 * 60 * 1000),
    max: parseNumber(process.env.AI_RATE_LIMIT_USER_HOURLY_MAX, 20)
  },
  {
    name: "user_day",
    scope: "user",
    windowMs: parseNumber(process.env.AI_RATE_LIMIT_USER_DAILY_WINDOW_MS, 24 * 60 * 60 * 1000),
    max: parseNumber(process.env.AI_RATE_LIMIT_USER_DAILY_MAX, 100)
  },
  {
    name: "ip_hour",
    scope: "ip",
    windowMs: parseNumber(process.env.AI_RATE_LIMIT_IP_HOURLY_WINDOW_MS, 60 * 60 * 1000),
    max: parseNumber(process.env.AI_RATE_LIMIT_IP_HOURLY_MAX, 60)
  },
  {
    name: "ip_day",
    scope: "ip",
    windowMs: parseNumber(process.env.AI_RATE_LIMIT_IP_DAILY_WINDOW_MS, 24 * 60 * 60 * 1000),
    max: parseNumber(process.env.AI_RATE_LIMIT_IP_DAILY_MAX, 300)
  }
];

const legacyWindowMs = parseNumber(process.env.AI_RATE_LIMIT_WINDOW_MS, 0);
const legacyMax = parseNumber(process.env.AI_RATE_LIMIT_MAX, 0);
if (legacyWindowMs > 0 && legacyMax > 0) {
  limiters.push({
    name: "legacy_burst",
    scope: "user",
    windowMs: legacyWindowMs,
    max: legacyMax
  });
}

const buckets = new Map<string, Bucket>();

const getIdentifier = (req: Request, scope: LimitConfig["scope"]) => {
  if (scope === "user") {
    return req.user?.id ?? null;
  }
  return req.ip ?? null;
};

const checkLimit = (key: string, config: LimitConfig) => {
  const now = Date.now();
  const bucketKey = `${config.name}:${key}`;
  const bucket = buckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (bucket.count >= config.max) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
};

export const aiRateLimit = (req: Request, res: Response, next: NextFunction) => {
  for (const config of limiters) {
    const identifier = getIdentifier(req, config.scope);
    if (!identifier) continue;

    const result = checkLimit(identifier, config);
    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfter));
      logAiSecurityEvent({
        userId: req.user?.id ?? null,
        type: "rate_limit",
        severity: "medium",
        message: `Rate limit exceeded: ${config.name}`,
        metadata: {
          scope: config.scope,
          identifier: config.scope === "ip" ? identifier : undefined,
          windowMs: config.windowMs,
          max: config.max
        }
      });
      res.status(429).json({ error: "AI rate limit exceeded" });
      return;
    }
  }

  next();
};
