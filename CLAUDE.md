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

Server runs on `http://localhost:3456`. Requires a `.env` file with `ADMIN_USER`, `ADMIN_PASS`, and `SESSION_SECRET`.

## Architecture

This is a single-server Node.js/Express app with no build step. The frontend is a vanilla JS SPA served as static files.

**Data flow:**
- `assets/all.xlsx` — original source file, **never modified**
- `assets/working.xlsx` — auto-cloned from `all.xlsx` on first run; receives all mutations
- `assets/archived.xlsx` — proxies moved out of working set

All proxy data lives **in-memory** (`activeProxies` / `archivedProxies` arrays in `proxyLoader.js`) and is flushed to Excel on every mutation. There is no database.

**Proxy identity:** Each proxy gets a stable 12-char MD5 ID derived from its `host:port` string (`proxyLoader.js:generateId`). This ID is used across all API routes.

**Excel column schema** (defined in `proxyLoader.js:COLUMNS`):
`TYPE | HOST PORT | IPv4 | IPv6 | GEO | TIME ZONE | CITY | IPS | MS | STATUS`

The `HOST PORT` field encodes `host:port:username:password` as a colon-delimited string; passwords may contain `:`.

**Auth:** Cookie-based using a plain secret token (`SESSION_SECRET`). The token value *is* the session — no session store, no JWT. All routes except `/login.html`, `/index.css`, and `/api/login` are protected.

**ISP classification** (`classifier.js`): keyword matching against `DATACENTER_KEYWORDS`; anything that doesn't match is classified as `residential`.

**Proxy checking** (`proxyChecker.js`): routes HTTP through the proxy to `httpbin.org/ip` with a 10-second timeout. Returns `{ alive, latency, externalIp, error }`.

**Frontend** (`public/app.js`): single `app.js` file manages all state and DOM updates for both the Active and Archived tabs. ISP autocomplete, pagination, and live-check status updates are handled client-side without any framework.
