import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { requireOrgRole } from "../middleware/roles.js";

const router: Router = Router();

const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

// Public-ish endpoint: accept an invite by token.
// If the user is not logged in, we allow creating a new user (requires password).
router.post(
  "/accept",
  asyncHandler(async (req, res) => {
    const { token, password, name } = req.body as { token?: string; password?: string; name?: string };
    if (!token) {
      res.status(400).json({ error: "token is required" });
      return;
    }

    const tokenHash = sha256Hex(token);
    const invite = await prisma.invitation.findUnique({ where: { tokenHash } });
    if (!invite) {
      res.status(404).json({ error: "Invalid invitation token" });
      return;
    }

    if (invite.acceptedAt) {
      res.status(409).json({ error: "Invitation already accepted" });
      return;
    }

    if (invite.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ error: "Invitation expired" });
      return;
    }

    const authedUserId = req.auth?.userId;
    const authedEmail = req.auth?.email;

    const result = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction for correctness.
      const current = await tx.invitation.findUnique({ where: { tokenHash } });
      if (!current || current.acceptedAt) {
        throw new Error("INVITE_ALREADY_USED");
      }

      if (authedUserId) {
        // Logged-in acceptance: must match email.
        if (!authedEmail || authedEmail.toLowerCase() !== current.email.toLowerCase()) {
          throw new Error("INVITE_EMAIL_MISMATCH");
        }

        // One org per user for now: disallow switching orgs.
        const existingMembership = await tx.membership.findUnique({ where: { userId: authedUserId } });
        if (existingMembership && existingMembership.organizationId !== current.organizationId) {
          throw new Error("USER_ALREADY_IN_OTHER_ORG");
        }

        // Ensure membership exists and role matches invite.
        const membership = existingMembership
          ? await tx.membership.update({ where: { id: existingMembership.id }, data: { role: current.role } })
          : await tx.membership.create({
              data: {
                userId: authedUserId,
                organizationId: current.organizationId,
                role: current.role
              }
            });

        await tx.user.update({ where: { id: authedUserId }, data: { defaultOrgId: current.organizationId } });

        const acceptedInvite = await tx.invitation.update({
          where: { id: current.id },
          data: { acceptedAt: new Date() }
        });

        return { userId: authedUserId, email: authedEmail, orgId: current.organizationId, role: membership.role, acceptedInvite };
      }

      // Not logged in. Either create a new user or (optionally) let an existing user accept by providing password.
      const existingUser = await tx.user.findUnique({ where: { email: current.email } });

      if (existingUser) {
        // For security, require password to accept for an existing user.
        if (!password) {
          throw new Error("PASSWORD_REQUIRED");
        }
        const valid = await bcrypt.compare(password, existingUser.passwordHash);
        if (!valid) {
          throw new Error("INVALID_CREDENTIALS");
        }

        const existingMembership = await tx.membership.findUnique({ where: { userId: existingUser.id } });
        if (existingMembership && existingMembership.organizationId !== current.organizationId) {
          throw new Error("USER_ALREADY_IN_OTHER_ORG");
        }

        const membership = existingMembership
          ? await tx.membership.update({ where: { id: existingMembership.id }, data: { role: current.role } })
          : await tx.membership.create({
              data: {
                userId: existingUser.id,
                organizationId: current.organizationId,
                role: current.role
              }
            });

        await tx.user.update({ where: { id: existingUser.id }, data: { defaultOrgId: current.organizationId } });

        const acceptedInvite = await tx.invitation.update({
          where: { id: current.id },
          data: { acceptedAt: new Date() }
        });

        return { userId: existingUser.id, email: existingUser.email, orgId: current.organizationId, role: membership.role, acceptedInvite };
      }

      // New user flow.
      if (!password) {
        throw new Error("PASSWORD_REQUIRED");
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await tx.user.create({
        data: {
          email: current.email,
          name,
          passwordHash,
          defaultOrgId: current.organizationId
        }
      });

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: current.organizationId,
          role: current.role
        }
      });

      const acceptedInvite = await tx.invitation.update({
        where: { id: current.id },
        data: { acceptedAt: new Date() }
      });

      return { userId: user.id, email: user.email, orgId: current.organizationId, role: membership.role, acceptedInvite };
    });

    const authToken = signToken({ id: result.userId, email: result.email, orgId: result.orgId, role: result.role as "OWNER" | "ADMIN" | "MEMBER" });
    res.json({
      token: authToken,
      organizationId: result.orgId,
      role: result.role,
      invitationId: result.acceptedInvite.id
    });
  })
);

// Protected endpoints below
router.use(requireAuth);

router.post(
  "/",
  requireOrgRole(["OWNER", "ADMIN"]),
  asyncHandler(async (req, res) => {
    const { email, role, expiresInDays } = req.body as {
      email?: string;
      role?: "OWNER" | "ADMIN" | "MEMBER";
      expiresInDays?: number;
    };

    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const inviteRole = role ?? "MEMBER";
    const days = expiresInDays && expiresInDays > 0 ? Math.min(expiresInDays, 30) : 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    // One org per user for now.
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      const membership = await prisma.membership.findUnique({ where: { userId: existingUser.id } });
      if (membership) {
        if (membership.organizationId === req.auth!.organizationId) {
          res.status(409).json({ error: "User is already a member of this organization" });
          return;
        }
        res.status(409).json({ error: "User already belongs to another organization" });
        return;
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      // Revoke any existing pending invite for this email/org.
      await tx.invitation.deleteMany({
        where: {
          organizationId: req.auth!.organizationId,
          email: normalizedEmail,
          acceptedAt: null
        }
      });

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = sha256Hex(token);

      const invite = await tx.invitation.create({
        data: {
          organizationId: req.auth!.organizationId,
          email: normalizedEmail,
          role: inviteRole,
          tokenHash,
          expiresAt,
          invitedByUserId: req.auth!.userId
        }
      });

      // Return token to the outer scope (never stored in plaintext).
      return { invite, token };
    });

    res.status(201).json({
      id: created.invite.id,
      email: created.invite.email,
      role: created.invite.role,
      token: created.token,
      expiresAt: created.invite.expiresAt
    });
  })
);

router.get(
  "/",
  requireOrgRole(["OWNER", "ADMIN"]),
  asyncHandler(async (req, res) => {
    const invites = await prisma.invitation.findMany({
      where: {
        organizationId: req.auth!.organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(
      invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt,
        invitedByUserId: i.invitedByUserId,
        createdAt: i.createdAt
      }))
    );
  })
);

router.delete(
  "/:id",
  requireOrgRole(["OWNER", "ADMIN"]),
  asyncHandler(async (req, res) => {
    const invite = await prisma.invitation.findFirst({
      where: { id: req.params.id, organizationId: req.auth!.organizationId, acceptedAt: null }
    });
    if (!invite) {
      res.status(404).json({ error: "Invitation not found" });
      return;
    }

    await prisma.invitation.delete({ where: { id: invite.id } });
    res.status(204).send();
  })
);

export default router;
