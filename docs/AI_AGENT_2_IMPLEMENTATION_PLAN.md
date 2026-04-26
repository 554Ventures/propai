# PropAI In-App AI Agent 2.0 Implementation Plan

Created: 2026-04-25
Status: Planning
Source: `propai/docs/PropAI - In-App AI Agent 2.md`

## Goal And Success Criteria

Deliver Agent 2.0 as a fresh in-app AI agent experience: a context-aware, org-scoped, auditable agent that can answer portfolio questions, prepare safe write actions, collect missing fields in one turn, require explicit confirmation, stream responses, and refresh user context after mutations.

Success means:
- Users can chat from the existing in-app assistant surface and get accurate property, tenant, and financial answers.
- The agent can use a generated per-user context file plus existing database-backed tools.
- Write actions are never executed silently; they are drafted, confirmed, idempotent, audited, and scoped to the authenticated organization.
- Agent context is regenerated after CRUD/write activity and by a weekly scheduled job.
- `/api/agent` is the primary fresh Agent 2.0 route, while proven security, audit, idempotency, and data-access patterns from the existing assistant are selectively reused.

## Current Baseline

The repository is not starting from zero. Existing foundations to reuse:
- Backend chat route: `apps/api/src/routes/chat.ts`
- Backend action route/state machine: `apps/api/src/routes/ai.ts`
- Read tools: `apps/api/src/lib/ai/chat-tools.ts`
- Write/action tools: `apps/api/src/lib/ai/action-tools.ts`
- Tool argument validation: `apps/api/src/lib/ai/tool-arg-validators.ts`
- Planner and pending-field extraction: `apps/api/src/lib/ai/agent-planner.ts`, `apps/api/src/lib/ai/pending-action-extractor.ts`
- Rolling session memory: `apps/api/src/lib/ai/rolling-summary.ts`
- AI security middleware and logging: `apps/api/src/middleware/ai-*`, `apps/api/src/security/*`
- Web assistant shell and chat UI: `apps/web/src/components/app-shell.tsx`, `apps/web/src/components/chat-pane.tsx`

Planning implication: Agent 2.0 should start fresh at the route and orchestration level under `/api/agent`, because the current assistant experience is not the desired product direction. Reuse only hardened primitives that still fit: auth context, org scoping, validators, AI security middleware, audit/idempotency patterns, Prisma data access, and UI shell placement.

## Confirmed Product Decisions

- `/api/agent` is the primary Agent 2.0 route, not a compatibility facade.
- Keep OpenAI for the first release, but move off mini-class models to a stronger model configured by env.
- Store context files at `data/user-context/{organizationId}/{userId}.md`.
- Regenerate context immediately after CRUD/write activity and on a weekly scheduled cadence.
- Include streaming in the first functional pass.

## Scope

### In Scope

- Per-user markdown context files under `data/user-context/{organizationId}/{userId}.md`.
- Context regeneration service and endpoint.
- Weekly scheduled context regeneration.
- CRUD-triggered context regeneration after relevant create, update, delete, archive, restore, and payment/status mutations.
- Context injection into agent prompts with strict delimiters and size limits.
- Fresh backend agent service for read and write flows under `/api/agent`.
- Streaming responses in the first functional pass.
- Tool registry cleanup around read and write tool definitions.
- Read tools for properties, tenants, and financial summary.
- Write tools for create tenant, create property, and log payment/cashflow transaction.
- Confirmation-before-write flow using fresh Agent 2.0 draft/result event modes.
- Missing required fields collected in one response.
- Audit logging for AI-initiated writes.
- Existing sidebar assistant UX upgraded to Agent 2.0 behaviors.

### Non-Goals

- No tenant-facing agent.
- No RAG/vector search in this functional release.
- No proactive suggestions in this functional release.
- No new automated test implementation now.
- No LLM vendor migration now; OpenAI remains the provider, with model selection upgraded and env-configurable.
- No broad redesign of the app shell.

## Prioritized Backlog

### Must

- Add user context generation service with markdown output.
- Add on-demand context regeneration endpoint.
- Add scheduled weekly regeneration job.
- Trigger context regeneration after CRUD/write actions.
- Inject context into the Agent 2.0 system prompt safely.
- Build `/api/agent` as the primary route contract.
- Support streaming from `/api/agent` in the first functional pass.
- Add or map read tools: `get_properties`, `get_tenants`, `get_financials`.
- Preserve org scoping at every tool boundary.
- Preserve rate limit, moderation, prompt guard, budget guard, output filtering, and security logging.
- Preserve confirmation, cancel, idempotency, and audit behavior for writes.
- Update the existing sidebar chat UI to expose Agent 2.0 states clearly.

### Should

- Add write tools or aliases: `create_tenant`, `create_property`, `log_payment`.
- Add context regeneration after successful AI-initiated write actions.
- Add LLM client interface with OpenAI stronger-model support now and room for Claude later.
- Add user-facing context freshness metadata in assistant responses or debug metadata.
- Add admin/debug endpoint metadata for context regeneration status.

### Could

- Add maintenance read/write tools after the primary property/tenant/financial flow is stable.
- Add multi-step action chaining beyond the existing multiple tool-call draft support.
- Add RAG for large history.
- Add proactive suggestions.
- Add tenant-facing constrained agent later.

## Milestones And Timeline

### Milestone 0 - Contract Finalization (0.5 day)

Owner: PropAI Product Manager with Senior API Engineer

Outcome:
- Freeze `/api/agent` as the primary Agent 2.0 route.
- Confirm tool naming strategy for the fresh contract: prefer snake_case public tool names from the Agent 2.0 plan, with internal adapters where existing camelCase implementations are reused.
- Confirm upgraded OpenAI model via env, for example `AI_AGENT_MODEL`, with no mini-class default for Agent 2.0.
- Confirm streaming protocol: Server-Sent Events is the recommended first pass because it fits one-way assistant response streaming over HTTP.

Acceptance criteria:
- One route contract is documented.
- Frontend knows which endpoint to call for chat, draft, confirm, and cancel.
- `/api/agent` does not depend on the old assistant state machine, except for deliberately reused primitives.

### Milestone 1 - Context Layer (1 day)

Owner: Senior API Engineer

Dependencies: existing Prisma models for users, organizations, properties, units, tenants, leases, cashflow, maintenance.

Functional tasks:
- Create `apps/api/src/lib/ai/user-context-service.ts`.
- Generate markdown context from org-scoped data only.
- Store files under `data/user-context/{organizationId}/{userId}.md` or an env-configurable `AI_CONTEXT_DIR` root.
- Use atomic write behavior: write temp file, then rename.
- Add size and line-count limits before prompt injection.
- Add safe fallback: if generation fails, continue with database tools and no injected file context.
- Add `POST /api/agent/context/regenerate`.
- Add context regeneration hooks after CRUD/write activity that affects agent context: properties, units, tenants, leases, cashflow/payments, documents metadata, and maintenance.
- Add cron job registration for weekly regeneration, disabled by env in local/test if needed.

Acceptance criteria:
- Context file can be generated for an authenticated user.
- Generated markdown includes user profile, properties, tenants, financial summary, and open requests where available.
- Cross-org data is not included.
- Failed regeneration does not break chat.
- Manual regeneration returns status, timestamp, and file metadata.
- CRUD/write activity queues or triggers best-effort context refresh for affected authenticated users.

### Milestone 2 - Fresh Agent Service And Streaming (1.5 days)

Owner: Senior API Engineer

Dependencies: Milestone 0 and Milestone 1.

Functional tasks:
- Create a fresh `/api/agent` route and service layer instead of routing through the old assistant endpoints.
- Build prompt assembly that includes: role instructions, property/session scope, rolling summary, user context markdown, and tool guidance.
- Keep model output behind existing trust boundaries: validate tool names, validate args, execute only allowlisted tools.
- Add OpenAI streaming support for normal assistant output and tool-loop status events.
- Define stream event types such as `message_delta`, `tool_call_started`, `tool_call_result`, `draft`, `clarify`, `result`, `error`, and `done`.
- Reuse existing hardening primitives where they fit, but avoid coupling Agent 2.0 behavior to old `/api/chat` or `/ai/chat` response modes.

Acceptance criteria:
- Agent 2.0 has its own primary orchestration path under `/api/agent`.
- Agent prompt includes the context file when available.
- Read questions can answer from context or call read tools when deeper data is needed.
- Unsupported tool calls are blocked and logged.
- Streaming works for the first functional pass with graceful error events.

### Milestone 3 - Tool Registry And Functional Tools (1 day)

Owner: Senior API Engineer

Dependencies: Milestone 2.

Functional tasks:
- Align read tool names with Agent 2.0 plan:
  - `get_properties` -> existing `listProperties` behavior.
  - `get_tenants` -> new or existing tenant listing behavior.
  - `get_financials` -> cashflow/rent summary behavior.
- Align write tool names with Agent 2.0 plan:
  - `create_property` -> existing `createProperty` action tool.
  - `create_tenant` -> existing `createTenant` action tool.
  - `log_payment` -> existing `createCashflowTransaction` action tool with income/rent defaults where applicable.
- Keep strict allowlists and validation for every tool.
- Trigger context regeneration after confirmed write success.

Acceptance criteria:
- Tool registry clearly separates read and write capabilities.
- Every tool receives `userId` and `organizationId` from auth context, never from the model.
- Write aliases cannot bypass draft/confirm/idempotency.
- Confirmed writes refresh the user's context file best-effort.

### Milestone 4 - Web Assistant Rebuild For Agent 2.0 (1.5 days)

Owner: Senior Frontend Web Engineer

Dependencies: Milestone 0 route contract and Milestone 2 response shapes.

Functional tasks:
- Reuse the existing docked assistant in `app-shell.tsx` and `chat-pane.tsx`.
- Replace old chat behavior with a fresh Agent 2.0 client that talks to `/api/agent`.
- Update quick actions to Agent 2.0 core workflows: properties, tenants, financials, add tenant.
- Ensure draft, clarify, result, receipt, cancel, and retry states remain clear.
- Implement streaming UI for the first pass using the backend event contract.
- Show missing fields in one grouped UI response, reusing current clarify metadata.
- Keep confirm/cancel bound to a pending action ID and client request ID.

Acceptance criteria:
- Users can open the assistant, ask read questions, and receive scoped answers.
- Users can request a write, see a human-readable draft, confirm or cancel, and receive a saved/cancelled receipt.
- Missing details are requested together, not one field at a time.
- Streaming deltas render progressively, and terminal `done` or `error` events settle the UI state.
- Mobile drawer and desktop dock remain usable.

### Milestone 5 - Security And Release Hardening (0.5-1 day)

Owner: AI Security Expert with Senior API Engineer

Dependencies: Milestones 1-4.

Functional tasks:
- Apply existing AI middleware parity to any new `/api/agent` endpoint.
- Add context file path hardening: no user-supplied paths, no traversal, env-rooted directory only.
- Delimit context markdown in prompt assembly and mark it as data, not instructions.
- Enforce context size limits and token budget limits.
- Ensure write confirmation is replay-protected by action ID plus client request ID.
- Audit write requests, confirmations, results, failures, and context regeneration status.

Acceptance criteria:
- New agent endpoints have the same or stronger controls as current chat endpoints.
- Cross-org access attempts fail at route and tool level.
- Prompt-injection-like content in context cannot directly invoke tools.
- Every confirmed write has an audit trail.

### Milestone 6 - Manual Functional Readiness (0.5 day)

Owner: Senior SDET

Dependencies: Milestones 1-5.

Functional tasks only; no automated tests now.
- Run manual smoke scenarios for context generation, read tools, write draft, missing fields, confirm, cancel, and context refresh.
- Check security smoke cases: cross-org denial, unauthorized tool blocked, malformed args rejected, rate limit still active.
- Verify frontend state: loading, error, draft, result, cancelled, stale session.
- Document known issues and decide go/no-go.

Acceptance criteria:
- Manual acceptance scenarios pass for the target demo data.
- No critical security or data-isolation issue is open.
- Any non-blocking issues are captured with owners.

## Workstream Ownership

| Workstream | Owner | Outcome | Key Dependencies |
|---|---|---|---|
| Requirements and scope | PropAI Product Manager | Final functional baseline and priorities | Remaining model/scheduler/queue decisions |
| Backend agent and context | Senior API Engineer | Context files, streaming route contract, tool registry, prompt assembly, write refresh | Prisma models, auth context, security middleware |
| Frontend assistant | Senior Frontend Web Engineer | Sidebar UX for chat, clarify, draft, confirm, result | Backend response contract |
| Security controls | AI Security Expert | Tool isolation, context hardening, rate/budget guardrails, audit gates | Backend route implementation |
| Functional readiness | Senior SDET | Manual smoke/readiness checklist and go/no-go input | Functional build available |

## Critical Path

1. Finalize the `/api/agent` streaming contract and tool naming compatibility.
2. Build context generation and prompt injection.
3. Build the fresh backend agent service under `/api/agent`.
4. Map/read/write tools and post-write context refresh.
5. Update web assistant states against the final contract.
6. Complete security and manual readiness gates.

## API Contract Direction

Confirmed direction: `/api/agent` is the primary Agent 2.0 route. Existing endpoints can remain for backward compatibility during migration, but the new assistant should not depend on them for core behavior.

Suggested endpoint map:
- `POST /api/agent`: sends a chat turn and streams Agent 2.0 events.
- `POST /api/agent/confirm`: confirms a pending write action using `pendingActionId` and `clientRequestId`.
- `POST /api/agent/cancel`: cancels a pending write action.
- `POST /api/agent/context/regenerate`: regenerate authenticated user's context file.
- Existing compatibility can remain temporarily: `/api/chat/*`, `/ai/chat`, `/ai/cancel`.

Suggested common response shape:

```json
{
  "contractVersion": "2026-04-25.agent2.v1",
  "mode": "chat|clarify|draft|result",
  "sessionId": "...",
  "messageId": "...",
  "message": "...",
  "pendingActionId": "...",
  "draft": {
    "summary": "...",
    "toolCalls": []
  },
  "clarify": {
    "missing": [],
    "choices": []
  },
  "context": {
    "used": true,
    "generatedAt": "...",
    "stale": false
  }
}
```

Suggested stream events:

```text
event: message_delta
data: {"text":"You have "}

event: tool_call_started
data: {"toolName":"get_properties"}

event: draft
data: {"pendingActionId":"...","summary":"...","toolCalls":[]}

event: done
data: {"sessionId":"...","messageId":"..."}
```

## Model Direction

OpenAI remains the provider for the first functional release, but Agent 2.0 should not default to a mini-class model. Add a dedicated env var such as:

```text
AI_AGENT_MODEL=gpt-4.1
```

Keep any existing mini-model setting isolated to legacy assistant paths until they are retired.

## Security Gates

Release cannot proceed if any of these are unresolved:
- New agent route lacks the current AI middleware stack.
- Tool execution can accept `organizationId` or `userId` from model output.
- Context file path can be influenced by request input beyond authenticated user identity.
- Write action can execute without explicit confirmation.
- Confirm action can be replayed without idempotency protection.
- AI-initiated write lacks an audit log entry.
- Cross-org read/write attempt succeeds.

## Functional Readiness Checklist

No automated test implementation is required in this phase, but these manual checks must pass before demo/release:

- Generate context for a seeded user.
- Ask: "List my properties" and verify scoped property data.
- Ask: "Show my tenants" and verify tenant data.
- Ask: "How much rent did I collect last month?" and verify financial result.
- Ask: "Add tenant Jane Doe" and verify all missing fields are requested together.
- Provide missing tenant fields and verify draft summary.
- Confirm draft and verify tenant is created once.
- Repeat confirm with same client request ID and verify no duplicate write.
- Cancel a draft and verify no mutation occurs.
- Confirm write refreshes context file best-effort.
- Attempt cross-org property or tenant reference and verify denial.
- Trigger rate limit path and verify friendly error.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Legacy and Agent 2.0 routes diverge | Bugs and inconsistent security | Treat `/api/agent` as the product path and retire or quarantine legacy paths after migration |
| Context markdown becomes stale | Incorrect answers | Hybrid regeneration plus context metadata and fallback tools |
| Prompt injection through context | Tool misuse or leakage | Delimit context, sanitize, validate tools server-side |
| Cross-org leakage | Critical security failure | Tool-level org scoping and no request-derived org IDs |
| Streaming destabilizes UI | Poor UX | Define a small SSE event contract, include graceful terminal `error` events, and keep UI state deterministic |
| LLM provider switch slows delivery | Schedule risk | Add interface now, switch provider later if needed |
| Cron behavior differs in production | Stale context | Make cron env-configurable and observable |

## Decisions Needed

1. Should weekly scheduled regeneration run inside the API process initially, or be delegated to Railway/cron infrastructure?
2. Which exact stronger OpenAI model should be the first Agent 2.0 default: `gpt-4.1`, `gpt-4.1-mini` is excluded by preference, or another current non-mini production model?
3. Should CRUD-triggered context refresh run synchronously after mutations or be queued best-effort to avoid slowing user actions?

## Immediate Next 3 Actions

1. Product Manager: confirm the remaining operational decisions above and freeze the Agent 2.0 streaming contract.
2. Senior API Engineer: implement Milestone 1 context service, regeneration endpoint, CRUD refresh hooks, and weekly scheduler.
3. Senior Frontend Web Engineer: replace legacy chat behavior with the `/api/agent` streaming client once backend event shapes are finalized.

## Go/No-Go Recommendation

Recommended plan: Go for functionality planning and phased implementation, with Agent 2.0 starting fresh under `/api/agent` while selectively reusing proven primitives from the existing assistant. Treat context generation, streaming route contract, tool naming alignment, CRUD-triggered context refresh, and security parity as the core delivery path.