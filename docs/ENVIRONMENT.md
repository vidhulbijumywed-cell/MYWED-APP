# Environment configuration

Create configuration locally or use your hosting provider's secure environment settings. All `.env` files are excluded from Git, including `.env.example`. Never commit credential values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Hosted PostgreSQL connection string. Leave unset for local persistent PGlite. Treat as a secret. |
| `APP_URL` | Canonical application origin; use HTTPS in public production. |
| `SUPABASE_URL` | Supabase project URL for managed authentication. |
| `SUPABASE_ANON_KEY` | Project authentication key; configure together with `SUPABASE_URL`. |
| `RESEND_API_KEY` | Email-provider credential for invitations and self-hosted account emails. |
| `MAIL_FROM` | Verified sender address configured with your email provider. |
| `COOKIE_SECURE` | Keep `true` for public HTTPS hosting. `false` is only for local HTTP demonstration. |
| `ALLOW_LOCAL_MAIL` | Keep `false` in public production. Local demonstrations can use the private outbox. |
| `MYWED_DATA_DIR` | Optional local PostgreSQL data directory; must be writable by the app. |
| `CHROMIUM_PATH` | Chromium executable for browser tests; defaults to `/usr/bin/chromium`. |
| `MYWED_PREVIEW_URL` | Optional internal endpoint for the screenshot capture helper. |

No environment configuration is required for `npm run dev` with the local database. See [deployment instructions](DEPLOYMENT.md) for hosted services and email setup.
