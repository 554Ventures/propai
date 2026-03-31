# PropAI Chatbot Plan

Date: 2026-03-31
Owner: PM
Status: Draft for Phase 5 (Feature Expansion)

## Objectives
- Provide fast, accurate answers to property management questions using live PropAI data.
- Enable task automation (maintenance, reminders, document lookup) with clear audit trails.
- Keep data access secure (RLS, tenant separation) and responses explainable.

## Integration Options (Research Summary)
1) OpenAI (Assistants API / Responses API)
- Pros: Strong function calling, built-in file search/RAG, easy integration with existing Node backend.
- Cons: Assistants API is deprecated; would need to migrate to Responses API over time.
- Fit: Best for tight backend integration and advanced tool use.

2) Anthropic Claude (tool use)
- Pros: High-quality reasoning, tool use support, flexible prompting.
- Cons: Requires more custom orchestration for retrieval, tool calls, and conversation state.
- Fit: Strong alternative if model preference or cost/perf warrants it.

3) Custom RAG (self-managed)
- Pros: Full control over retrieval, embeddings, and cost; can use existing DB/pgvector.
- Cons: More engineering effort; relevance tuning and evaluation required.
- Fit: Great for long-term scale or strict data governance.

4) Voiceflow / Botpress (platforms)
- Pros: Fast UI deployment, hosted widgets, non-dev iteration.
- Cons: Less control over data/security; harder to integrate deep app actions.
- Fit: Good for marketing/support chat, weaker for core product automation.

## Recommended Approach
Primary: OpenAI Responses API with function calling + file_search, using an Assistants-style architecture in our backend.
- Rationale: Fastest path to a high-quality MVP with reliable tool use and retrieval.
- Note: Assistants API is deprecated; we should implement with the Responses API and keep the internal abstraction compatible with either provider.
- Contingency: If we decide to avoid OpenAI, we can swap the model provider and keep the tool/function layer intact.

## Architecture (MVP)
Frontend
- Floating chat widget (web) that supports quick actions and conversation history.
- Auth-bound to current PM account; contextual to selected property.

Backend
- POST /api/chat: Accepts message + context, returns assistant response.
- GET /api/chat/history: Returns recent conversation messages for the user.
- Tool/function layer: Executes app queries and actions with strict permission checks.
- Conversation store: DB tables for sessions, messages, and tool calls.

Data Flow
1) User message -> /api/chat
2) Backend builds context (user, property, permissions)
3) LLM responds or requests tool calls
4) Tools fetch PropAI data / perform actions
5) LLM returns final response with citations or references

## Conversation State
- Create ChatSession per user (and optional property scope).
- Store ChatMessage (role, content, timestamps, metadata).
- Store ToolCallLog (tool name, inputs, outputs, status).
- Use session_id in widget local storage; server validates ownership.

## Function Calling (Initial Set)
Read queries
- getRentCollected(range, propertyId?)
- getOutstandingRent(propertyId?)
- listProperties()
- getPropertyExpenses(range, propertyId)
- getLeaseEnding(range, propertyId?)
- findDocument(query, propertyId?)

Actions
- createMaintenanceRequest(unitId, title, description, priority)
- scheduleMaintenance(requestId, vendorId, date)
- sendTenantMessage(tenantId, message)

## Example Conversation Flows
1) Rent summary
User: "How much rent did I collect last month?"
Assistant -> tool: getRentCollected(range=last_month)
Assistant: "You collected $X across Y properties. Top property: Z."

2) Maintenance task
User: "Schedule maintenance for Unit 2A next Tuesday."
Assistant -> tool: createMaintenanceRequest + scheduleMaintenance
Assistant: "Scheduled for 2026-04-07. Want to notify the tenant?"

3) Tenant inquiry
User: "When is John Smith's lease ending?"
Assistant -> tool: getLeaseEnding(tenant=John Smith)
Assistant: "Lease ends 2026-08-31. Reminder set for 30 days prior."

4) Financial analysis
User: "Show me expenses breakdown for Oak Street."
Assistant -> tool: getPropertyExpenses(range=YTD, property=Oak Street)
Assistant: "Top categories: Repairs 35%, Utilities 22%, Taxes 14%..."

5) Document search
User: "Find the lease for John Smith."
Assistant -> tool: findDocument(query="lease John Smith")
Assistant: "Found lease.pdf (signed 2025-09-01). Open it?"

## Implementation Phases
Phase 1: MVP (1-2 weeks)
- Backend endpoints /api/chat and /api/chat/history
- Tool calling for read queries (rent, expenses, leases, documents)
- Basic widget UI and history

Phase 2: Automation (2-3 weeks)
- Action tools (maintenance, reminders, tenant messaging)
- Audit log + undo/confirm workflow

Phase 3: Retrieval & Insights (2-3 weeks)
- Document search improvements (metadata filters, summaries)
- Insights prompts for trends + anomalies

Phase 4: Expansion (future)
- Multi-channel (SMS/email/tenant portal)
- Voice support
- Deeper workflow automations

## Complexity & Quick Wins
Quick wins (low complexity)
- Rent collected / outstanding rent queries
- Lease end date lookup
- Document search by tenant or property

Medium
- Expense breakdowns + trend summaries
- Maintenance scheduling with vendor lookup

High
- Automated financial analysis with proactive alerts
- Multi-step workflows with confirmations

## Open Questions
- Which provider should be default for the MVP (OpenAI Responses API vs Assistants API)?
- Do we allow action tools to execute immediately or require explicit confirmation?
- How will we display citations for data-driven answers in the UI?
- Do we scope conversations by property context or allow cross-portfolio by default?
