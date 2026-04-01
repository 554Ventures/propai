import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth, signToken } from "../middleware/auth.js";

const router: Router = Router();

router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { email, password, name, organizationName } = req.body as {
      email?: string;
      password?: string;
      name?: string;
      organizationName?: string;
    };
    if (!email || !password || !organizationName) {
      res.status(400).json({ error: "Email, password, and organizationName are required" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const orgName = organizationName.trim();

    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: orgName
        }
      });

      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          defaultOrgId: organization.id
        }
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          role: "OWNER"
        }
      });

      return { user, organization, membership };
    });

    const token = signToken({
      id: result.user.id,
      email: result.user.email,
      orgId: result.organization.id,
      role: result.membership.role
    });

    res.status(201).json({
      token,
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      organization: { id: result.organization.id, name: result.organization.name },
      role: result.membership.role
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const orgId = user.defaultOrgId;

    let membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
      include: { organization: true }
    });

    if (!membership) {
      // Legacy user without a membership row (shouldn't happen post-migration).
      membership = await prisma.membership.create({
        data: { userId: user.id, organizationId: orgId, role: "OWNER" },
        include: { organization: true }
      });
    }

    if (!membership) {
      res.status(403).json({ error: "No organization membership" });
      return;
    }

    const token = signToken({ id: user.id, email: user.email, orgId, role: membership.role });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      organization: { id: membership.organization.id, name: membership.organization.name },
      role: membership.role
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth?.userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: req.auth!.userId, organizationId: req.auth!.organizationId } },
      include: { organization: true }
    });

    res.json({
      user: { id: user.id, email: user.email, name: user.name },
      organization: membership ? { id: membership.organization.id, name: membership.organization.name } : null,
      role: (membership?.role ?? req.auth!.role) as "OWNER" | "ADMIN" | "MEMBER"
    });
  })
);

export default router;
