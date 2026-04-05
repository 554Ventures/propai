/**
 * Temporary type extensions for Prisma models until prisma generate is run
 * These extend the existing models with new fields from recent migrations
 */

declare module '@prisma/client' {
  interface Property {
    archivedAt: Date | null;
  }
  
  interface Unit {
    archivedAt: Date | null;
  }
  
  interface AiActionExecution {
    id: string;
    organizationId: string;
    userId: string;
    actionId: string;
    clientRequestId: string;
    status: string;
    result: any;
    createdAt: Date;
    updatedAt: Date;
  }
}

export {};