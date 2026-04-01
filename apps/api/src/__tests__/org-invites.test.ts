import request from "supertest";
import app from "../app";
import prisma from "../lib/prisma";

const owner = {
  email: "owner-invites@example.com",
  password: "Password123!",
  name: "Owner",
  organizationName: "Invites Org"
};

const member = {
  email: "member-invites@example.com",
  password: "Password123!",
  name: "Member"
};

const cleanupUserByEmail = async (email: string, opts?: { deleteOrg?: boolean }) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) return;
  await prisma.invitation.deleteMany({ where: { invitedByUserId: existing.id } });
  await prisma.invitation.deleteMany({ where: { email } });
  await prisma.membership.deleteMany({ where: { userId: existing.id } });
  await prisma.user.deleteMany({ where: { id: existing.id } });
  if (opts?.deleteOrg) {
    // Organization is owned by this user on signup.
    await prisma.organization.deleteMany({ where: { id: existing.defaultOrgId } });
  }
};

beforeAll(async () => {
  await cleanupUserByEmail(owner.email, { deleteOrg: true });
  await cleanupUserByEmail(member.email, { deleteOrg: true });
});

afterAll(async () => {
  await cleanupUserByEmail(owner.email, { deleteOrg: true });
  await cleanupUserByEmail(member.email, { deleteOrg: true });
  await prisma.$disconnect();
});

describe("org invites", () => {
  it("enforces roles for creating invites", async () => {
    const signupRes = await request(app).post("/auth/signup").send(owner);
    expect(signupRes.status).toBe(201);
    const ownerToken = signupRes.body.token as string;

    // Create a second user (will be OWNER of their own org). Downgrade to MEMBER for role test.
    const memberSignup = await request(app)
      .post("/auth/signup")
      .send({ email: member.email, password: member.password, name: member.name, organizationName: "Member Org" });
    expect(memberSignup.status).toBe(201);

    const memberUser = await prisma.user.findUnique({ where: { email: member.email } });
    expect(memberUser).toBeTruthy();
    const mem = await prisma.membership.findUnique({ where: { userId: memberUser!.id } });
    expect(mem).toBeTruthy();
    await prisma.membership.update({ where: { id: mem!.id }, data: { role: "MEMBER" } });

    const loginMember = await request(app).post("/auth/login").send({ email: member.email, password: member.password });
    expect(loginMember.status).toBe(200);
    const memberToken = loginMember.body.token as string;

    const forbidden = await request(app)
      .post("/org/invites")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ email: "someone@example.com", role: "MEMBER" });
    expect(forbidden.status).toBe(403);

    const ok = await request(app)
      .post("/org/invites")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "new-user@example.com", role: "MEMBER" });
    expect(ok.status).toBe(201);
    expect(ok.body.token).toBeTruthy();
  });

  it("accepts an invite and creates a new user + membership", async () => {
    // Owner logs in
    const ownerLogin = await request(app).post("/auth/login").send({ email: owner.email, password: owner.password });
    expect(ownerLogin.status).toBe(200);
    const ownerToken = ownerLogin.body.token as string;
    const orgId = ownerLogin.body.organization.id as string;

    // Create invite for member email
    const inviteRes = await request(app)
      .post("/org/invites")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ email: "invited-new@example.com", role: "ADMIN", expiresInDays: 7 });
    expect(inviteRes.status).toBe(201);
    const inviteToken = inviteRes.body.token as string;

    // Accept invite, create user
    const acceptRes = await request(app)
      .post("/org/invites/accept")
      .send({ token: inviteToken, password: "Password123!", name: "Invited User" });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.token).toBeTruthy();
    expect(acceptRes.body.organizationId).toBe(orgId);
    expect(acceptRes.body.role).toBe("ADMIN");

    const createdUser = await prisma.user.findUnique({ where: { email: "invited-new@example.com" } });
    expect(createdUser).toBeTruthy();
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: createdUser!.id, organizationId: orgId } }
    });
    expect(membership?.role).toBe("ADMIN");

    // Pending list should not include accepted invite
    const listRes = await request(app).get("/org/invites").set("Authorization", `Bearer ${ownerToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.find((i: any) => i.email === "invited-new@example.com")).toBeFalsy();

    // Cleanup created user
    await cleanupUserByEmail("invited-new@example.com", { deleteOrg: false });
  });
});
