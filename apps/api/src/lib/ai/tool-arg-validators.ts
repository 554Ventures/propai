import type { AiActionToolName } from "./action-tools.js";

export const sanitizeObject = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
};

export const validateChatToolArgs = (toolName: string, args: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } => {
  const obj = sanitizeObject(args);

  const pick = (keys: string[]) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
  };

  // Minimal allowlists per tool (drop unknown keys).
  switch (toolName) {
    case "listProperties":
      return { ok: true, value: {} };

    case "getOutstandingRent": {
      return { ok: true, value: pick(["propertyId", "propertyName"]) };
    }

    case "getRentCollected":
    case "getPropertyExpenses":
    case "getVacancies":
    case "getLeaseExpirations": {
      const v = pick(["range", "propertyId", "propertyName"]);
      if (!v.range) return { ok: false, error: "range is required" };
      return { ok: true, value: v };
    }

    case "searchDocuments": {
      const v = pick(["query", "propertyId", "propertyName"]);
      if (!v.query) return { ok: false, error: "query is required" };
      return { ok: true, value: v };
    }

    default:
      // Unknown tool: reject.
      return { ok: false, error: "Unknown tool" };
  }
};

export const validateWriteToolArgs = (toolName: AiActionToolName, args: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } => {
  const obj = sanitizeObject(args);

  const pick = (keys: string[]) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
  };

  // Only allow known keys; leave type conversions to downstream validation.
  if (toolName === "createProperty") {
    return {
      ok: true,
      value: pick(["name", "addressLine1", "addressLine2", "city", "state", "postalCode", "country", "notes"])
    };
  }

  if (toolName === "createCashflowTransaction") {
    return {
      ok: true,
      value: pick(["type", "amount", "date", "category", "propertyId", "notes"])
    };
  }

  if (toolName === "createTenant") {
    return {
      ok: true,
      value: pick(["firstName", "lastName", "email", "phone"])
    };
  }

  if (toolName === "createMaintenanceRequest") {
    return {
      ok: true,
      value: pick(["propertyId", "unitId", "tenantId", "title", "description", "cost"])
    };
  }

  return { ok: false, error: "Unknown tool" };
};
