import prisma from "../prisma.js";
import { executeActionTool, type AiActionToolName } from "./action-tools.js";
import { validateWriteToolArgs } from "./tool-arg-validators.js";

export type Agent2ToolKind = "read" | "write";

export type Agent2ToolCall = {
  publicName: string;
  internalName?: AiActionToolName;
  args: Record<string, unknown>;
  kind: Agent2ToolKind;
};

export type Agent2ExecutionContext = {
  userId: string;
  organizationId: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export const agent2ToolDefinitions = [
  {
    type: "function" as const,
    name: "get_properties",
    description: "List properties, unit counts, occupancy, and address details for the authenticated organization.",
    parameters: { type: "object" as const, additionalProperties: false as const, properties: {} },
    strict: true as const
  },
  {
    type: "function" as const,
    name: "get_tenants",
    description: "List tenants with active lease, property, unit, rent, and contact details for the authenticated organization.",
    parameters: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {
        status: { type: "string" as const, description: "Optional filter: active or all" }
      }
    },
    strict: false as const
  },
  {
    type: "function" as const,
    name: "get_financials",
    description: "Get income, expense, net, and outstanding payment summary for a date range.",
    parameters: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {
        startDate: { type: "string" as const, description: "YYYY-MM-DD" },
        endDate: { type: "string" as const, description: "YYYY-MM-DD" },
        propertyId: { type: "string" as const }
      }
    },
    strict: false as const
  },
  {
    type: "function" as const,
    name: "create_property",
    description: "Draft creation of a property. Requires confirmation before execution.",
    parameters: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {
        name: { type: "string" as const },
        addressLine1: { type: "string" as const },
        city: { type: "string" as const },
        state: { type: "string" as const },
        postalCode: { type: "string" as const },
        country: { type: "string" as const },
        notes: { type: "string" as const }
      }
    },
    strict: false as const
  },
  {
    type: "function" as const,
    name: "create_tenant",
    description: "Draft creation of a tenant. Requires confirmation before execution.",
    parameters: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {
        firstName: { type: "string" as const },
        lastName: { type: "string" as const },
        email: { type: "string" as const },
        phone: { type: "string" as const }
      }
    },
    strict: false as const
  },
  {
    type: "function" as const,
    name: "log_payment",
    description: "Draft a rent payment or income transaction. Requires confirmation before execution.",
    parameters: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {
        amount: { type: "number" as const },
        date: { type: "string" as const, description: "YYYY-MM-DD" },
        category: { type: "string" as const, description: "Defaults to Rent if omitted" },
        propertyId: { type: "string" as const },
        notes: { type: "string" as const }
      }
    },
    strict: false as const
  }
];

const writeNameMap: Record<string, AiActionToolName> = {
  create_property: "createProperty",
  create_tenant: "createTenant",
  log_payment: "createCashflowTransaction"
};

export const isAgent2WriteTool = (name: string) => Boolean(writeNameMap[name]);
export const isAgent2ReadTool = (name: string) => ["get_properties", "get_tenants", "get_financials"].includes(name);

export const toInternalWriteTool = (publicName: string): AiActionToolName | null => writeNameMap[publicName] ?? null;

export const normalizeAgent2WriteArgs = (publicName: string, args: Record<string, unknown>) => {
  if (publicName === "log_payment") {
    return {
      type: "income",
      category: args.category ?? "Rent",
      date: args.date ?? todayISO(),
      amount: args.amount,
      propertyId: args.propertyId,
      notes: args.notes
    };
  }
  return args;
};

export const validateAgent2WriteCall = (publicName: string, args: Record<string, unknown>) => {
  const internalName = toInternalWriteTool(publicName);
  if (!internalName) return { ok: false as const, error: "Unknown write tool" };
  const normalized = normalizeAgent2WriteArgs(publicName, args);
  return validateWriteToolArgs(internalName, normalized);
};

const hasValue = (args: Record<string, unknown>, key: string) => {
  const value = args[key];
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
};

export const getMissingAgent2Fields = (publicName: string, args: Record<string, unknown>) => {
  const missing: string[] = [];
  if (publicName === "create_property") {
    for (const field of ["name", "addressLine1", "city", "state", "postalCode"]) {
      if (!hasValue(args, field)) missing.push(field);
    }
  }
  if (publicName === "create_tenant") {
    for (const field of ["firstName", "lastName", "email", "phone"]) {
      if (!hasValue(args, field)) missing.push(field);
    }
  }
  if (publicName === "log_payment") {
    for (const field of ["amount"]) {
      if (!hasValue(args, field)) missing.push(field);
    }
  }
  return missing;
};

export const buildAgent2DraftSummary = (publicName: string, args: Record<string, unknown>) => {
  if (publicName === "create_property") {
    return [
      "Create property:",
      `- Name: ${args.name ?? ""}`,
      `- Address: ${args.addressLine1 ?? ""}, ${args.city ?? ""}, ${args.state ?? ""} ${args.postalCode ?? ""}`
    ].join("\n");
  }
  if (publicName === "create_tenant") {
    return [
      "Create tenant:",
      `- Name: ${args.firstName ?? ""} ${args.lastName ?? ""}`.trim(),
      `- Email: ${args.email ?? ""}`,
      `- Phone: ${args.phone ?? ""}`
    ].join("\n");
  }
  if (publicName === "log_payment") {
    return [
      "Log payment:",
      `- Amount: ${args.amount ?? ""}`,
      `- Date: ${args.date ?? todayISO()}`,
      `- Category: ${args.category ?? "Rent"}`
    ].join("\n");
  }
  return `Run ${publicName}`;
};

export const executeAgent2ReadTool = async (name: string, args: Record<string, unknown>, ctx: Agent2ExecutionContext) => {
  const organizationId = ctx.organizationId;

  if (name === "get_properties") {
    const properties = await prisma.property.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      include: { units: { where: { archivedAt: null }, include: { leases: { where: { status: "ACTIVE" } } } } }
    });
    return properties.map((property) => {
      const unitCount = property.units.length;
      const occupiedCount = property.units.filter((unit) => unit.leases.length > 0).length;
      return {
        id: property.id,
        name: property.name,
        address: `${property.addressLine1}, ${property.city}, ${property.state} ${property.postalCode}`,
        unitCount,
        occupiedCount,
        vacancyCount: Math.max(0, unitCount - occupiedCount)
      };
    });
  }

  if (name === "get_tenants") {
    const activeOnly = String(args.status ?? "active").toLowerCase() !== "all";
    const tenants = await prisma.tenant.findMany({
      where: { organizationId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: { leases: { where: activeOnly ? { status: "ACTIVE" } : {}, include: { property: true, unit: true } } }
    });
    return tenants.map((tenant) => {
      const lease = tenant.leases[0];
      return {
        id: tenant.id,
        name: `${tenant.firstName} ${tenant.lastName}`.trim(),
        email: tenant.email,
        phone: tenant.phone,
        activeLease: lease
          ? {
              id: lease.id,
              property: lease.property.name,
              unit: lease.unit.label,
              rent: lease.rent,
              startDate: lease.startDate,
              endDate: lease.endDate,
              status: lease.status
            }
          : null
      };
    });
  }

  if (name === "get_financials") {
    const now = new Date();
    const startDate = args.startDate ? new Date(String(args.startDate)) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = args.endDate ? new Date(String(args.endDate)) : now;
    const propertyId = typeof args.propertyId === "string" && args.propertyId.trim() ? args.propertyId.trim() : undefined;

    if (propertyId) {
      const property = await prisma.property.findFirst({ where: { id: propertyId, organizationId }, select: { id: true } });
      if (!property) throw new Error("Property not found or access denied");
    }

    const [transactions, outstanding] = await Promise.all([
      prisma.transaction.findMany({
        where: { organizationId, date: { gte: startDate, lte: endDate }, ...(propertyId ? { propertyId } : {}) }
      }),
      prisma.payment.findMany({
        where: {
          organizationId,
          ...(propertyId ? { propertyId } : {}),
          OR: [{ status: "LATE" }, { status: "PENDING", dueDate: { lt: now } }]
        }
      })
    ]);

    const totals = transactions.reduce(
      (acc, tx) => {
        const amount = Number(tx.amount ?? 0);
        if (tx.type === "INCOME") acc.income += amount;
        if (tx.type === "EXPENSE") acc.expenses += amount;
        return acc;
      },
      { income: 0, expenses: 0 }
    );
    const outstandingTotal = outstanding.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
    return {
      range: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      income: totals.income,
      expenses: totals.expenses,
      net: totals.income - totals.expenses,
      outstanding: outstandingTotal,
      outstandingCount: outstanding.length
    };
  }

  throw new Error("Unknown read tool");
};

export const executeAgent2WriteTool = async (publicName: string, args: Record<string, unknown>, ctx: Agent2ExecutionContext) => {
  const internalName = toInternalWriteTool(publicName);
  if (!internalName) throw new Error("Unknown write tool");
  const normalized = normalizeAgent2WriteArgs(publicName, args);
  return executeActionTool(internalName, normalized, ctx);
};
