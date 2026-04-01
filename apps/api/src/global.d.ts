import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
      auth?: {
        userId: string;
        email: string;
        organizationId: string;
        membershipId: string;
        role: "OWNER" | "ADMIN" | "MEMBER";
      };

      /**
       * Org-first auth context.
       * For now: one org per user (no org switching).
       */
      auth?: {
        userId: string;
        email: string;
        organizationId: string;
        membershipId: string;
        role: "OWNER" | "ADMIN" | "MEMBER";
      };
      ai?: {
        originalMessage?: string;
        sanitizedMessage?: string;
        promptInjectionMatches?: string[];
        moderation?: {
          flagged: boolean;
          categories: Record<string, boolean>;
        };
      };
    }
  }
}

export {};
