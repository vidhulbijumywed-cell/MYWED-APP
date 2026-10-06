# Verification evidence

Validated on 6 October 2026 using Node 24.19.0, npm 11.9.0, Next.js 16.3.8, and system Chromium.

## Passed checks

- TypeScript: `npm run typecheck`.
- Six domain/integration tests: integer-money rules; zero/missing/specific rates; completed-work obligations and advances; refunds/overpayments; cancellation accounting; wedding-cohort versus cash date attribution; April–March boundaries; overdue completion; possible versus confirmed conflicts; tenant isolation; stable references after archival; Staff redaction and write denial (including no-op update responses); historical snapshots and audited rate overrides; synthetic workbook relationship mapping, financial reconciliation, duplicate prevention, and transactional rollback; salted password verification.
- Two Chromium tests: sign-up → email verification → workspace onboarding → client/package creation → crew/rates/assignments → advance → shoot completion → production and vendor partial payments → album and deliverable completion → final payments → reports. Client creation and module navigation run through the UI; the later operational steps also exercise direct APIs. All navigation pages render. PDFs begin with a valid PDF signature and exported XLSX reports can be parsed.
- Direct API attacks from a second company fail for foreign record modification, linked events, company switching, and client PDFs. Exports do not contain the other company's clients. Invited Staff sessions receive no financial report, package amounts, assignment rates, or financial exports. Password reset revokes prior sessions; reset links are single-use; logout denies later access.
- Import API: preview validated in a rolled-back transaction; explicit private confirmation required; wrong workspace rejects commit; committed relationships and totals reconcile; exact repeat upload flagged.
- Production compilation/build completed successfully. Both browser tests also passed against the production server with local-only HTTP cookie/outbox overrides; startup is separate from cloud publication.
- `npm audit --omit=dev`: zero reported vulnerabilities after a compatible ExcelJS uuid override.
- Desktop and mobile dashboard screenshots visually inspected; layout adapts to a 390px viewport.

## Private workbook inspection

The supplied workbook was inspected and parsed read-only. No operational customer/contact records, workbook files, database contents, or mail-outbox files are included in the repository. Worksheet structure, formulas, validation rules, and configurable defaults are documented separately. Automated tests and demo seed data are fictional.

## Unverified external capabilities / limitations

- No hosted PostgreSQL connection, Supabase email delivery, Resend delivery, hosting deployment, cloud publication, or fresh-task restoration was available to verify. Configure and verify them using DEPLOYMENT.md.
- Local email is a private developer outbox, not delivery to an external inbox. Managed auth code is included, while the passing account tests use the independently functional local auth mode.
- Browser tests run against local services and fictional records. They are not proof of public production readiness. Edge/distributed rate limiting and database schema exposure restrictions are required for public hosting.
- Client-facing PDF excludes internal costs, margin, notes, crew/vendor financial details by construction; multilingual typography is limited by standard PDF fonts.
