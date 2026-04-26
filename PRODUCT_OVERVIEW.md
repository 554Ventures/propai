# PropAI — Product Overview

**Last Updated:** April 24, 2026
**Status:** Active Development — Phase 4 Complete, Roadmap in Progress

---

## Executive Summary

PropAI is an AI-powered property management platform built for independent landlords and small property management companies. It centralizes property operations — from tenant onboarding and rent tracking to maintenance coordination and financial reporting — and layers intelligent automation on top to reduce manual work, surface actionable insights, and help owners make better decisions.

The platform targets a highly underserved segment: owners managing 1–200 units who lack the budget for enterprise tools like Yardi or AppFolio, but need more than a spreadsheet. PropAI's AI-first approach differentiates it by embedding intelligent assistance directly into daily workflows rather than treating it as a bolt-on feature.

---

## Target Market

| Segment | Description | Unit Range |
|---|---|---|
| Independent Landlords | Individual owners self-managing residential units | 1–20 units |
| Small Property Managers | Small PMCs managing on behalf of owners | 20–200 units |

**Primary Persona:** A property manager or owner who operates a single organizational workspace, handles day-to-day tenant relations, tracks income and expenses manually today, and wants a faster, smarter system without a steep learning curve.

---

## Problem Statement

Property managers today face:

- **Fragmented workflows** — rent tracking in spreadsheets, maintenance in texts, docs in email.
- **Manual financial overhead** — categorizing expenses and generating tax-ready reports takes hours.
- **Reactive maintenance** — no visibility into what will break or when.
- **Pricing guesswork** — setting rent without data on comparable market rates.
- **Slow tenant onboarding** — lease creation, unit assignment, and rent setup handled piecemeal.

PropAI solves these by providing a unified platform with AI embedded at each pain point.

---

## Current Features (As of April 2026)

### Authentication & Organization Management
- Secure JWT-based user authentication (signup and login)
- Organization-scoped workspace — each user operates within a named organization
- Role-based access control: Owner, Admin, Member
- Team invitation system — invite teammates via email, manage pending invites, and accept or revoke

### Property & Unit Management
- Full CRUD for properties with address, type, and metadata
- Unit management nested under properties (beds, baths, square footage, amenities)
- Unit lifecycle management — deactivate and reactivate units
- Archived property support for portfolio lifecycle management

### Tenant & Lease Management
- Tenant profiles with contact information and lease history
- Lease creation with date ranges, rent amount, and status tracking
- Lease status transitions (active, expired, terminated)
- Conflict detection to prevent double-occupancy on a unit
- Digital lease document storage

### Rent & Cash Flow Tracking
- Cash flow transaction ledger — log and categorize income and expenses per property
- Transaction filtering and history view
- Dashboard metrics: total income, outstanding rent, occupancy rate
- Alerts for late payments, expiring leases (within 30 days), and pending maintenance

### Maintenance Management
- Tenant-submitted maintenance requests with descriptions and categorization
- Request status workflow: Pending → In Progress → Completed
- Vendor directory with service categories and contact information
- Vendor assignment to maintenance requests
- Cost tracking per maintenance event
- AI-powered smart vendor matching and cost analysis

### Document Storage
- Centralized document repository per organization
- File upload with property and lease association
- Document type tagging (lease, receipt, inspection, insurance, tax, other)
- Basic text extraction (OCR) for uploaded documents
- Search and retrieval by property or document type

### AI Assistant (Chat)
- Conversational AI assistant embedded in the platform
- Explicit conversation modes: Chat, Clarify, Draft, Confirm, Result
- Supports read-only Q&A across the full portfolio (rent status, expenses, leases, documents)
- Supports write actions with a draft-and-confirm safety flow before execution
- Idempotent action execution — no duplicate mutations on retry
- Full audit log of all AI-initiated actions
- Rate limiting and budget controls per organization
- Content moderation and prompt injection guardrails
- AI action history visible to users

### Dashboard & Analytics
- Portfolio overview: occupancy rate, total income, outstanding balances, maintenance backlog
- Alerts panel for actionable items requiring attention
- Cash flow trend chart (last 6–12 months)
- Income vs. expenses visualization
- AI-generated insights feed with confidence indicators

### AI Insights (Embedded)
- Smart expense categorization from transaction descriptions
- Cash flow forecasting by property and portfolio with monthly projections
- Vendor performance scoring (cost, speed, quality)
- Maintenance prediction signals based on property age and history
- Tax insight flags identifying deductible expense categories

### Infrastructure & Security
- HTTPS with encryption in transit and at rest
- Input sanitization and output filtering on all AI endpoints
- Row-level security — users can only access data within their organization
- API rate limiting across standard and AI endpoints
- Automated API test suite (Vitest)
- End-to-end test coverage for critical workflows (Playwright)
- Deployable on Vercel (web) + Railway (API + Postgres)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, TypeScript, TailwindCSS, shadcn/ui |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL with Prisma ORM |
| AI | OpenAI API (GPT-4o-mini) |
| File Storage | Local disk (dev), S3/R2-compatible (production) |
| Auth | JWT-based sessions |
| Deployment | Vercel (web) + Railway (API) |
| Testing | Vitest (unit/integration), Playwright (E2E) |

---

## Roadmap — Upcoming Features

### Near-Term (Next 4–6 Weeks)

#### Email Notifications
- Automated payment reminders 3 days before rent due date
- Lease expiration alerts 30 days in advance
- Maintenance status update notifications to tenants and owners

#### Reporting & Exports
- Monthly and annual income statements per property
- Schedule E-ready tax export for accountants
- Portfolio performance reports in PDF and CSV formats

#### AI Insights Enhancements
- Improved expense categorization accuracy with user override learning
- Cash flow trend analysis with anomaly detection
- Dashboard insights widget with proactive recommendations

### Medium-Term (Post-MVP Stabilization)

#### Rent Optimization AI
- Local comparable market data integration
- AI-generated rent pricing suggestions with confidence scores
- Historical rent trend analysis by neighborhood and unit type

#### Tenant Risk Scoring
- Payment pattern analysis to flag at-risk tenants early
- Lease renewal recommendations based on tenant history
- Screening score integration

#### Enhanced Vendor Management
- Vendor performance ratings and benchmarking
- Preferred vendor lists and auto-assignment rules
- Expense integration linking vendor invoices to maintenance requests automatically

#### Multi-Organization Support
- Allow a single user to manage multiple organizations (e.g., multiple portfolios)
- Cross-portfolio reporting and consolidated dashboard

### Long-Term

#### Mobile Application
- Native iOS and Android apps for on-the-go property management
- Offline-first support for maintenance logging in the field
- Push notifications for alerts and AI recommendations

#### Online Rent Collection
- Stripe-powered card and ACH rent payments
- Automatic ledger updates on payment confirmation
- Optional Plaid bank linking for direct bank payments

#### Tenant Portal
- Self-service portal for tenants to submit maintenance requests, view rent history, and access lease documents
- Two-way in-app messaging between property managers and tenants

#### Advanced Financial Suite
- Full accounting ledger per property
- Multi-owner distribution tracking
- Integration with QuickBooks or Xero

#### Internationalization
- Multi-currency support
- Localized tax reporting templates

---

## Business Value Summary

| Value Driver | How PropAI Delivers It |
|---|---|
| Time savings | Onboard a property and tenant in under 10 minutes; AI handles categorization and reminders automatically |
| Tax readiness | Generate Schedule E-ready reports in under 5 seconds without manual reconciliation |
| Revenue optimization | AI rent suggestions within 5% of market rate help owners price competitively |
| Risk reduction | Tenant risk scoring and lease expiration alerts reduce late payments and vacancy gaps |
| Maintenance efficiency | Predictive maintenance signals and smart vendor matching cut reactive repair costs |
| Audit confidence | Full AI action logs and role-based access ensure nothing happens without accountability |

---

## Success Metrics (v1.0 Targets)

- **80%+** expense auto-categorization accuracy
- **<5 seconds** to generate a tax-ready financial report
- **<10 minutes** to onboard a new property and tenant end-to-end
- **<5% variance** between AI rent suggestions and actual market rates
- **Mobile offline access** for core workflows (maintenance logging, tenant lookup)

---

## Deployment

PropAI is deployed as two services:

- **Web app** — hosted on Vercel, globally distributed CDN
- **API + Database** — hosted on Railway with a managed PostgreSQL instance

Both services are containerization-ready (Docker / Nixpacks) and environment-configurable for staging and production separation.

---

*For technical setup and API documentation, see [README.md](README.md) and [docs/](docs/).*
