# MyWed

A runnable, company-scoped wedding photography business application built from the supplied wedding tracker. Next.js 16, React 19, TypeScript, Tailwind 4, PostgreSQL, ExcelJS, and pdf-lib.

The Mywed.in wedding company website is at `/studio`. It includes a responsive
landing page and a detailed quote enquiry builder that opens WhatsApp for the
visitor to send. See [studio website instructions](docs/STUDIO_WEBSITE.md).
For public hosting with stored quote enquiries, see [Render + Neon deployment](docs/RENDER_NEON.md).

## Run locally

Requires Node 24 (tested) and npm 11. The checkout is already an isolated workspace; use it directly, without creating another worktree.

```sh
cd /workspace/MYWED-APP
npm ci
npm run seed       # optional, fictional local demo only; run before starting the server
npm run dev
```

Sign up to create an empty workspace, or use the fictional seed account `demo@mywed.test` / `MyWed-demo-2026!` and choose **The Frame Studio**. Local account verification, reset, and invitation emails are written to the private `.data/mail` outbox. Run `npm run mail`, open the relevant link, then log in. No real contact records are automatically imported.

Without `DATABASE_URL`, PGlite runs actual PostgreSQL locally and persists to `.data/postgres`. Run only one app process against that directory. Stop the server before running seed or other database administration scripts against it. Production uses hosted PostgreSQL through `pg`. Migrations are idempotently applied at first database initialization.

## Workflows

Create a client and package → schedule events → add crew and rates → assign crew → record an advance → complete events → create vendor production jobs and payments → track albums and deliverables → collect the balance → inspect reports.

- Owner: operations, finances, company preferences, members, invitations, audit.
- Manager: operations, finances, import, archival; no settings or membership administration.
- Accountant: view operations; edit ledgers, expenses, and crew rates.
- Staff: view operational directories; edit events, assignments, production progress, deliverables, and albums. Financial fields, payment details, reports, and financial exports are omitted or denied by the server.

All data queries use the authenticated membership company. Composite company/record foreign keys enforce linked-record isolation. Browser database access is never used. Company-specific references are allocated atomically and do not change with sorting or archival. Financial edits and assignment rate overrides create audit records. Financial history cannot be deleted; directory records archive and restore.

Use Settings to manage dropdown lists, team roles, currency, timezone, financial-year start, and company details. The logo is an HTTPS URL; file attachments and storage uploads are outside this implementation.

## Workbook import

Open Settings in the intended private workspace, upload an XLSX tracker, inspect counts, sample clients, financial reconciliation, errors, and warnings, then explicitly confirm that workspace. Validation executes the import in a rolled-back transaction before showing the preview. Commit is atomic. Exact file hashes and client references prevent accidental duplicate imports. Existing crew/vendor names may be reused; ambiguous or invalid links block the import.

Formula cells and empty template rows are ignored. Client formula references are reconstructed from their original workbook row positions; entered references are preserved. Fixed crew columns become assignment rows. Workbook Setup lists become company defaults during the confirmed import. Preview expires after one hour.

Historical vendor advance/final payments lack transaction dates in the workbook. They preserve balances and are explicitly excluded from dated cash reports until a date is entered. Missing rates remain null and are flagged; financial totals are incomplete until resolved. Exports are company scoped and neutralize spreadsheet formula injection. **Monetary exports use integer minor units** (paise for INR), named in filenames. XLSX report export contains cohort, cash, monthly, crew, and vendor sheets; CSV report export contains the cohort sheet.

## Verify

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
# With the local dev server running and Chromium installed:
npm run test:e2e
```

Set `CHROMIUM_PATH` if Chromium is outside `/usr/bin/chromium`. The browser test creates fictional accounts and workspaces, uses the local outbox, completes an operational workflow, checks PDF/XLSX output, exercises direct tenant attacks and Staff restrictions, and verifies password reset and logout. Tests do not import the real workbook. Domain tests use a separate temporary database and synthetic workbook.

See [environment configuration](docs/ENVIRONMENT.md), [workbook mapping](docs/WORKBOOK_MAPPING.md), [deployment](docs/DEPLOYMENT.md), and [verification](docs/VERIFICATION.md).

## Known boundaries

Hosted PostgreSQL, Supabase delivery, and production email require external configuration and have not been validated without credentials. Local authentication is independently functional. Production deployments need an edge/distributed authentication rate limiter; the included limiter is per process. No payment gateway, subscriptions, WhatsApp automation, public client/crew portal, private attachment storage, tax engine, or background reminder sender is included. Calendar conflicts support same-day events with time intervals; overnight events must be split.

Imports do not merge existing clients. Use an empty private workspace or resolve reference conflicts. Client-facing PDF uses standard Latin PDF fonts and transliterates unsupported glyphs; full multilingual PDF typography remains a limitation. Company logos use configured HTTPS URLs. The current implementation uses a shared schema with server authorization and composite tenant constraints; do not expose these tables through a public database API.
