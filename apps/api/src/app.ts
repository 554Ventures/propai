import express, { type Express } from "express";
import path from "path";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/auth.js";
import propertyRoutes from "./routes/properties.js";
import propertyArchiveRoutes from "./routes/property-archive.js";
import tenantRoutes from "./routes/tenants.js";
import unitRoutes from "./routes/units.js";
import healthRoutes from "./routes/health.js";
import expenseRoutes from "./routes/expenses.js";
import analyticsRoutes from "./routes/analytics.js";
import insightsRoutes from "./routes/insights.js";
import dashboardRoutes from "./routes/dashboard.js";
import documentRoutes from "./routes/documents.js";
import chatRoutes from "./routes/chat.js";
import agentRoutes from "./routes/agent.js";
import leaseRoutes from "./routes/leases.js";
import orgInviteRoutes from "./routes/org-invites.js";
import cashflowRoutes from "./routes/cashflow.js";
import aiRoutes from "./routes/ai.js";
import maintenanceRoutes from "./routes/maintenance.js";
import vendorRoutes from "./routes/vendors.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { aiBudgetGuard } from "./middleware/ai-budget-guard.js";
import { aiRateLimit } from "./middleware/ai-rate-limit.js";
import { agentContextRefreshOnMutation } from "./middleware/agent-context-refresh.js";

const app: Express = express();

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/org/invites", orgInviteRoutes);
app.use("/properties", requireAuth, agentContextRefreshOnMutation, propertyRoutes);
app.use("/properties", requireAuth, agentContextRefreshOnMutation, propertyArchiveRoutes);
app.use("/tenants", requireAuth, agentContextRefreshOnMutation, tenantRoutes);
app.use("/", requireAuth, agentContextRefreshOnMutation, unitRoutes);
app.use("/", requireAuth, agentContextRefreshOnMutation, leaseRoutes);
app.use("/", requireAuth, agentContextRefreshOnMutation, maintenanceRoutes);
app.use("/", requireAuth, agentContextRefreshOnMutation, vendorRoutes);
app.use("/api/expenses", requireAuth, agentContextRefreshOnMutation, expenseRoutes);
app.use("/cashflow", requireAuth, agentContextRefreshOnMutation, cashflowRoutes);
app.use("/api/analytics", requireAuth, analyticsRoutes);
app.use("/api/insights", requireAuth, insightsRoutes);
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/documents", requireAuth, agentContextRefreshOnMutation, documentRoutes);
app.use(
  "/api/agent",
  requireAuth,
  aiRateLimit,
  aiBudgetGuard,
  agentRoutes
);
app.use("/api/chat", requireAuth, chatRoutes);

// Two-step AI write confirmation flow.
app.use("/ai", requireAuth, aiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
