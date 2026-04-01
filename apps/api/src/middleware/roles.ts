import type { Request, Response, NextFunction } from "express";

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

export const requireOrgRole = (allowed: OrgRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.auth?.role as OrgRole | undefined;
    if (!role) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!allowed.includes(role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
};

