# Workbook to application mapping

All 16 worksheets were inspected, including every formula cell, hidden rows/columns, validation references, instructions, and Setup values. `workbook-schema.json` retains sanitized worksheet structure and representative formulas; it contains no operational contact records. `workbook-defaults.json` retains configurable defaults.

| Workbook         | Relational model / behavior                                                      |
| ---------------- | -------------------------------------------------------------------------------- |
| Start Here       | Operational flow and help documented in README                                   |
| Dashboard        | Server cohort report, transaction cash report, comparisons, attention items      |
| Clients          | `clients`; company references, contact/package fields, server-derived financials |
| Events & Crew    | `events` + unlimited `assignments`; saved agreed rates, team, conflict checks    |
| Calendar         | Month, week, and agenda; client, crew, type, and status filters                  |
| Client Page      | Client overview, internal print/PDF, separate client-facing PDF                  |
| Payments In      | `client_payments`; advance/instalment/final/add-on and explicit refunds          |
| Crew Payments    | `crew_payments`; assignment/completed distinction, pending and advances          |
| Deliverables     | `deliverables`; promised/delivered dates, overdue unfinished work                |
| Albums           | `albums`; specifications, milestone dates, designer/printer vendor-job links     |
| Post-Production  | `jobs` + unlimited `vendor_payments`; balances and deadlines                     |
| Expenses         | `expenses`; nullable client means GENERAL overhead                               |
| Crew Directory   | `crew`; no account required                                                      |
| Crew Rates       | `rates`; unique member/role/event rate, snapshotted on assignment                |
| Vendor Directory | `vendors`; job counts, agreed sums, payment balances                             |
| Setup            | Per-company configurable dropdown lists, seeded on workspace creation            |

## Schema and implementation stages

1. Users, hashed sessions, one-time verification/reset/invitation tokens, companies, and memberships.
2. Clients, events, crew, unique rates, flexible assignments, archival, and role checks.
3. Client/crew/vendor ledgers, production jobs, expenses, and central integer-money calculations.
4. Deliverables, albums, calendar, client summaries/PDFs, dashboard, and reports.
5. Transactional XLSX import previews, scoped CSV/XLSX exports, tests, and deployment documentation.

UUIDs are stable primary keys. Composite `(company_id,id)` keys and foreign keys stop cross-company relationships. Assignment amounts are snapshots, not live rate lookups. Financial amounts are integer minor units. Quantities are positive integers; date/time constraints reject invalid intervals. Indexes cover tenant and date access. Operational records and monetary histories are normalized in the SQL migration.

## Explicit corrections and accounting rules

- Workbook client IDs use `ROW()-4`. Database counters replace that dependency. Imports reconstruct the existing row-derived references once, then preserve them permanently.
- Workbook rate formulas use `SUMIFS(...) > 0` to decide whether a specific rate exists. This incorrectly ignores a valid zero rate and sums duplicate rates. The app uses unique rate rows, checks existence, prefers specific event rates even at zero, then All functions. Missing rates remain null and require attention.
- Workbook rate changes recalculate historical event costs. App assignments snapshot the agreed amount; later directory-rate edits do not change history. Overrides require financial authorization, a reason when changed, and audit entries.
- Wedding cost counts assignment agreements, vendor job agreements, and wedding expenses. Crew/vendor payments change cash and obligations, never add a second cost. Album designer/printer jobs link to existing production jobs and add no duplicate expense.
- Contract = package + add-ons − discount. Receipts sum positive payments minus explicit refunds. Balance can be negative for an overpayment; it is not clamped. Profit margin is zero when effective contract is zero.
- Crew pending = max(0, completed work − paid); advance ahead = max(0, paid − completed work). Assigned-but-not-completed work is displayed separately. Completing an event marks its assignments completed for these calculations.
- Net expected business profit = selected cohort profit − GENERAL overheads dated in the report period. This combines the workbook cohort attribution with period overheads and is explicitly labelled. Actual cash inflows/outflows use transaction dates separately.
- First event date determines wedding cohort, falling back to booking date. Undated bookings are excluded from dated cohorts, but remain in the client directory. All-time crew/vendor obligations are labelled separately from period metrics.
- Workbook dashboard counts exclude Cancelled, while contract/cost sums include them inconsistently. The app excludes cancelled bookings from active wedding count but includes their cancellation financial results in profit/cash. On cancellation, the effective contract is the explicitly agreed cancellation charge (default zero), original quoted package remains stored, incurred costs remain, and received payments/refunds remain. Enter retained advance as the agreed cancellation charge, and record actual refunds as Refund payments. Never delete financial history.
- Workbook historical vendor advance/final columns have no payment dates. Imported amounts remain separate payment entries with unknown dates, affecting vendor balances but not dated cash. User correction supplies the true dates.
- Workbook helper IDs, keys, fixed 150/600-row limits, and cached formulas are not imported. All derived amounts are recomputed. Input records, relationships, and Setup values are preserved.

## Privacy

The attached real workbook was inspected read-only. No real records are seeded, copied into the source tree, or automatically committed. Import requires an authenticated Owner/Manager and explicit private-workspace confirmation. Fictional demo and tests use reserved example/test contacts.
