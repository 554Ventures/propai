import request from "supertest";
import app from "../app";
import prisma from "../lib/prisma";

const testUser = {
  email: "test@example.com",
  password: "Password123!",
  name: "Test User"
};

beforeAll(async () => {
  const existing = await prisma.user.findUnique({ where: { email: testUser.email } });
  if (existing) {
    await prisma.membership.deleteMany({ where: { userId: existing.id } });
    await prisma.user.deleteMany({ where: { id: existing.id } });
    await prisma.organization.deleteMany({ where: { id: existing.defaultOrgId } });
  }
});

afterAll(async () => {
  const existing = await prisma.user.findUnique({ where: { email: testUser.email } });
  if (existing) {
    await prisma.membership.deleteMany({ where: { userId: existing.id } });
    await prisma.user.deleteMany({ where: { id: existing.id } });
    await prisma.organization.deleteMany({ where: { id: existing.defaultOrgId } });
  }
  await prisma.$disconnect();
});

describe("auth", () => {
  it("signs up a new user", async () => {
    const res = await request(app).post("/auth/signup").send({ ...testUser, organizationName: "Test Org" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(testUser.email);
  });

  it("logs in an existing user", async () => {
    const res = await request(app).post("/auth/login").send({
      email: testUser.email,
      password: testUser.password
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});
