import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app";
import prisma from "../lib/prisma";

process.env.OPENAI_API_KEY = "test-key";

vi.mock("openai", () => {
  return {
    default: class {
      responses = {
        create: vi.fn().mockResolvedValue({
          output_text: JSON.stringify({
            category: "Utilities",
            confidence: 0.9,
            reasoning: "Vendor appears to be a utility provider."
          })
        })
      };
    }
  };
});

const testUser = {
  email: "ai-expense@example.com",
  password: "Password123!",
  name: "AI Expense User"
};

const cleanupUserData = async () => {
  const user = await prisma.user.findUnique({ where: { email: testUser.email } });
  if (!user) {
    return;
  }

  const userId = user.id;
  const organizationId = user.defaultOrgId;

  await prisma.aIInsight.deleteMany({ where: { organizationId } });
  await prisma.expense.deleteMany({ where: { organizationId } });
  await prisma.payment.deleteMany({ where: { organizationId } });
  await prisma.document.deleteMany({ where: { organizationId } });
  await prisma.maintenanceRequest.deleteMany({ where: { organizationId } });
  await prisma.lease.deleteMany({ where: { organizationId } });
  await prisma.unit.deleteMany({ where: { organizationId } });
  await prisma.tenant.deleteMany({ where: { organizationId } });
  await prisma.vendor.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
};

const createUserAndToken = async () => {
  await cleanupUserData();
  await request(app).post("/auth/signup").send({ ...testUser, organizationName: "Test Org" });
  const login = await request(app).post("/auth/login").send({
    email: testUser.email,
    password: testUser.password
  });
  return login.body.token as string;
};

beforeAll(async () => {
  await cleanupUserData();
});

afterAll(async () => {
  await cleanupUserData();
  await prisma.$disconnect();
});

describe("expense AI categorization", () => {
  it("categorizes an expense and logs overrides", async () => {
    const token = await createUserAndToken();

    const propertyRes = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Maple Court",
        addressLine1: "100 Maple St",
        city: "Denver",
        state: "CO",
        postalCode: "80202"
      });

    const propertyId = propertyRes.body.id as string;

    const categorizeRes = await request(app)
      .post("/api/expenses/categorize")
      .set("Authorization", `Bearer ${token}`)
      .send({
        description: "Monthly power bill",
        amount: 120,
        vendor: "City Electric",
        propertyId
      });

    expect(categorizeRes.status).toBe(200);
    expect(categorizeRes.body.category).toBe("Utilities");
    expect(categorizeRes.body.insightId).toBeDefined();

    const insightId = categorizeRes.body.insightId as string;

    const createRes = await request(app)
      .post("/api/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        propertyId,
        amount: 120,
        category: "Repairs",
        date: new Date().toISOString(),
        aiInsightId: insightId
      });

    expect(createRes.status).toBe(201);

    const updatedInsight = await prisma.aIInsight.findFirst({ where: { id: insightId } });
    expect(updatedInsight?.expenseId).toBe(createRes.body.id);
    expect(updatedInsight?.overrideValue).toBe("Repairs");
  });
});
