import prisma from "../src/lib/prisma.js";
import bcrypt from "bcrypt";

/**
 * Clear database tables for testing
 */
export async function clearDatabase(): Promise<void> {
  // Delete in order of dependencies
  await prisma.aiActionExecution.deleteMany({});
  await prisma.aiActionLog.deleteMany({});
  await prisma.aiSecurityEvent.deleteMany({});
  await prisma.aiUsage.deleteMany({});
  await prisma.aiBudget.deleteMany({});
  await prisma.chatSession.deleteMany({});
  await prisma.aiInsight.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.lease.deleteMany({});
  await prisma.maintenanceRequest.deleteMany({});
  await prisma.vendor.deleteMany({});
  await prisma.tenant.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.property.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.invitation.deleteMany({});
}

interface CreateTestUserData {
  email?: string;
  password?: string;
  name?: string;
}

interface CreateTestUserResult {
  token: string;
  userId: string;
  organizationId: string;
  user: any;
  organization: any;
}

/**
 * Create a test user with organization and return auth details
 */
export async function createTestUser(userData: CreateTestUserData = {}): Promise<CreateTestUserResult> {
  const defaultData = {
    email: "test@example.com",
    password: "Password123!",
    name: "Test User"
  };

  const data = { ...defaultData, ...userData };
  
  // Create organization first
  const organization = await prisma.organization.create({
    data: {
      name: "Test Organization"
    }
  });

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash,
      defaultOrgId: organization.id
    }
  });

  // Create membership
  await prisma.membership.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      role: "OWNER"
    }
  });

  // In a real app you'd create a JWT token, but for testing we can create a mock token
  const token = `mock-token-${user.id}`;

  return {
    token,
    userId: user.id,
    organizationId: organization.id,
    user,
    organization
  };
}

interface CreateTestPropertyData {
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Create test property for testing
 */
export async function createTestProperty(userId: string, organizationId: string, propertyData: CreateTestPropertyData = {}) {
  const defaultData = {
    name: "Test Property",
    addressLine1: "123 Test St",
    city: "Test City",
    state: "TS",
    postalCode: "12345",
    country: "US"
  };

  const data = { ...defaultData, ...propertyData };

  return await prisma.property.create({
    data: {
      ...data,
      userId,
      organizationId
    }
  });
}

interface CreateTestUnitData {
  label?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  rent?: number;
}

/**
 * Create test unit for testing
 */
export async function createTestUnit(userId: string, organizationId: string, propertyId: string, unitData: CreateTestUnitData = {}) {
  const defaultData = {
    label: "Unit 1A",
    bedrooms: 2,
    bathrooms: 1.5,
    squareFeet: 900,
    rent: 1500
  };

  const data = { ...defaultData, ...unitData };

  return await prisma.unit.create({
    data: {
      ...data,
      userId,
      organizationId,
      propertyId
    }
  });
}