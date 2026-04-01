import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app";
import prisma from "../lib/prisma";

const testUser = {
  email: "forecast@example.com",
  password: "Password123!",
  name: "Forecast User"
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

describe("cash flow forecast", () => {
  it("returns a projection series", async () => {
    const token = await createUserAndToken();

    const propertyRes = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Forecast Place",
        addressLine1: "500 Lake Dr",
        city: "Madison",
        state: "WI",
        postalCode: "53703"
      });

    const propertyId = propertyRes.body.id as string;
    const user = await prisma.user.findFirst({ where: { email: testUser.email } });
    if (!user) {
      throw new Error("Test user not found after signup.");
    }

    const unit = await prisma.unit.create({
      data: {
        userId: user.id,
        organizationId: user.defaultOrgId,
        propertyId,
        label: "Unit 1",
        bedrooms: 2,
        bathrooms: 1
      }
    });

    const tenant = await prisma.tenant.create({
      data: {
        userId: user.id,
        organizationId: user.defaultOrgId,
        firstName: "Taylor",
        lastName: "Renter",
        email: "taylor.renter@example.com"
      }
    });

    const now = new Date();
    const lease = await prisma.lease.create({
      data: {
        userId: user.id,
        organizationId: user.defaultOrgId,
        propertyId,
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1)),
        rent: 1500
      }
    });

    for (let i = 1; i <= 6; i += 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 5));
      await prisma.payment.create({
        data: {
          userId: user.id,
          organizationId: user.defaultOrgId,
          propertyId,
          leaseId: lease.id,
          amount: 1500,
          dueDate: date,
          paidDate: date
        }
      });
      await prisma.expense.create({
        data: {
          userId: user?.id ?? "",
          organizationId: user.defaultOrgId,
          propertyId,
          amount: 400,
          category: "Utilities",
          date
        }
      });
    }

    const forecastRes = await request(app)
      .get(`/api/analytics/forecast?property_id=${propertyId}&time_range=monthly`)
      .set("Authorization", `Bearer ${token}`);

    expect(forecastRes.status).toBe(200);
    expect(Array.isArray(forecastRes.body.projection)).toBe(true);
    expect(forecastRes.body.projection.length).toBeGreaterThan(0);
    expect(forecastRes.body.granularity).toBe("monthly");
  });
});
