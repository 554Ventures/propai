# PropAI User Journeys (Properties, Units, Tenants, Leases)

Status: Implemented ✅

## Current State (What Exists)

### Data Model (Backend)
- Property -> Unit -> Lease <- Tenant
- Lease ties property, unit, and tenant together with dates, rent, status.

### UI Surface Area (Frontend)
- Properties list: `/properties`
- Property create: `/properties/new`
- Property detail/edit: `/properties/:id` (no units on this page)
- Tenants list: `/tenants`
- Tenant create: `/tenants/new`
- Tenant detail/edit: `/tenants/:id`
- Dashboard shows occupancy rate from leases, but there is no UI to create leases.

### API Surface Area (Backend)
- Properties CRUD: `/properties`
- Units CRUD: `/properties/:propertyId/units`, `/units/:id`
- Tenants CRUD: `/tenants`
- No Leases CRUD endpoints exposed.

### Current User Journeys (As Implemented)
- Create a property
  - Go to Properties -> Add Property -> Save -> land on property detail.
  - Property detail only supports editing property fields.
- Add units to a property
  - Not possible in the UI (API exists, no frontend).
- Create tenants
  - Go to Tenants -> Add Tenant -> Save -> land on tenant detail.
- Assign tenants to units
  - Not possible in the UI (requires leases, which are not exposed).
- Manage leases
  - Not possible in the UI (no leases page or lease creation flow).

## Problems Identified

- No UI affordance for creating units or seeing units per property.
- No UI for creating leases, which is required to associate tenants to units.
- Tenant creation is isolated from property/unit context; users can create tenants but cannot place them anywhere.
- The hierarchy is implicit (Property -> Unit -> Tenant) but not visible in any UI screen.
- Occupancy is shown on the dashboard but cannot be reconciled or updated by users.
- No visibility into which units are vacant vs occupied (no unit list or status indicators).
- No reassignment flow (move tenant to another unit) or end-of-lease flow.

## Recommended Journeys (Best Approach)

### Recommended Primary Flow: Property-First + Lease-Centric
Use Property-First as the default guided experience, but implement a Lease-Centric flow for power users and a Tenant-First shortcut.

Why:
- Property-First mirrors how PMs organize data (building -> units -> occupants).
- Lease-Centric gives a single place to resolve "assign tenant to unit" across the portfolio.
- Tenant-First should exist, but be optional and lightweight.

### Journey A: Property-First (Primary)
1. Create property
2. Property detail page shows Units section (list + "Add Unit")
3. Each unit row shows status (Vacant/Occupied) and an "Add Tenant" CTA
4. "Add Tenant" opens a combined flow:
   - Create/select tenant
   - Set lease terms (dates, rent, status)
5. Save -> Lease created -> Unit now shows Occupied

### Journey B: Tenant-First (Secondary)
1. Create tenant
2. After save, prompt: "Assign to a unit now?"
3. Assignment flow:
   - Select property
   - Select unit (filtered to vacant)
   - Set lease terms
4. Save -> Lease created -> Tenant is now linked to unit

### Journey C: Lease-Centric (Secondary / Power User)
1. Go to Leases page
2. "New Lease" button
3. Form:
   - Select property -> Unit (filtered) -> Tenant (select or create)
   - Lease terms (start, end, rent, status)
4. Save -> Lease created

## Wireframes (Text-Based)

### Property Detail (Units + Tenancy)
- Header: Property name + address
- Tabs or sections: Overview | Units | Notes
- Units section:
  - Button: "Add Unit"
  - Table/Grid:
    - Unit label
    - Beds/Baths/Sqft
    - Rent
    - Status: Vacant / Occupied
    - Tenant name (if occupied)
    - Actions: "Add Tenant" or "View Lease"

### Add Unit (Inline Modal / Drawer)
- Fields: Label, beds, baths, sqft, rent
- Save -> unit appears in list

### Add Tenant to Unit (Inline Drawer)
- Step 1: Select existing tenant OR create new (quick form)
- Step 2: Lease terms (start, end, rent, status)
- Confirm -> creates lease

### Tenant Detail
- Header: Tenant name + contact
- Section: Current Lease
  - Property + Unit
  - Dates + Rent + Status
  - Actions: "End Lease" | "Reassign Unit"

### Leases Page
- List/filter by property, status, end date
- "New Lease" button
- Row shows: Tenant, Property, Unit, Dates, Rent, Status

## Key Questions Answered

- Should units be managed on the property page or separate?
  - Primary: on the property page (inline units list).
  - Secondary: standalone Units page (optional) for power users and filtering across portfolio.

- Should tenant assignment happen during tenant creation or separately?
  - Both, but default to property/unit context to reduce confusion.
  - Tenant creation should prompt for assignment, but allow skipping.

- How do you visualize occupancy?
  - Unit list on property page with status badges (Vacant/Occupied).
  - Dashboard occupancy remains, but can be traced to units.

- Can you reassign a tenant to a different unit?
  - Yes: create a new lease for the new unit and end the old lease.
  - Provide "Reassign" action that ends the current lease (set endDate/status) and opens new lease flow.

- What happens when a lease ends?
  - Lease status set to ENDED, endDate required.
  - Unit becomes Vacant.
  - Tenant shows no active lease until reassigned.

## Implementation Tasks (Frontend Dev)

1. Property Detail Enhancements
   - Add Units section to `/properties/:id`.
   - Fetch units via `/properties/:propertyId/units`.
   - Show occupancy badges + tenant info (via lease lookup endpoint to be added).

2. Unit CRUD UI
   - Add "Add Unit" modal/drawer to property detail.
   - Optional: Unit detail page `/units/:id` for edits.

3. Lease Creation Flow
   - Add a reusable Lease form (property, unit, tenant, dates, rent, status).
   - Embed in:
     - "Add Tenant" on unit row (Property-First)
     - Tenant creation follow-up (Tenant-First)
     - Leases page (Lease-Centric)

4. Tenant Assignment UX
   - Tenant detail should show active lease or "Unassigned".
   - Add "Assign to Unit" CTA if no active lease.

5. Occupancy Visualization
   - On property page: show unit status, tenant name, lease dates.
   - On dashboard: link occupancy metrics to property/unit lists.

6. Lease Lifecycle Actions
   - "End Lease" action from unit/tenant view.
   - "Reassign" action triggers end + new lease flow.

7. Navigation Updates
   - Add Leases page to left nav.
   - (Optional) Units page for portfolio-wide view.

8. Backend Support Needed (for later implementation)
   - Leases CRUD endpoints (create/update/end/active lease lookup).
   - Unit occupancy endpoint or query to fetch unit + current lease + tenant in one call.
