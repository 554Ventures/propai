import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = header.replace("Bearer ", "");
  try {
    // Kept sync signature, but we need async membership verification.
    // Delegate to next tick to avoid changing call sites.
    void (async () => {
      const payload = jwt.verify(token, getSecret()) as {
        sub?: string;
        email?: string;
        orgId?: string;
        role?: string;
      };

      if (!payload.sub || !payload.email || !payload.orgId) {
        res.status(401).json({ error: "Invalid token" });
        return;
      }

      const membership = await prisma.membership.findFirst({
        where: {
          userId: payload.sub,
          organizationId: payload.orgId
        }
      });

      if (!membership) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      req.user = { id: payload.sub, email: payload.email };
      req.auth = {
        userId: payload.sub,
        email: payload.email,
        organizationId: membership.organizationId,
        membershipId: membership.id,
        role: membership.role as "OWNER" | "ADMIN" | "MEMBER"
      };

      next();
    })().catch(() => {
      res.status(401).json({ error: "Invalid token" });
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const signToken = (args: { id: string; email: string; orgId: string; role: "OWNER" | "ADMIN" | "MEMBER" }) => {
  return jwt.sign({ sub: args.id, email: args.email, orgId: args.orgId, role: args.role }, getSecret(), { expiresIn: "7d" });
};
