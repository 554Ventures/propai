import prisma from "../prisma.js";

export type DateRangeInput =
  | string
  | {
      start?: string;
      end?: string;
      preset?: string;
    };

export type ResolvedDateRange = {
  start: Date;
  end: Date;
  label: string;
};

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const endOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const presetRanges = (now: Date) => {
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const startThisYear = new Date(now.getFullYear(), 0, 1);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    last_month: { start: startLastMonth, end: endLastMonth, label: "last_month" },
    month_to_date: { start: startThisMonth, end: now, label: "month_to_date" },
    year_to_date: { start: startThisYear, end: now, label: "year_to_date" },
    last_30_days: { start: last30Days, end: now, label: "last_30_days" }
  } as const;
};

export const resolveDateRange = (input?: DateRangeInput): ResolvedDateRange => {
  const now = new Date();
  const presets = presetRanges(now);

  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase().replace(/\s+/g, "_");
    const preset = presets[normalized as keyof typeof presets];
    if (preset) {
      return {
        start: startOfDay(preset.start),
        end: endOfDay(preset.end),
        label: preset.label
      };
    }
  }

  if (input && typeof input === "object") {
    const presetKey = input.preset?.trim().toLowerCase().replace(/\s+/g, "_");
    if (presetKey) {
      const preset = presets[presetKey as keyof typeof presets];
      if (preset) {
        return {
          start: startOfDay(preset.start),
          end: endOfDay(preset.end),
          label: preset.label
        };
      }
    }

    const start = parseDate(input.start);
    const end = parseDate(input.end);
    if (start && end) {
      return {
        start: startOfDay(start),
        end: endOfDay(end),
        label: "custom"
      };
    }
  }

  return {
    start: startOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
    end: endOfDay(now),
    label: "last_30_days"
  };
};

const ensurePropertyAccess = async (organizationId: string, propertyId?: string | null) => {
  if (!propertyId) return null;
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId }
  });
  if (!property) {
    throw new Error("Property not found or access denied");
  }
  return property;
};

const resolveProperty = async (organizationId: string, propertyId?: string, propertyName?: string) => {
  if (propertyId) {
    return ensurePropertyAccess(organizationId, propertyId);
  }
  if (propertyName) {
    const property = await prisma.property.findFirst({
      where: {
        organizationId,
        name: { contains: propertyName, mode: "insensitive" }
      }
    });
    if (!property) {
      throw new Error("Property not found or access denied");
    }
    return property;
  }
  return null;
};

const propertyFilters = (propertyId?: string | null) => (propertyId ? { propertyId } : {});

export const chatToolDefinitions = [
  {
    type: "function" as const,
    name: "getRentCollected",
    description: "Get total rent collected within a date range, optionally scoped to a property.",
    parameters: {
      type: "object" as const,
      properties: {
        range: {
          description:
            "Date range. Provide start/end ISO dates or a preset like last_month, month_to_date, year_to_date, last_30_days.",
          oneOf: [
            {
              type: "object" as const,
              properties: {
                start: { type: "string" as const, description: "Start date (YYYY-MM-DD or ISO)" },
                end: { type: "string" as const, description: "End date (YYYY-MM-DD or ISO)" },
                preset: { type: "string" as const }
              },
              required: ["start", "end"] as const
            },
            { type: "string" as const }
          ]
        },
        propertyId: { type: "string" as const, nullable: true },
        propertyName: { type: "string" as const, nullable: true }
      },
      required: ["range"] as const
    },
    strict: false as const
  },
  {
    type: "function" as const,
    name: "getOutstandingRent",
    description: "Get outstanding (pending or late) rent totals, optionally scoped to a property.",
    parameters: {
      type: "object" as const,
      properties: {
        propertyId: { type: "string" as const, nullable: true },
        propertyName: { type: "string" as const, nullable: true }
      }
    },
    strict: false as const
  },
  {
    type: "function" as const,
    name: "listProperties",
    description: "List the user's properties.",
    parameters: { type: "object" as const, properties: {} },
    strict: false as const
  },
  {
    type: "function" as const,
    name: "getPropertyExpenses",
    description: "Get expenses within a date range, optionally scoped to a property.",
    parameters: {
      type: "object" as const,
      properties: {
        range: {
          description:
            "Date range. Provide start/end ISO dates or a preset like last_month, month_to_date, year_to_date, last_30_days.",
          oneOf: [
            {
              type: "object" as const,
              properties: {
                start: { type: "string" as const, description: "Start date (YYYY-MM-DD or ISO)" },
                end: { type: "string" as const, description: "End date (YYYY-MM-DD or ISO)" },
                preset: { type: "string" as const }
              },
              required: ["start", "end"] as const
            },
            { type: "string" as const }
          ]
        },
        propertyId: { type: "string" as const, nullable: true },
        propertyName: { type: "string" as const, nullable: true }
      },
      required: ["range"] as const
    },
    strict: false as const
  },
  {
    type: "function" as const,
    name: "getLeaseEnding",
    description: "Get leases ending within a date range, optionally scoped to a property.",
    parameters: {
      type: "object" as const,
      properties: {
        range: {
          description:
            "Date range. Provide start/end ISO dates or a preset like last_month, month_to_date, year_to_date, last_30_days.",
          oneOf: [
            {
              type: "object" as const,
              properties: {
                start: { type: "string" as const, description: "Start date (YYYY-MM-DD or ISO)" },
                end: { type: "string" as const, description: "End date (YYYY-MM-DD or ISO)" },
                preset: { type: "string" as const }
              },
              required: ["start", "end"] as const
            },
            { type: "string" as const }
          ]
        },
        propertyId: { type: "string" as const, nullable: true },
        propertyName: { type: "string" as const, nullable: true }
      },
      required: ["range"] as const
    },
    strict: false as const
  },
  {
    type: "function" as const,
    name: "findDocument",
    description: "Find documents by name or keywords, optionally scoped to a property.",
    parameters: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, description: "Search query" },
        propertyId: { type: "string" as const, nullable: true },
        propertyName: { type: "string" as const, nullable: true }
      },
      required: ["query"] as const
    },
    strict: false as const
  }
];

export type ToolExecutionContext = {
  userId: string;
  organizationId: string;
};

export type ToolExecutionResult = {
  data: unknown;
  citations?: Array<{ label: string; detail: string }>;
};

export const executeChatTool = async (
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> => {
  const userId = context.userId;
  const organizationId = context.organizationId;

  switch (toolName) {
    case "listProperties": {
      const properties = await prisma.property.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true
        }
      });
      return {
        data: properties,
        citations: [{ label: "Properties", detail: "Property records" }]
      };
    }
    case "getRentCollected": {
      const range = resolveDateRange(args.range as DateRangeInput | undefined);
      const property = await resolveProperty(
        organizationId,
        args.propertyId as string | undefined,
        args.propertyName as string | undefined
      );

      const payments = await prisma.payment.findMany({
        where: {
          organizationId,
          status: "PAID",
          paidDate: { gte: range.start, lte: range.end },
          ...propertyFilters(property?.id)
        },
        include: { property: true }
      });

      const total = payments.reduce((sum: number, payment) => sum + payment.amount, 0);
      const byProperty = payments.reduce<Record<string, { propertyId: string; name: string; total: number }>>(
        (acc, payment) => {
          const key = payment.propertyId;
          if (!acc[key]) {
            acc[key] = { propertyId: payment.propertyId, name: payment.property.name, total: 0 };
          }
          acc[key].total += payment.amount;
          return acc;
        },
        {}
      );

      return {
        data: {
          range: { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label },
          total,
          count: payments.length,
          byProperty: Object.values(byProperty)
        },
        citations: [{ label: "Payments", detail: "Paid rent records" }]
      };
    }
    case "getOutstandingRent": {
      const property = await resolveProperty(
        organizationId,
        args.propertyId as string | undefined,
        args.propertyName as string | undefined
      );
      const now = new Date();
      const payments = await prisma.payment.findMany({
        where: {
          organizationId,
          status: { in: ["PENDING", "LATE"] },
          dueDate: { lte: now },
          ...propertyFilters(property?.id)
        },
        include: { property: true }
      });

      const total = payments.reduce((sum: number, payment) => sum + payment.amount, 0);
      const byProperty = payments.reduce<Record<string, { propertyId: string; name: string; total: number }>>(
        (acc, payment) => {
          const key = payment.propertyId;
          if (!acc[key]) {
            acc[key] = { propertyId: payment.propertyId, name: payment.property.name, total: 0 };
          }
          acc[key].total += payment.amount;
          return acc;
        },
        {}
      );

      return {
        data: {
          asOf: now.toISOString(),
          total,
          count: payments.length,
          byProperty: Object.values(byProperty)
        },
        citations: [{ label: "Payments", detail: "Pending/late rent records" }]
      };
    }
    case "getPropertyExpenses": {
      const range = resolveDateRange(args.range as DateRangeInput | undefined);
      const property = await resolveProperty(
        organizationId,
        args.propertyId as string | undefined,
        args.propertyName as string | undefined
      );

      const expenses = await prisma.expense.findMany({
        where: {
          organizationId,
          date: { gte: range.start, lte: range.end },
          ...propertyFilters(property?.id)
        },
        include: { property: true, vendor: true }
      });

      const total = expenses.reduce((sum: number, expense) => sum + expense.amount, 0);
      const byCategory = expenses.reduce<Record<string, { category: string; total: number }>>(
        (acc, expense) => {
          const key = expense.category;
          if (!acc[key]) {
            acc[key] = { category: expense.category, total: 0 };
          }
          acc[key].total += expense.amount;
          return acc;
        },
        {}
      );

      return {
        data: {
          range: { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label },
          total,
          count: expenses.length,
          byCategory: Object.values(byCategory),
          items: expenses.map((expense) => ({
            id: expense.id,
            propertyId: expense.propertyId,
            propertyName: expense.property.name,
            amount: expense.amount,
            category: expense.category,
            date: expense.date.toISOString(),
            vendor: expense.vendor?.name ?? null,
            notes: expense.notes ?? null
          }))
        },
        citations: [{ label: "Expenses", detail: "Expense records" }]
      };
    }
    case "getLeaseEnding": {
      const range = resolveDateRange(args.range as DateRangeInput | undefined);
      const property = await resolveProperty(
        organizationId,
        args.propertyId as string | undefined,
        args.propertyName as string | undefined
      );

      const leases = await prisma.lease.findMany({
        where: {
          organizationId,
          endDate: { gte: range.start, lte: range.end },
          ...propertyFilters(property?.id)
        },
        include: { tenant: true, property: true, unit: true }
      });

      return {
        data: {
          range: { start: range.start.toISOString(), end: range.end.toISOString(), label: range.label },
          count: leases.length,
          leases: leases.map((lease) => ({
            id: lease.id,
            propertyId: lease.propertyId,
            propertyName: lease.property.name,
            unit: lease.unit.label,
            tenant: `${lease.tenant.firstName} ${lease.tenant.lastName}`.trim(),
            endDate: lease.endDate?.toISOString() ?? null,
            status: lease.status
          }))
        },
        citations: [{ label: "Leases", detail: "Lease records" }]
      };
    }
    case "findDocument": {
      const query = String(args.query ?? "").trim();
      if (!query) {
        return {
          data: { results: [] },
          citations: [{ label: "Documents", detail: "Document records" }]
        };
      }

      const property = await resolveProperty(
        organizationId,
        args.propertyId as string | undefined,
        args.propertyName as string | undefined
      );

      const documents = await prisma.document.findMany({
        where: {
          organizationId,
          name: { contains: query, mode: "insensitive" },
          ...propertyFilters(property?.id)
        },
        orderBy: { createdAt: "desc" }
      });

      return {
        data: {
          query,
          count: documents.length,
          results: documents.map((doc) => ({
            id: doc.id,
            name: doc.name,
            type: doc.type,
            url: doc.url,
            propertyId: doc.propertyId,
            leaseId: doc.leaseId,
            createdAt: doc.createdAt.toISOString()
          }))
        },
        citations: [{ label: "Documents", detail: "Document records" }]
      };
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};
