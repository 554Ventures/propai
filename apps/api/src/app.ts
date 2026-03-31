import express from "express";
import path from "path";
import cors from "cors";
import morgan from "morgan";
import authRoutes from "./routes/auth";
import propertyRoutes from "./routes/properties";
import tenantRoutes from "./routes/tenants";
import unitRoutes from "./routes/units";
import healthRoutes from "./routes/health";
import expenseRoutes from "./routes/expenses";
import analyticsRoutes from "./routes/analytics";
import insightsRoutes from "./routes/insights";
import dashboardRoutes from "./routes/dashboard";
import documentRoutes from "./routes/documents";
import chatRoutes from "./routes/chat";
import { requireAuth } from "./middleware/auth";
import { errorHandler, notFound } from "./middleware/error";

const app = express();

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
app.use("/api/expenses", requireAuth, expenseRoutes);
app.use("/api/analytics", requireAuth, analyticsRoutes);
app.use("/api/insights", requireAuth, insightsRoutes);
app.use("/api/dashboard", requireAuth, dashboardRoutes);
app.use("/api/documents", requireAuth, documentRoutes);
app.use("/api/chat", requireAuth, chatRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
