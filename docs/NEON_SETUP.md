# Neon CLI setup and verification

Target: organization `org-autumn-morning-24375102`, project
`nameless-meadow-03106936`, branch `production`. Only PostgreSQL is requested.
The frontend remains hosted separately on Render.

## Current outcome

- Neon CLI 8.4.2 downloaded successfully using `npx neon@latest`.
- Global installation failed because the global npm directory was not writable.
- Default initialization could not write the global plugin cache. The supported
  skills setup installed `neon` and `neon-postgres` into `.agents/skills` locally.
- Initialization created `neon.ts`, added `@neon/config` and `@neon/env`, and wrote
  the requested `.neon` link **offline**. Project access is not verified.
- `neon deploy` and `neon login` failed: the proxy denied the Neon API with HTTP
  403. No browser sign-in opened. No database URLs were pulled.
- The environment network draft now requests `console.neon.tech`,
  `oauth2.neon.tech`, and `neon.com`. The draft must be reviewed, saved, and
  published before claiming it has changed this running environment.

## Finish from an authenticated machine

In this checkout on your Mac (after `git pull` and `npm ci`):

```sh
npx --yes neon@latest login
# Finish sign-in in the browser.
npx --yes neon@latest init -y --org-id org-autumn-morning-24375102 --project-id nameless-meadow-03106936 --branch production --services postgres
npx --yes neon@latest deploy
```

In the managed cloud workspace, the CLI needs writable cache/config paths:

```sh
XDG_CACHE_HOME=/tmp/mywed-neon-cache npm_config_cache=/tmp/mywed-neon-cache npx --yes neon@latest --config-dir /tmp/mywed-neon-config login
XDG_CACHE_HOME=/tmp/mywed-neon-cache npm_config_cache=/tmp/mywed-neon-cache npx --yes neon@latest --config-dir /tmp/mywed-neon-config deploy
```

Authentication on your Mac does not authenticate the separate cloud machine.
The cloud instance also needs permitted TCP access to the concrete Neon database
hostname once known. Preserve proxy/TLS configuration; do not bypass policy or
disable certificate checks.

The CLI writes secrets to ignored `.env.local` (or `.env` if present). Next.js
loads those files automatically. `src/lib/db.ts` validates `DATABASE_URL` through
`parseEnv`, uses `pg` pooling for the Node runtime, and applies migrations using
`DATABASE_URL_UNPOOLED` when available. Production has no local database fallback.
Installed skill files and `.neon` are ignored; `skills-lock.json` tracks their
source/version metadata. Production branches are not assigned the starter
seven-day expiry policy.

## Real Neon end-to-end check

After successful deploy, run `npm run build`, then start the application:

```sh
STUDIO_SITE_ONLY=true APP_URL=http://127.0.0.1:3010 ENQUIRY_RATE_LIMIT_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')" npm start -- --port 3010
```

The temporary rate-limit secret above is only for this local verification. Render
generates its own persistent secret. In a second terminal, run:

```sh
npm run verify:neon
```

The verifier requires an actual `.neon.tech` database URL, checks database health,
submits a synthetic enquiry through the app twice, queries Neon directly to prove
persistence/deduplication, checks that the public endpoint does not list contacts,
and removes only the uniquely marked test enquiry. It never seeds the database
or imports the real workbook. A successful local/PGlite test is not proof of Neon.

For Render, set both database URLs in private environment settings; never commit
or paste their values into chat. See [Render deployment](RENDER_NEON.md).
