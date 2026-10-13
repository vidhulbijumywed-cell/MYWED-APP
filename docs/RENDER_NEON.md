# Deploy the Mywed.in studio website with Render and Neon

This deployment serves the wedding company landing page at `/`. It saves quote
enquiries privately in Neon. Images can be added later without changing the
database. It does not expose the separate SaaS workspace or its login API.

## 1. Create the database in Neon

Sign in at https://console.neon.tech/ and create a dedicated Mywed studio project.
Choose a region near your Render service. Use **Connect** to copy the pooled
PostgreSQL connection string. Keep the provider's required TLS settings, including
`sslmode=require`; do not disable certificate checking. Never paste the connection
string into chat, source code, screenshots, or GitHub.

The application uses standard `pg`, which works with Neon PostgreSQL. It applies
the idempotent SQL files in `migrations/` on first database initialization. The
database role therefore needs permission to create those tables.

## 2. Deploy the Render Blueprint

Open https://dashboard.render.com/, choose **New → Blueprint**, connect GitHub,
and select `vidhulbijumywed-cell/MYWED-APP`, branch `main`. Render reads
`render.yaml`. Supply the Neon connection string for **DATABASE_URL** in Render's
private environment settings, then deploy. The Blueprint generates an enquiry
rate-limit secret. Review the service plan and any charges before deploying.
Also supply **DATABASE_URL_UNPOOLED**, the direct connection string used for
migrations. `neon deploy` pulls both variables when CLI access is configured;
see [Neon setup and verification](NEON_SETUP.md).

The configuration is a Node **Web Service**, not a Static Site, because saving
enquiries requires a backend. It uses Node 24, builds with
`npm ci --include=dev && npm run build`, and starts with
`npm start -- --port $PORT`. `STUDIO_SITE_ONLY=true` serves the studio at the root
and denies the SaaS pages and APIs. Health checks at `/api/health` query the actual
database. Do not run the fictional seed against Neon.

Render supplies `RENDER_EXTERNAL_URL`, used to validate form origins. After adding
a custom domain, set **APP_URL** to its canonical HTTPS origin (without a path),
then redirect alternate domains to that canonical domain. The form accepts one
configured origin. Leave **COOKIE_SECURE=true** and **ALLOW_LOCAL_MAIL=false**.

The Blueprint requests Render's free plan for a trial deployment. Check Render's
current availability and limitations. Sleeping services and database cold starts
can slow the first request. Consider a paid service for a customer-facing launch.
No current provider pricing is asserted here.

## 3. Verify the public deployment

- The public Render URL shows the studio landing page at `/`.
- `/api/health` returns `{"status":"ok"}`.
- `/api/auth` and `/api/data` return 404 on this studio-only deployment.
- Submit a fictional quote: the website must confirm saving only after a successful
  database response. Check that it appears once in Neon, including after a retry.
- GET `/api/studio-enquiries` must not return customer data (unsupported method).
- Test mobile layout, contact links, and WhatsApp on your own phone.

The form requires consent, checks input on the server, bounds request size, uses
a honeypot, deduplicates retries, and uses a database-backed hourly request limit.
Render must preserve its appended client IP in `x-forwarded-for` for per-client
limiting. Additional proxies require reviewing that trust boundary. These measures
are basic abuse controls; watch usage and add a challenge if automated spam occurs.

## Viewing enquiries

There is no public enquiry listing endpoint or admin inbox yet. In your private
Neon SQL editor, inspect the **studio_enquiries** table:

```sql
SELECT id, created_at, status, payload
FROM studio_enquiries
ORDER BY created_at DESC;
```

Access to Neon is privileged: restrict it to authorised staff. Establish a
retention policy for enquiries and select a provider plan with the backup/recovery
features you need. Local records are not automatically migrated to Neon. This
deployment does not send email notifications or create confirmed bookings.

## Add original images later

Add approved photos to `public/studio/media/`, configure `studioMedia` in
`public/studio/index.html`, and push to GitHub. Render redeploys according to its
automatic deployment settings. Neon stores form data; portfolio image files are
served from the website. Larger future media libraries can use object storage.

## What has been verified

Local PostgreSQL/PGlite tests verify enquiry validation, persistence, retry
deduplication, conflict protection, consent checks, request limits, and safe public
responses. Browser checks cover form submission and the studio-only routing.
Production build and TypeScript are checked. A real Neon connection and Render
deployment still require account configuration and must be tested after launch.
