# Deployment

## Hosted application

1. Provision a PostgreSQL database and a Node 24 application host. Use a private database network or TLS-verified provider URL. Back up the database and apply retention rules for financial/audit records.
2. Configure `DATABASE_URL`, `APP_URL` (canonical HTTPS origin), and `COOKIE_SECURE=true`. Keep values in the host's secret manager, never commit `.env.local`.
3. Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`; start with `npm start`. The initial SQL migration runs at database initialization. For controlled environments, apply `migrations/001_initial.sql` using a migration/admin role before starting, then give the runtime role only necessary table access.
4. Enable an edge rate limiter for `/api/auth`, request body/upload limits (10 MB workbook maximum), HTTPS, and standard logging that omits passwords/tokens. Do not enable the local mail outbox in public production.
5. Verify sign-up/email delivery, password recovery, invitations, workspace isolation, exports/PDFs, and the end-to-end business workflow on the deployment. Public hosting publication/deployment has not been performed in this workspace.

## Managed Supabase authentication

Set **both** `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The backend uses the public project key only for authentication and verifies user identity using the Supabase auth API. No service-role key is needed. The application stores an independent hashed, HttpOnly session and membership state in PostgreSQL.

In Supabase Auth settings:

- Enable email/password, require email confirmation, configure the canonical Site URL and allowed Redirect URLs to `APP_URL`.
- Configure SMTP for reliable production delivery and validate verification/recovery email templates.
- Use the standard implicit email redirect flow returning `access_token` and `refresh_token` fragments to the app. The app removes these fragments from the address bar and validates the token server-side. Recovery sends users to the password form. If you choose PKCE or token-hash templates, add the corresponding exchange route before deploying; that alternate flow is not implemented.

Keep the auth mode stable. Local demo users are not Supabase identities. Migrating existing local-auth accounts to managed auth requires a separate account migration.

When using Supabase PostgreSQL, keep the application tables in a non-exposed schema or remove browser API access. This implementation accesses PostgreSQL only from the server, scopes queries by membership, and uses composite foreign keys; it does not supply Supabase browser RLS policies. Never expose application tables to anon/authenticated browser roles. Configure grants/schema exposure before release.

Team invitations use `RESEND_API_KEY` and `MAIL_FROM` (a verified sending domain), even when Supabase manages sign-up/recovery. For self-hosted auth, those settings deliver all account emails. Without an email provider, development writes a private outbox; production email operations fail closed.

Required outbound destinations depend on selected services: npm registry during installation, chosen PostgreSQL host, your `*.supabase.co` project host for auth, and `api.resend.com` for invitations/account mail. Add only concrete selected domains to environment settings. No external credentials were requested or embedded in the saved setup script.

## Local production validation

For an HTTP-only local smoke check, run `COOKIE_SECURE=false ALLOW_LOCAL_MAIL=true npm start`. Never use these overrides for an HTTPS public deployment. Persistent PGlite supports one process and is intended for development, not a horizontally scaled production service.

## Documentation checked

Implementation uses current installed library type definitions and the official Next.js asynchronous cookie API reference (`vercel/next.js` documentation), Supabase JavaScript project reference, and ExcelJS workbook API. Dependency versions and integrity hashes are retained in `package-lock.json`. ExcelJS's compatible `uuid` dependency is overridden to 11.1.1 or later to address the reported buffer-bounds advisory; import/export tests verify compatibility.

## Container packaging

`Dockerfile` builds from source using the frozen npm lockfile. `Dockerfile.prebuilt` packages a previously verified installation and production build on the same architecture. The prebuilt form is useful in this cloud machine because Docker build containers cannot resolve the npm registry through the platform network; it reuses the trusted dependencies installed and integrity-checked in the main workspace.

```sh
npm ci
npm run build
docker build -f Dockerfile.prebuilt -t mywed:local .
```

For a local fictional demonstration only, create a named data volume, run the fictional seed before the server, then start with local HTTP overrides:

```sh
docker volume create mywed-demo-data
docker run --rm -e NODE_ENV=development -v mywed-demo-data:/app/.data mywed:local npm run seed
docker run -d --name mywed-demo -p 127.0.0.1:3001:3000 -v mywed-demo-data:/app/.data -e APP_URL=http://127.0.0.1:3001 -e COOKIE_SECURE=false -e ALLOW_LOCAL_MAIL=true mywed:local
```

This deploys a local container, not a public website. Public hosting requires the canonical HTTPS origin, hosted PostgreSQL connection, secure cookies, email service, and hosting credentials described above. Neither image includes operational database contents, environment secrets, or the real workbook.
