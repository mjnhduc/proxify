# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Development (auto-reload via --watch)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3456`. Requires a `.env` file:

```ini
ADMIN_USER=admin
ADMIN_PASS=your_password
SESSION_SECRET=your_secret
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Database

Supabase (PostgreSQL). Schema is managed via versioned migration files in `migrations/`.

**Running migrations:**
```bash
# Add DATABASE_URL to .env first (Supabase Dashboard → Settings → Database → URI)
npm run migrate
```

The script connects via `DATABASE_URL`, creates a `schema_migrations` tracking table on first run, then applies any `.sql` files in `migrations/` that haven't been applied yet. Already-applied versions are skipped.

**Adding a new migration:**
1. Create `migrations/002_your_description.sql` (increment the number)
2. Write the SQL using `IF NOT EXISTS` / `IF EXISTS` guards where possible
3. Run `npm run migrate`

Never edit an already-applied migration file — add a new one instead.

On first boot with an empty `proxies` table, `init()` in `proxyLoader.js` automatically seeds from `assets/all.xlsx`. After that, `all.xlsx` is only read by the Sync and Clear admin operations.

To migrate off Supabase: the schema is plain SQL and runs on any PostgreSQL instance. The only Supabase-specific code is `server/supabase.js` and the query calls in `proxyLoader.js` — swap the client for `pg` if moving to plain Postgres, or self-host Supabase via Docker Compose with zero code changes.

## Architecture

Single-server Node.js/Express app with no build step. Frontend is a vanilla JS SPA served as static files.

**Data flow:**
- `assets/all.xlsx` — original source file, **never modified** at runtime
- Supabase `proxies` table — single table with `is_archived` boolean replacing the old two-file split

**`.env` is loaded at the very top of `server/index.js`** before any `require()` calls, because `server/supabase.js` reads `process.env` at module load time. Do not move the env-loading block below the requires.

**Proxy identity:** Stable 12-char MD5 of the raw `HOST PORT` string (`host:port:user:pass`). If that string changes in `all.xlsx`, the proxy gets a new ID and sync will insert it as a new row rather than update the existing one.

**Excel column schema** (`HOST PORT` is the key field):
`TYPE | HOST PORT | IPv4 | IPv6 | GEO | TIME ZONE | CITY | IPS | MS | STATUS`

The `HOST PORT` field encodes `host:port:username:password`; passwords may contain `:` and are parsed with `parts.slice(3).join(':')`.

**Auth:** Cookie-based. The `SESSION_SECRET` value is stored directly as the cookie value and compared on every request — no session store. All routes except `/login.html`, `/index.css`, and `/api/login` are protected.

**ISP classification** (`classifier.js`): keyword matching against `DATACENTER_KEYWORDS`; defaults to `residential` if no match, `unknown` if ISP is blank.

**Proxy checking** (`proxyChecker.js`): routes HTTP through the proxy to `httpbin.org/ip` with a 10-second timeout. Returns `{ alive, latency, externalIp, error }`.

**Frontend** (`public/app.js`): single file manages all state and DOM updates for the Active and Archived tabs. No framework, no bundler.
