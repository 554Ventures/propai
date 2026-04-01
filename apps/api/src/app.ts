import express, { type Express } from "express";
import path from "path";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/auth.js";
import propertyRoutes from "./routes/properties.js";
import tenantRoutes from "./routes/tenants.js";
import unitRoutes from "./routes/units.js";
import healthRoutes from "./routes/health.js";
import expenseRoutes from "./routes/expenses.js";
import analyticsRoutes from "./routes/analytics.js";
import insightsRoutes from "./routes/insights.js";
import dashboardRoutes from "./routes/dashboard.js";
import documentRoutes from "./routes/documents.js";
import chatRoutes from "./routes/chat.js";
import leaseRoutes from "./routes/leases.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error.js";

const app: Express = express();

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.use("/health", healthRoutes);
app.use("/auth", authRoutes);
app.use("/properties", requireAuth, propertyRoutes);
app.use("/tenants", requireAuth, tenantRoutes);
app.use("/", requireAuth, unitRoutes);
app.use("/", requireAuth, leaseRoutes);
app.use("/api/expenses", requireAuth, expenseRoutes);
app.use("/api/analytics", requireAuth, analyticsRoutes);
app.use("/api/insights", requireAuth, insightsRoutes);
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/documents", requireAuth, documentRoutes);
app.use("/api/chat", requireAuth, chatRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
