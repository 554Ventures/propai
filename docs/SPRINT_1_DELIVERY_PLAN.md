# Sprint 1 Delivery Plan — Property Management Improvements

**Date:** 2026-04-05  
**Status:** SHIPPED — all Sprint 1 items complete, API tests green (38/38)

---

## Product Decisions (Finalized)

| Decision | Choice |
|---|---|
| Property deletion | **Archive-only** (`archivedAt`) — no hard delete |
| Maintenance scope | **Dual-scope** — property-level + optional unit linkage |
| Documents location | **Single source of truth** — appears on both property detail and top-level Documents page |
| Lease editing | **All fields editable** for now; fair-housing flag noted in code comments |

---

## M0 — Schema Migration (Completed)

**Owner:** Senior API Engineer  
**Migration:** `20260405173903_property_archived_at`

- Added `archivedAt DateTime?` to `Property` model in `apps/api/prisma/schema.prisma`
- Mirrors existing `Unit.archivedAt` pattern
- Migration applied to dev and test databases

---

## Sprint 1 — MUST Items (Completed)

### M1 — End Lease Action
**File:** `apps/web/src/app/(app)/properties/[id]/page.tsx`

- "End Lease" button (destructive variant) on unit cards where `lease.status === "ACTIVE"`
- Confirmation modal shows tenant name + warning ("cannot be undone without re-creating a lease")
- On confirm: `PATCH /leases/:leaseId { status: "ENDED" }` → refreshes unit list → success toast
- Unit card transitions to Vacant status

### M2 — Unit Reactivate
**File:** `apps/web/src/app/(app)/units/deactivated/page.tsx`

- "Reactivate" button per deactivated unit row (was already wired; added success toast)
- On confirm: `PATCH /units/:id/reactivate` → unit removed from deactivated list

### M3 — Unit Edit Drawer
**Files:** `apps/web/src/app/(app)/properties/[id]/page.tsx`, `apps/api/src/routes/units.ts`

- "Edit" button on every active unit card
- Modal pre-filled with current values: `label`, `bedrooms`, `bathrooms`, `squareFeet`, `rent`
- Diff-only PATCH: only changed fields sent to `PATCH /units/:id`
- API allow-list hardened: only `{ label, bedrooms, bathrooms, squareFeet, rent }` accepted
- Input validation added: negative rent, bedrooms, squareFeet rejected with 400

### M4 — Property Unit/Vacancy Counts
**Files:** `apps/api/src/routes/properties.ts`, `apps/web/src/app/(app)/properties/page.tsx`

- `GET /properties` now returns `unitCount` and `vacancyCount` per property
- Computed via nested Prisma include (no raw SQL): active units / units with no ACTIVE lease
- Property list cards render "X units · Y vacant" (gracefully hidden if fields absent)

---

## Security Fixes (Shipped with Sprint 1)

**Owner:** AI Security Expert

| Severity | Issue | Fix |
|---|---|---|
| Critical | Mass assignment on `PATCH /properties/:id` (req.body → Prisma directly) | Allow-listed to `{ name, addressLine1, addressLine2, city, state, postalCode, country, notes }` |
| Medium | No numeric range validation on unit PATCH (negative rent/beds accepted) | Runtime guards added before Prisma update |
| Medium | Lease status enum not validated at runtime (schema leak on invalid value) | Enum guard `["DRAFT", "ACTIVE", "ENDED"]` added to `PATCH /leases/:id` |

---

## Tests (API — 38/38 passing)

**Owner:** Senior SDET

New test coverage added:
- `apps/api/src/__tests__/units.test.ts` — allow-list drops rogue `organizationId`; rent-only PATCH leaves other fields unchanged
- `apps/api/src/__tests__/properties.test.ts` — `GET /properties` returns `unitCount: 2, vacancyCount: 1` for correct fixture

> Playwright E2E tests were removed from `apps/web` — focus on vitest unit/API tests only.

---

## Sprint 2 — Queued

| ID | Feature | Owner | Dependency |
|---|---|---|---|
| S1 | Dedicated `POST /properties/:id/archive` + `/unarchive` endpoints; UI archive toggle | API + Frontend | M0 schema Live ✅ |
| S2 | Lease edit drawer on unit card | Frontend | None |
| S3 | Maintenance section on property detail (dual-scope: property + optional unit) | API + Frontend | None |
| S4 | Documents panel on property detail; verify `GET /documents?propertyId=` filter | API + Frontend | None |

### Sprint 2 Security Pre-baked Requirements

- **S1 archive**: Block archiving properties with active leases; emit audit log entry; ensure archived properties are excluded from AI context enumeration
- **S4 documents**: Multipart content-type validation, MIME sniffing hardening, per-org storage path isolation, pre-signed URL expiry for retrieval

---

## Critical Path

```
M0 (done) → S1 archive API → S1 archive UI → all Sprint 2 items parallel
M1/M2/M3/M4 (all done, independent) → S2/S3/S4 (all independent)
```
