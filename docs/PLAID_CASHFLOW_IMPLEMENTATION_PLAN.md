# Plaid Cashflow Streaming Implementation Plan

Date: 2026-04-26
Owner: PropAI Product
Status: Foundational MVP plan

## Goal

Enable PropAI users to connect bank accounts through Plaid so income and expense transactions automatically stream into PropAI cashflow, are auto-categorized, and are routed into a review workflow when PropAI cannot confidently assign a property and/or category.

This should reduce manual transaction entry while preserving user control over financial accuracy.

## Success Criteria

- Users can securely connect one or more bank accounts through Plaid Link.
- PropAI automatically imports and refreshes bank transactions into the cashflow ledger.
- Imported transactions are deduplicated and org-scoped.
- Transactions are auto-categorized into PropAI cashflow categories with a confidence score.
- Clear income and expense transactions appear in cashflow without manual entry.
- Unclear transactions are flagged for user review.
- Users can assign or correct property and category for flagged transactions.
- User corrections improve future matching behavior through deterministic rules or saved mappings.
- MVP supports a complete audit trail for imported transactions, user edits, and sync status.
- No transaction is used for user-facing financial reporting until it is confidently categorized or explicitly reviewed.

## Scope

### In Scope For Foundational MVP

- Plaid Link setup in the web app.
- Backend Plaid item and account storage.
- Secure Plaid access token exchange and storage.
- Initial transaction sync after account connection.
- Recurring transaction sync using Plaid Transactions Sync.
- Cashflow transaction creation from Plaid transactions.
- Deduplication using Plaid transaction IDs and account IDs.
- Basic income vs expense detection.
- Auto-categorization using Plaid metadata plus PropAI category rules.
- Property assignment using simple rules:
  - Known tenant/rent payer match.
  - Vendor/property mapping if previously confirmed.
  - Account-level default property when configured.
  - Otherwise mark as needs review.
- Review queue for unclear transactions.
- User ability to select property and/or category for unclear transactions.
- User ability to approve, edit, ignore, or exclude imported transactions.
- Sync status visibility and error states.
- Audit logging for connection, sync, categorization, review, and user override events.

### Non-Goals

- Full accounting suite or general ledger.
- Bank payments, ACH initiation, or rent collection via Plaid.
- Multi-currency support.
- Owner distributions.
- Reconciliation against statements.
- Tax filing automation.
- Complex AI categorization model training in the MVP.
- Fully autonomous financial decisions without user override.
- Replacing existing manual cashflow entry.

## Personas

- Independent landlord: wants bank activity to appear in PropAI without manual entry.
- Small property manager: wants transactions routed to the right property and category across multiple units.
- Admin/bookkeeper: wants a review queue for ambiguous financial activity before reports are trusted.

## Current Product Context

PropAI already has cashflow transaction CRUD, filters, portfolio totals, and AI-supported expense categorization at the API layer. The Plaid MVP should extend the existing cashflow model rather than create a separate finance workflow.

The current product principle still applies: AI and automation may suggest categorization, but users must be able to review, override, and audit financial outputs.

## Milestones

| Milestone | Outcome | Owner | Effort | Target |
|---|---|---:|---:|---|
| M1: Product and Data Contract | Finalized Plaid/cashflow data model, review states, category taxonomy, and API contract | Senior API Engineer + PM | S | Start now |
| M2: Plaid Backend Foundation | Plaid token exchange, item/account persistence, webhook endpoint, sync job skeleton | Senior API Engineer | M | MVP foundation |
| M3: Transaction Import Pipeline | Initial sync, incremental sync, dedupe, cashflow draft creation, sync status | Senior API Engineer | M | MVP foundation |
| M4: Categorization and Review Logic | Auto-categorization, confidence scoring, property matching, needs-review state | Senior API Engineer | M | MVP foundation |
| M5: Web Account Connection UX | Plaid Link entry point, connected accounts page/section, sync/error states | Senior Frontend Web Engineer | M | MVP foundation |
| M6: Review Queue UX | User workflow for assigning property/category, approving, excluding, and bulk confirming transactions | Senior Frontend Web Engineer | M | MVP foundation |
| M7: QA, Security, and Release Readiness | Tests, audit checks, failure handling, rollout flags, production checklist | Senior API Engineer + Senior Frontend Web Engineer | M | Before pilot |

## Backlog

### Must Have

| Item | Owner | Notes |
|---|---|---|
| Define Plaid item/account/transaction data model | Senior API Engineer | Include org scoping, user ownership, sync cursor, encrypted token storage. |
| Add Plaid environment configuration | Senior API Engineer | Sandbox/development/production keys, webhook URL, product config. |
| Implement Plaid Link token endpoint | Senior API Engineer | Authenticated and org-scoped. |
| Implement public token exchange endpoint | Senior API Engineer | Store access token securely; never expose token to frontend. |
| Store connected Plaid accounts | Senior API Engineer | Include account name, mask, type, subtype, active status. |
| Implement initial transaction sync | Senior API Engineer | Use Plaid Transactions Sync where possible. |
| Implement incremental transaction sync | Senior API Engineer | Store cursor and handle added, modified, removed transactions. |
| Implement transaction deduplication | Senior API Engineer | Use Plaid transaction ID and account ID. |
| Map Plaid transactions into PropAI cashflow | Senior API Engineer | Preserve raw Plaid metadata for audit/debug. |
| Add categorization confidence state | Senior API Engineer | Suggested, confirmed, needs_review, excluded. |
| Add property assignment confidence state | Senior API Engineer | Suggested, confirmed, needs_review, unassigned. |
| Add unclear transaction review API | Senior API Engineer | List, update, approve, bulk approve, exclude. |
| Add audit logging | Senior API Engineer | Log sync, categorization, user override, exclusion. |
| Add Plaid Link frontend flow | Senior Frontend Web Engineer | Start connection, launch Link, submit public token. |
| Add connected accounts UI | Senior Frontend Web Engineer | Show institution/account, sync status, errors, disconnect state. |
| Add transaction review queue | Senior Frontend Web Engineer | Filter unclear transactions, assign property/category, approve. |
| Add unclear transaction indicators in cashflow | Senior Frontend Web Engineer | Prevent silent mixing of uncertain imported data. |
| Add loading, empty, error, and retry states | Senior Frontend Web Engineer | Required for bank connection and sync workflows. |
| Add API tests for Plaid sync and review states | Senior API Engineer | Mock Plaid client. |
| Add frontend tests for connection and review flows | Senior Frontend Web Engineer | Use mocked API responses. |

### Should Have

| Item | Owner | Notes |
|---|---|---|
| Saved merchant/vendor categorization rules | Senior API Engineer | Apply future mappings after user confirmation. |
| Saved property assignment rules | Senior API Engineer | Example: vendor X usually maps to property Y. |
| Bulk review actions | Senior Frontend Web Engineer | Approve all high-confidence suggestions. |
| User-visible sync history | Senior Frontend Web Engineer | Last successful sync, next sync, imported count. |
| Manual resync button | Senior Frontend Web Engineer + Senior API Engineer | Rate-limit and show progress. |
| Webhook handling for Plaid updates | Senior API Engineer | Use as trigger for sync job. |
| Account disconnect/deactivation flow | Senior API Engineer + Senior Frontend Web Engineer | Preserve historical transactions unless user excludes/deletes separately. |
| Category taxonomy review | PM + Senior API Engineer | Align with Schedule E/reporting needs. |
| CSV fallback import path alignment | PM + Engineering | Ensure future CSV import can reuse review/categorization logic. |

### Could Have

| Item | Owner | Notes |
|---|---|---|
| AI-assisted transaction explanation | Senior API Engineer | Explain why a category/property was suggested. |
| Tenant rent payment matching | Senior API Engineer | Match deposits to tenant/lease records. |
| Vendor recognition dashboard | Senior Frontend Web Engineer | Show frequent merchants and mapping status. |
| Monthly reconciliation summary | Senior API Engineer + Senior Frontend Web Engineer | Not full reconciliation, just import completeness. |
| Notifications for transactions needing review | Senior Frontend Web Engineer | Useful after baseline workflow is stable. |
| Cashflow anomaly detection | PM + Engineering | Later AI insight once streaming data volume exists. |

## Explicit Task Assignments

### Senior API Engineer

1. Finalize backend data model for Plaid items, accounts, imported transactions, sync cursors, categorization status, property assignment status, and audit events.
2. Add Prisma migrations for Plaid connection and imported transaction metadata.
3. Implement Plaid client wrapper with environment-specific configuration.
4. Build authenticated endpoints:
   - Create Link token.
   - Exchange public token.
   - List connected accounts.
   - Disconnect/deactivate account.
   - Trigger sync.
   - List transactions needing review.
   - Approve/update/exclude imported transactions.
5. Implement Plaid Transactions Sync ingestion:
   - Initial sync.
   - Incremental sync.
   - Added/modified/removed transaction handling.
   - Cursor persistence.
   - Idempotent retries.
6. Map Plaid transactions into PropAI cashflow records while preserving Plaid metadata.
7. Implement categorization engine:
   - Use Plaid category/merchant metadata.
   - Apply PropAI category mapping.
   - Apply saved user/org rules.
   - Emit confidence and reason.
8. Implement property matching:
   - Match known tenant/rent payer where possible.
   - Apply saved vendor/property rules.
   - Fall back to needs_review when uncertain.
9. Add audit logs for sync, imported transaction creation, categorization, review, override, exclusion, and account disconnect.
10. Add tests covering token exchange, sync idempotency, dedupe, category mapping, property review state, removed transactions, and auth/org isolation.

### Senior Frontend Web Engineer

1. Add Plaid connection entry point from cashflow/settings surface.
2. Integrate Plaid Link using backend-created Link token.
3. Submit public token to backend and handle connection success/failure.
4. Build connected bank accounts UI:
   - Institution/account display.
   - Mask/type/subtype.
   - Last sync status.
   - Error state.
   - Disconnect/deactivate action.
5. Build imported transaction review queue:
   - Show transactions requiring property and/or category selection.
   - Support category dropdown.
   - Support property selector.
   - Support approve, edit, exclude, and bulk approve where available.
6. Add imported transaction indicators to cashflow:
   - Source: manual vs Plaid.
   - Review status.
   - Confidence status where useful.
7. Add clear UX for ambiguous transactions:
   - Needs property.
   - Needs category.
   - Needs property and category.
8. Add empty states for no connected accounts and no transactions needing review.
9. Add frontend tests for Plaid connection, account list, review queue, approval, exclusion, and error states.
10. Coordinate with API engineer on API response contracts before building final UI states.

## Acceptance Criteria

### Bank Connection

- Given an authenticated user, when they start bank connection, the web app launches Plaid Link using a backend-generated Link token.
- Given a successful Plaid Link flow, when the public token is exchanged, PropAI stores the connection securely and displays connected accounts.
- Given a Plaid token exchange failure, the user sees a clear retryable error and no partial account appears as active.
- Plaid access tokens are never exposed to the browser.

### Transaction Streaming

- Given a connected bank account, PropAI imports available transactions into the org's cashflow pipeline.
- Given a subsequent sync, only new or changed transactions are applied.
- Given the same Plaid transaction appears multiple times, PropAI does not create duplicate cashflow entries.
- Given Plaid marks a transaction as removed, PropAI updates the imported transaction state without silently deleting user-reviewed financial history.
- Sync failures are logged and visible in account status.

### Auto-Categorization

- Given a clear transaction, PropAI assigns income/expense type and category automatically.
- Given Plaid metadata and saved user rules conflict, PropAI follows the configured precedence and records the reason.
- Given a low-confidence category, the transaction is marked as needs_review.
- Given a user changes a category, the confirmed value is used in cashflow and logged as a user override.

### Property Assignment

- Given PropAI can confidently associate a transaction with a property, it assigns that property automatically.
- Given PropAI cannot determine the property, the transaction is flagged for review.
- Given the user selects a property for a flagged transaction, the cashflow record updates and the choice is audit logged.
- Given a transaction is portfolio-level or not property-specific, the user can leave it unassigned or mark it accordingly if supported by the existing cashflow model.

### Review Queue

- Users can filter to transactions needing category, property, or both.
- Users can approve a suggested transaction without editing.
- Users can change property and category before approving.
- Users can exclude a transaction from PropAI cashflow reporting.
- Reviewed transactions no longer appear in the unclear transaction queue.
- Cashflow reports do not treat unresolved transactions as final confirmed financial data.

### Security And Compliance

- Plaid tokens are encrypted or stored using an approved secret-storage pattern.
- All Plaid data is org-scoped and protected by existing auth middleware.
- Audit logs capture automated and manual changes.
- The system does not expose full bank account numbers.
- The system does not make lending, tenant screening, eviction, or fair-housing-impacting decisions based on Plaid data.

## Dependencies

- Plaid developer account and app configuration.
- Plaid Products: Transactions, Auth only if needed later.
- Plaid Link frontend package.
- Secure secret management for Plaid client ID, secret, environment, and webhook secret.
- Backend storage for Plaid access tokens, items, accounts, transactions, and sync cursors.
- Existing PropAI cashflow APIs and data model.
- Existing property and category models.
- Existing auth/org scoping middleware.
- Existing audit/logging conventions.
- Product decision on category taxonomy and reporting treatment of unresolved transactions.
- QA access to Plaid Sandbox credentials and test institutions.

## Risks

| Risk | Severity | Mitigation |
|---|---:|---|
| Incorrect auto-categorization creates inaccurate financial reports | High | Use confidence states, review queue, user override, audit trail, and exclude unresolved transactions from final reporting. |
| Property assignment is ambiguous across multi-property portfolios | High | Require review when confidence is low; save confirmed mappings for future transactions. |
| Plaid sync creates duplicate or stale transactions | High | Use Plaid transaction IDs, account IDs, sync cursors, idempotent writes, and tests for retries. |
| Token handling creates financial data security exposure | High | Encrypt tokens, restrict access, avoid frontend exposure, audit access, follow Plaid security guidance. |
| Users overtrust automation | Medium | Clearly label suggested vs confirmed transactions and keep review workflow prominent. |
| Plaid webhooks or sync jobs fail silently | Medium | Add sync status, retry behavior, error logs, and manual resync. |
| Plaid category taxonomy does not map cleanly to PropAI reporting categories | Medium | Create explicit mapping table and product-owned category decisions. |
| MVP scope expands into accounting/reconciliation | Medium | Keep non-goals explicit and ship import/review foundation first. |

## Compliance Notes

- Plaid data must be treated as sensitive financial data.
- Do not use bank transaction data for tenant eligibility, tenant screening, eviction recommendations, or any fair-housing-sensitive decisioning.
- Provide clear user control over connected accounts and imported transaction treatment.
- Maintain auditability for automated categorization and user edits.
- Ensure privacy policy and user consent language covers bank connection and transaction import before production launch.

## Immediate Next Actions

1. PM: Confirm MVP category taxonomy and unresolved transaction reporting behavior.
2. Senior API Engineer: Draft Plaid/cashflow data model and API contract for review.
3. Senior Frontend Web Engineer: Draft the Plaid connection and review queue UX flow using existing cashflow patterns.
4. Senior API Engineer: Create Plaid Sandbox configuration and validate token exchange locally.
5. Senior API Engineer + Senior Frontend Web Engineer: Agree on review queue response shape before UI build.
6. PM + Engineering: Define rollout plan: internal sandbox test, pilot org, then limited production release.
7. PM: Confirm user-facing consent copy and privacy policy updates required for bank data import.

## MVP Release Gate

The foundational MVP is ready for pilot only when:

- At least one Plaid Sandbox institution can connect end-to-end.
- Transactions import into PropAI without duplication.
- Clear transactions auto-categorize.
- Unclear transactions are routed to review.
- Users can assign property and category before approval.
- Imported transaction state is visible in cashflow.
- Token handling and org isolation are verified.
- API and frontend tests cover the core connection, sync, and review flows.
- Known risks and limitations are documented for pilot users.