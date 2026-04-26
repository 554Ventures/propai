import type { AiPlannedToolCall, AiActionToolName } from "../lib/ai/action-tools.js";

type OrgRole = "OWNER" | "ADMIN" | "MEMBER";
type PolicyPhase = "plan" | "execute";
type RiskLevel = "low" | "medium" | "high";

type ActionPolicy = {
  risk: RiskLevel;
  allowedRoles: OrgRole[];
};

export const AI_MAINTENANCE_APPROVAL_THRESHOLD_USD = 500;

export type PolicyDecision = {
  allowed: boolean;
  toolName: AiActionToolName;
  risk: RiskLevel;
  reason?: string;
  phase: PolicyPhase;
};

const ACTION_POLICIES: Record<AiActionToolName, ActionPolicy> = {
  createCashflowTransaction: { risk: "medium", allowedRoles: ["OWNER", "ADMIN", "MEMBER"] },
  createProperty: { risk: "high", allowedRoles: ["OWNER", "ADMIN"] },
  createTenant: { risk: "medium", allowedRoles: ["OWNER", "ADMIN", "MEMBER"] },
  createMaintenanceRequest: { risk: "medium", allowedRoles: ["OWNER", "ADMIN", "MEMBER"] },

  updateCashflowTransaction: { risk: "high", allowedRoles: ["OWNER", "ADMIN"] },
  deleteCashflowTransaction: { risk: "high", allowedRoles: ["OWNER", "ADMIN"] },
  updateProperty: { risk: "high", allowedRoles: ["OWNER", "ADMIN"] },
  deleteProperty: { risk: "high", allowedRoles: ["OWNER", "ADMIN"] },
  updateTenant: { risk: "high", allowedRoles: ["OWNER", "ADMIN"] },
  deleteTenant: { risk: "high", allowedRoles: ["OWNER", "ADMIN"] },
  updateMaintenanceRequest: { risk: "high", allowedRoles: ["OWNER", "ADMIN", "MEMBER"] },
  deleteMaintenanceRequest: { risk: "high", allowedRoles: ["OWNER", "ADMIN"] }
};

export const evaluateAiWriteActionPolicy = (opts: {
  role: OrgRole;
  toolName: AiActionToolName;
  args?: Record<string, unknown>;
  phase: PolicyPhase;
}): PolicyDecision => {
  const { role, toolName, args, phase } = opts;
  const policy = ACTION_POLICIES[toolName];
  if (!policy) {
    return {
      allowed: false,
      toolName,
      risk: "high",
      reason: "No policy configured for tool",
      phase
    };
  }

  if (!policy.allowedRoles.includes(role)) {
    return {
      allowed: false,
      toolName,
      risk: policy.risk,
      reason: `Role ${role} is not allowed to ${phase} ${toolName}`,
      phase
    };
  }

  // High-cost maintenance changes require manager approval (OWNER/ADMIN).
  if (toolName === "createMaintenanceRequest" || toolName === "updateMaintenanceRequest") {
    const costRaw =
      toolName === "updateMaintenanceRequest"
        ? (args?.patch as Record<string, unknown> | undefined)?.cost
        : args?.cost;
    const cost = Number(costRaw);

    if (
      Number.isFinite(cost) &&
      cost > AI_MAINTENANCE_APPROVAL_THRESHOLD_USD &&
      role === "MEMBER"
    ) {
      return {
        allowed: false,
        toolName,
        risk: "high",
        reason: `Maintenance actions above $${AI_MAINTENANCE_APPROVAL_THRESHOLD_USD} require OWNER or ADMIN approval`,
        phase
      };
    }
  }

  return {
    allowed: true,
    toolName,
    risk: policy.risk,
    phase
  };
};

export const evaluateAiWritePlanPolicy = (opts: {
  role: OrgRole;
  toolCalls: AiPlannedToolCall[];
  phase: PolicyPhase;
}): { allowed: true; decisions: PolicyDecision[] } | { allowed: false; denied: PolicyDecision; decisions: PolicyDecision[] } => {
  const { role, toolCalls, phase } = opts;
  const decisions = toolCalls.map((call) =>
    evaluateAiWriteActionPolicy({
      role,
      toolName: call.toolName,
      args: (call.args ?? {}) as Record<string, unknown>,
      phase
    })
  );

  const denied = decisions.find((d) => !d.allowed);
  if (denied) {
    return { allowed: false, denied, decisions };
  }

  return { allowed: true, decisions };
};
