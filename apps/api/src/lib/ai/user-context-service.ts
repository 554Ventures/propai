import fs from "fs/promises";
import path from "path";
import prisma from "../prisma.js";

const MAX_CONTEXT_CHARS = Number(process.env.AI_CONTEXT_MAX_CHARS ?? 24000);

const contextRoot = () => {
  const configured = process.env.AI_CONTEXT_DIR;
  return configured ? path.resolve(configured) : path.resolve(process.cwd(), "data", "user-context");
};

const normalizeSegment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

export const getUserContextPath = (organizationId: string, userId: string) => {
  const root = contextRoot();
  return path.join(root, normalizeSegment(organizationId), `${normalizeSegment(userId)}.md`);
};

const formatCurrency = (value: unknown) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
};

const formatDate = (value?: Date | string | null) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
};

const table = (headers: string[], rows: string[][]) => {
  if (rows.length === 0) return "_None_";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`)
  ].join("\n");
};

const clampContext = (content: string) => {
  if (content.length <= MAX_CONTEXT_CHARS) return content;
  return `${content.slice(0, MAX_CONTEXT_CHARS).trim()}\n\n_Context truncated at ${MAX_CONTEXT_CHARS} characters._\n`;
};

export const generateUserContextMarkdown = async (opts: { organizationId: string; userId: string }) => {
  const { organizationId, userId } = opts;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [user, organization, properties, tenants, transactions, payments, maintenance] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, defaultOrgId: organizationId }, select: { id: true, name: true, email: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } }),
    prisma.property.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        units: {
          where: { archivedAt: null },
          include: { leases: { where: { status: "ACTIVE" }, include: { tenant: true } } }
        }
      }
    }),
    prisma.tenant.findMany({
      where: { organizationId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: { leases: { where: { status: "ACTIVE" }, include: { unit: true, property: true } } }
    }),
    prisma.transaction.findMany({
      where: { organizationId, date: { gte: monthStart, lte: now } },
      orderBy: { date: "desc" },
      take: 50,
      include: { property: { select: { name: true } } }
    }),
    prisma.payment.findMany({
      where: { organizationId, OR: [{ status: "LATE" }, { status: "PENDING", dueDate: { lt: now } }] },
      orderBy: { dueDate: "asc" },
      take: 25,
      include: { property: { select: { name: true } }, lease: { include: { tenant: true, unit: true } } }
    }),
    prisma.maintenanceRequest.findMany({
      where: { organizationId, status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { property: { select: { name: true } }, unit: { select: { label: true } }, tenant: true }
    })
  ]);

  const transactionTotals = transactions.reduce(
    (acc, tx) => {
      const amount = Number(tx.amount ?? 0);
      if (tx.type === "INCOME") acc.income += amount;
      if (tx.type === "EXPENSE") acc.expenses += amount;
      return acc;
    },
    { income: 0, expenses: 0 }
  );

  const activeLeases = tenants.flatMap((tenant) => tenant.leases.map((lease) => ({ tenant, lease })));
  const outstandingTotal = payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

  const markdown = [
    `# PropAI Context - User ${userId}`,
    "",
    `Generated: ${now.toISOString()}`,
    "",
    "## User Profile",
    `- Name: ${user?.name ?? "Unknown"}`,
    `- Email: ${user?.email ?? "Unknown"}`,
    `- Organization: ${organization?.name ?? organizationId}`,
    `- Active properties: ${properties.length}`,
    `- Active tenants: ${activeLeases.length}`,
    "",
    "## Properties",
    table(
      ["Name", "Address", "Units", "Occupied", "Vacant"],
      properties.map((property) => {
        const units = property.units.length;
        const occupied = property.units.filter((unit) => unit.leases.length > 0).length;
        return [
          property.name,
          `${property.addressLine1}, ${property.city}, ${property.state} ${property.postalCode}`,
          String(units),
          String(occupied),
          String(Math.max(0, units - occupied))
        ];
      })
    ),
    "",
    "## Tenants",
    table(
      ["Name", "Property", "Unit", "Rent", "Lease End", "Status"],
      tenants.map((tenant) => {
        const lease = tenant.leases[0];
        return [
          `${tenant.firstName} ${tenant.lastName}`.trim(),
          lease?.property?.name ?? "-",
          lease?.unit?.label ?? "-",
          lease ? formatCurrency(lease.rent) : "-",
          lease ? formatDate(lease.endDate) : "-",
          lease ? lease.status : "No active lease"
        ];
      })
    ),
    "",
    "## Financial Summary",
    `- Month-to-date income: ${formatCurrency(transactionTotals.income)}`,
    `- Month-to-date expenses: ${formatCurrency(transactionTotals.expenses)}`,
    `- Month-to-date net: ${formatCurrency(transactionTotals.income - transactionTotals.expenses)}`,
    `- Outstanding or late payments: ${formatCurrency(outstandingTotal)} across ${payments.length} item(s)`,
    "",
    "## Outstanding Payments",
    table(
      ["Tenant", "Property", "Unit", "Amount", "Due", "Status"],
      payments.map((payment) => [
        payment.lease?.tenant ? `${payment.lease.tenant.firstName} ${payment.lease.tenant.lastName}`.trim() : "-",
        payment.property?.name ?? "-",
        payment.lease?.unit?.label ?? "-",
        formatCurrency(payment.amount),
        formatDate(payment.dueDate),
        payment.status
      ])
    ),
    "",
    "## Open Maintenance Requests",
    table(
      ["Title", "Property", "Unit", "Tenant", "Status", "Cost", "Created"],
      maintenance.map((request) => [
        request.title,
        request.property?.name ?? "-",
        request.unit?.label ?? "-",
        request.tenant ? `${request.tenant.firstName} ${request.tenant.lastName}`.trim() : "-",
        request.status,
        request.cost == null ? "-" : formatCurrency(request.cost),
        formatDate(request.createdAt)
      ])
    )
  ].join("\n");

  return clampContext(markdown);
};

export const regenerateUserContext = async (opts: { organizationId: string; userId: string }) => {
  const filePath = getUserContextPath(opts.organizationId, opts.userId);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const content = await generateUserContextMarkdown(opts);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, content, "utf8");
  await fs.rename(tmpPath, filePath);
  const stat = await fs.stat(filePath);
  return { filePath, generatedAt: new Date().toISOString(), bytes: stat.size };
};

export const readUserContext = async (opts: { organizationId: string; userId: string }) => {
  const filePath = getUserContextPath(opts.organizationId, opts.userId);
  try {
    const stat = await fs.stat(filePath);
    const content = await fs.readFile(filePath, "utf8");
    return {
      filePath,
      content: clampContext(content),
      generatedAt: stat.mtime.toISOString(),
      stale: false
    };
  } catch {
    return { filePath, content: "", generatedAt: null, stale: true };
  }
};

export const regenerateAllUserContexts = async () => {
  const memberships = await prisma.membership.findMany({ select: { userId: true, organizationId: true } });
  const results: Array<{ userId: string; organizationId: string; ok: boolean; error?: string }> = [];
  for (const membership of memberships) {
    try {
      await regenerateUserContext(membership);
      results.push({ ...membership, ok: true });
    } catch (error) {
      results.push({
        ...membership,
        ok: false,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }
  return results;
};

export const refreshUserContextSoon = (opts: { organizationId?: string | null; userId?: string | null }) => {
  const organizationId = opts.organizationId ?? undefined;
  const userId = opts.userId ?? undefined;
  if (!organizationId || !userId) return;
  setTimeout(() => {
    regenerateUserContext({ organizationId, userId }).catch(() => undefined);
  }, 0);
};

export const startWeeklyUserContextRegeneration = () => {
  if (process.env.AI_CONTEXT_WEEKLY_CRON_ENABLED === "false") return;
  if (process.env.NODE_ENV === "test") return;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  setInterval(() => {
    regenerateAllUserContexts().catch(() => undefined);
  }, weekMs).unref?.();
};
