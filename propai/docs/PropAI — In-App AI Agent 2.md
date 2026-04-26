# PropAI — In-App AI Agent 2.0 Planning

**Created:** 2026-04-24
**Status:** Planning
**Related:** [[PropAI]], [[OpenAI]], [[Claude]]

---

## 🧠 Mental Model

The agent needs three pillars — mirroring how Claude works inside [[Obsidian]]:

```
Context  →  Tools  →  Action Loop
```

- **Context** = what the agent knows (user data, properties, tenants)
- **Tools** = actions it can perform (read + write API calls)
- **Action Loop** = Claude/GPT decides when to call a tool vs. respond directly

---

## 🏗️ Architecture

### 1. Context Layer — What the Agent Knows

> Stored as per-user markdown files in `/data/user-context/{userId}.md`, injected into the system prompt at agent request time.

**Context file structure:**
```markdown
# PropAI Context — User {userId}

## User Profile
- Name, organization, unit count, active tenants

## Properties
| Address | Units | Status |

## Tenants
| Name | Unit | Rent | Status |

## Financial Summary
- Monthly rent, outstanding, last updated

## Open Requests
- Maintenance tickets
```

**Strategy:** 
- Store as markdown files (human-readable, version-controllable)
- Read + inject into system prompt at request time
- Update using **Hybrid strategy** (see below)

**Hybrid Update Strategy (Option C):**
1. **On-demand:** Regenerate user context file immediately after any write action (`create_tenant`, `log_payment`, etc.)
2. **Scheduled:** Run cron job every 30min that regenerates context for all users (catches read-only changes)
3. **Result:** Data stays fresh without per-request overhead

---

### 2. Tools Layer — What the Agent Can Do
> Each tool maps to an existing Express API endpoint

| Tool | Description | Type |
|---|---|---|
| `get_properties` | List all properties for the user | Read |
| `get_tenants` | List tenants with optional filters | Read |
| `get_financials` | Pull income/expense summary | Read |
| `get_maintenance_requests` | List open/closed tickets | Read |
| `create_property` | Add a new property/unit | Write |
| `create_tenant` | Onboard a new tenant | Write |
| `log_payment` | Record a rent payment | Write |
| `create_maintenance_request` | File a new maintenance ticket | Write |
| `update_maintenance_status` | Move ticket to in-progress/closed | Write |
| `send_notification` | Trigger email/SMS to a tenant | Write |
| `generate_report` | Export financial or lease report | Write |

---

### 3. Agent Loop

> Standard function-calling / ReAct pattern (works with both Claude and GPT-4o-mini)

```
User message
    ↓
Fetch user context MD file
    ↓
System prompt (user context injected)
    ↓
Claude/GPT → respond directly OR call a tool?
    ↓ (if tool)
Execute API call → return result to model
    ↓
Model formulates final natural language response
    ↓
Display to user
```

---

#### Scenario A — Display Data
> User asks to see existing data. Agent answers from context or calls a read tool.

```
User: "Show me all my tenants"
    ↓
Agent checks context MD (tenants already injected)
    ↓
No tool call needed — answers directly from context
    ↓
"You have 3 active tenants: John (B2), Sarah (B3), Mike (BG)"
```

**Rule:** If the answer is fully covered by the context MD → respond directly, no tool call.
If user wants deeper/filtered data (e.g. "show me all payments for John in 2025") → call `get_tenants` or `get_financials`.

---

#### Scenario B — Analyze Data
> User asks for insight or interpretation. Agent reasons over context, may call tools for deeper data.

```
User: "Which unit is costing me the most in maintenance?"
    ↓
Context MD has open requests summary — not enough detail
    ↓
Agent calls get_maintenance_requests (all tickets, with cost data)
    ↓
Tool returns full ticket list
    ↓
Agent reasons over results
    ↓
"Unit B2 has 3 tickets this year totalling $640 — highest of all units"
```

**Rule:** Agent should narrate its reasoning briefly ("Let me pull your maintenance history...") before tool call so the UI feels responsive.

---

#### Scenario C — Create/Edit/Delete (Full Data Provided)
> User provides all required fields. Agent drafts the action, asks for confirmation, then commits.

```
User: "Add a new tenant — Jane Doe, unit B2, $2,500/mo, lease starts May 1"
    ↓
Agent has all required fields: name, unit, rent, start date
    ↓
Agent presents a confirmation summary:
  "Here's what I'll create:
   - Name: Jane Doe
   - Unit: B2
   - Rent: $2,500/mo
   - Lease start: May 1, 2026
   Confirm?"
    ↓
User: "Yes" / "Confirm"
    ↓
Agent calls create_tenant with full payload
    ↓
API returns success
    ↓
Trigger context MD regeneration (on-demand)
    ↓
"Done — Jane Doe has been added to Unit B2 starting May 1."
```

**Rule:** Always show a human-readable summary before committing any write. Never execute silently.

---

#### Scenario D — Create/Edit/Delete (Partial Data Provided)
> User gives incomplete info. Agent identifies missing required fields and asks — one clarifying message, not one question at a time.

```
User: "Add a new tenant — Jake"
    ↓
Agent identifies missing required fields:
  ✅ Name: Jake
  ❌ Unit: missing
  ❌ Rent: missing
  ❌ Lease start date: missing
    ↓
Agent asks for all missing fields at once:
  "I need a few more details to add Jake:
   1. Which unit?
   2. Monthly rent amount?
   3. Lease start date?"
    ↓
User: "Unit B3, $2,200, June 1"
    ↓
Agent now has all fields → presents confirmation summary (→ Scenario C)
    ↓
User confirms → create_tenant called → context MD regenerated
```

**Rule:** Collect ALL missing required fields in one message — never ping-pong one question at a time.

---

#### Scenario E — Ambiguous Request
> User intent is unclear. Agent clarifies before doing anything.

```
User: "Remove John"
    ↓
Agent flags ambiguity — "remove" could mean:
  - Archive/offboard tenant
  - Delete entirely
  - End lease
    ↓
"Just to clarify — do you want to:
 A) End John's lease and mark him as a past tenant
 B) Delete his record entirely
 Which would you like?"
    ↓
User: "A"
    ↓
Agent proceeds with Scenario C flow (confirmation → commit)
```

**Rule:** Never assume intent on destructive or ambiguous actions. One short clarifying question, then proceed.

---

#### Scenario F — Out-of-Scope / Cannot Do
> User asks for something outside the agent's tool set.

```
User: "Draft a lease agreement for Jane"
    ↓
Agent has no generate_lease tool
    ↓
"I can't generate a lease document yet, but I can:
 - Add Jane as a tenant once you have her lease details
 - Log her first payment
 - Create a maintenance request for her unit
 Would any of those help?"
```

**Rule:** Don't just say "I can't do that." Always redirect to what the agent *can* do.

---

#### Scenario G — Multi-Step Action
> User request requires multiple tool calls in sequence.

```
User: "Onboard Jane Doe — Unit B2, $2,500/mo, lease May 1, and send her a welcome message"
    ↓
Agent identifies 2 actions needed:
  1. create_tenant
  2. send_notification (welcome)
    ↓
Agent presents combined confirmation:
  "Here's what I'll do:
   1. Create tenant: Jane Doe, B2, $2,500/mo, May 1
   2. Send welcome email to jane@email.com
   Confirm?"
    ↓
User confirms
    ↓
Agent executes sequentially:
  Step 1: create_tenant → success
  Step 2: send_notification → success
    ↓
Context MD regenerated
    ↓
"Done — Jane has been added and her welcome email has been sent."
```

**Rule:** Show all planned steps upfront in one confirmation. Execute sequentially. Report each step's outcome.

---

## 📦 Implementation Phases

### Phase 1 — Foundation
- [ ] Create `/data/user-context/` folder structure for user context MD files
- [ ] Define tool schemas (OpenAI/Anthropic `tools` array format)
- [ ] Build `/api/agent` endpoint to run the loop
- [ ] Build `/api/agent/context/regenerate` endpoint (on-demand + cron-triggered)
- [ ] Inject user context MD into system prompt
- [ ] Start with **read-only tools** only (`get_properties`, `get_tenants`, `get_financials`)
- [ ] Basic chat UI wired to the new endpoint
- [ ] Implement **Hybrid context update strategy** (on-demand + 30min cron)

### Phase 2 — Write Actions
- [ ] Add write tools (`create_tenant`, `create_property`, `log_payment`)
- [ ] Hook write endpoints to trigger immediate context regeneration
- [ ] Implement **confirmation step** before any write executes (Scenario C flow)
- [ ] Handle partial data — collect all missing fields in one message (Scenario D flow)
- [ ] Stream responses for better UX (`stream: true`)
- [ ] Add audit log entry for every AI-initiated write

### Phase 3 — Smarts
- [ ] [[RAG]] for large tenant/payment history (vector search over portfolio data)
- [ ] Conversation memory — persist thread history per user session
- [ ] Proactive suggestions (e.g. *"Unit 3 rent is 5 days late — want me to send a reminder?"*)
- [ ] Multi-step action chaining (Scenario G flow)
- [ ] Expand tool set as new features ship

---

## ⚠️ Key Design Decisions

| Decision | Options | Notes |
|---|---|---|
| **LLM choice** | GPT-4o-mini vs Claude | Start with [[Claude]] (better reasoning); abstract client for easy swap |
| **Context storage** | Per-user MD files vs. inline queries | MD files (human-readable, cacheable, auditable) |
| **Context update** | On-demand vs. scheduled vs. hybrid | **Hybrid (Option C)** — on-demand after writes + 30min cron |
| **Chat UI placement** | Floating sidebar vs. dedicated page | Sidebar feels more natural (like this panel) |
| **Confirmation UX** | Always confirm writes vs. only destructive ones | Start safe — confirm all writes in Phase 1 |
| **Missing fields** | Ask one-by-one vs. ask all at once | Ask all missing fields in one message |
| **Ambiguous actions** | Guess intent vs. clarify | Always clarify before destructive actions |
| **Out-of-scope requests** | Hard no vs. redirect | Always redirect to what agent CAN do |
| **Auth enforcement** | Agent scoped to user's org only | Enforce at tool level, not just prompt level |
| **Rate limiting** | Per-user token budget | Already exists — extend to agent endpoint |

---

## ⚡ Quickest Path to a Working Demo

1. User context MD file template + one regenerate endpoint
2. One `/api/agent` endpoint with the ReAct loop
3. 3 read tools + 1 write tool (`create_tenant`)
4. Simple chat UI component (reuse existing UI patterns)
5. System prompt with context MD injected

**Estimated time:** 1–2 days given existing stack and API endpoints already built.

---

## 🔗 Related
- [[PropAI]]
- [[Claude]]
- [[OpenAI]]
- [[RAG]]
- [[GPT-4o-mini]]
- [[Next.js]]
- [[Express]]
