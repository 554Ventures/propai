import prisma from "../prisma.js";

export type AiActionToolName =
  | "createCashflowTransaction"
  | "createProperty"
  | "createTenant"
  | "createMaintenanceRequest";

export type AiPlannedToolCall = {
  toolName: AiActionToolName;
  args: Record<string, unknown>;
};

export type AiActionPlan = {
  summary: string;
  toolCalls: AiPlannedToolCall[];
};

export type ActionExecutionContext = {
  userId: string;
  organizationId: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
};

const asOptionalString = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return asString(value);
};

const asNumber = (value: unknown) => {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
};

const asPositiveNumber = (value: unknown) => {
  const n = asNumber(value);
  if (n == null) return null;
  return n > 0 ? n : null;
};

const asDate = (value: unknown) => {
  const s = asString(value);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

export const supportedActionToolNames: AiActionToolName[] = [
  "createCashflowTransaction",
  "createProperty",
  "createTenant",
  "createMaintenanceRequest"
];

/**
 * Zero-dependency parser used when OPENAI is unavailable.
 * Accepts JSON messages like:
 * {"tool":"createProperty","args":{...}}
 * {"actionType":"createTenant","payload":{...}}
 * {"toolCalls":[{"toolName":"createCashflowTransaction","args":{...}}]}
 */
export const parseMessageToToolCalls = (message: string): AiPlannedToolCall[] => {
  const trimmed = message.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        if (Array.isArray(parsed.toolCalls)) {
          return parsed.toolCalls
            .map((call) => {
              if (!isRecord(call)) return null;
              const toolName = asString(call.toolName ?? call.tool ?? call.name);
              const args = isRecord(call.args) ? call.args : isRecord(call.arguments) ? call.arguments : {};
              if (!toolName) return null;
              if (!supportedActionToolNames.includes(toolName as AiActionToolName)) return null;
              return { toolName: toolName as AiActionToolName, args };
            })
            .filter(Boolean) as AiPlannedToolCall[];
        }

        const toolName = asString(parsed.tool ?? parsed.toolName ?? parsed.actionType ?? parsed.name);
        const args = isRecord(parsed.args) ? parsed.args : isRecord(parsed.payload) ? parsed.payload : {};
        if (toolName && supportedActionToolNames.includes(toolName as AiActionToolName)) {
          return [{ toolName: toolName as AiActionToolName, args }];
        }
      }
    } catch {
      // ignore
    }
  }

  return [];
};

const ensurePropertyInOrg = async (organizationId: string, propertyId: string) => {
  const ok = await prisma.property.findFirst({
    where: { id: propertyId, organizationId },
    select: { id: true }
  });
  return Boolean(ok);
};

const ensureUnitInOrg = async (organizationId: string, unitId: string) => {
  const ok = await prisma.unit.findFirst({
    where: { id: unitId, organizationId },
    select: { id: true, propertyId: true }
  });
  return ok;
};

const ensureTenantInOrg = async (organizationId: string, tenantId: string) => {
  const ok = await prisma.tenant.findFirst({
    where: { id: tenantId, organizationId },
    select: { id: true }
  });
  return Boolean(ok);
};

export const executeActionTool = async (toolName: AiActionToolName, args: Record<string, unknown>, ctx: ActionExecutionContext) => {
  const userId = ctx.userId;
  const organizationId = ctx.organizationId;

  switch (toolName) {
    case "createCashflowTransaction": {
      const typeRaw = asString(args.type);
      const type = typeRaw?.toLowerCase() === "income" || typeRaw === "INCOME" ? "INCOME" : typeRaw?.toLowerCase() === "expense" || typeRaw === "EXPENSE" ? "EXPENSE" : null;
      if (!type) throw new Error("type is required (income|expense)");

      const amount = asPositiveNumber(args.amount);
      if (amount == null) throw new Error("amount must be a positive number");

      const date = asDate(args.date);
      if (!date) throw new Error("date is required and must be a valid ISO date");

      const category = asString(args.category);
      if (!category) throw new Error("category is required");

      const propertyId = asOptionalString(args.propertyId);
      if (propertyId) {
        const ok = await ensurePropertyInOrg(organizationId, propertyId);
        if (!ok) throw new Error("Invalid propertyId");
      }

      const notes = asOptionalString(args.notes);

      return prisma.transaction.create({
        data: {
          organizationId,
          userId,
          type,
          amount,
          date,
          category,
          propertyId: propertyId ?? undefined,
          notes: notes ?? undefined
        }
      });
    }

    case "createProperty": {
      const name = asString(args.name);
      const addressLine1 = asString(args.addressLine1);
      const city = asString(args.city);
      const state = asString(args.state);
      const postalCode = asString(args.postalCode);
      if (!name || !addressLine1 || !city || !state || !postalCode) {
        throw new Error("Missing required fields: name, addressLine1, city, state, postalCode");
      }

      const addressLine2 = asOptionalString(args.addressLine2);
      const country = asString(args.country) ?? "US";
      const notes = asOptionalString(args.notes);

      return prisma.property.create({
        data: {
          userId,
          organizationId,
          name,
          addressLine1,
          addressLine2: addressLine2 ?? undefined,
          city,
          state,
          postalCode,
          country,
          notes: notes ?? undefined
        }
      });
    }

    case "createTenant": {
      const firstName = asString(args.firstName);
      const lastName = asString(args.lastName);
      if (!firstName || !lastName) {
        throw new Error("Missing required fields: firstName, lastName");
      }
      const email = asOptionalString(args.email);
      const phone = asOptionalString(args.phone);

      return prisma.tenant.create({
        data: {
          userId,
          organizationId,
          firstName,
          lastName,
          email: email ?? undefined,
          phone: phone ?? undefined
        }
      });
    }

    case "createMaintenanceRequest": {
      const propertyId = asString(args.propertyId);
      const title = asString(args.title);
      if (!propertyId || !title) {
        throw new Error("Missing required fields: propertyId, title");
      }

      const okProperty = await ensurePropertyInOrg(organizationId, propertyId);
      if (!okProperty) throw new Error("Invalid propertyId");

      const unitId = asOptionalString(args.unitId);
      if (unitId) {
        const unit = await ensureUnitInOrg(organizationId, unitId);
        if (!unit) throw new Error("Invalid unitId");
      }

      const tenantId = asOptionalString(args.tenantId);
      if (tenantId) {
        const okTenant = await ensureTenantInOrg(organizationId, tenantId);
        if (!okTenant) throw new Error("Invalid tenantId");
      }

      const description = asOptionalString(args.description);
      const cost = args.cost == null ? undefined : asPositiveNumber(args.cost) ?? null;
      if (cost === null) throw new Error("cost must be a positive number");

      return prisma.maintenanceRequest.create({
        data: {
          userId,
          organizationId,
          propertyId,
          unitId: unitId ?? undefined,
          tenantId: tenantId ?? undefined,
          title,
          description: description ?? undefined,
          cost: cost ?? undefined
        }
      });
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};
