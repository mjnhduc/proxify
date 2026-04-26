# Proxy Management Portal

A Node.js web dashboard to manage, filter, check, and organize a large database of HTTP proxies. Backed by Supabase (PostgreSQL).

## Features

- **Protected Original**: `assets/all.xlsx` is never modified. It's the source of truth for seeding and syncing.
- **Smart ISP Autocomplete**: Real-time searchable autocomplete for ISPs with hit counts and keyboard navigation.
- **Live Proxy Checking**: Asynchronously check proxies against `httpbin.org`. DOM updates are seamless with no UI flicker.
- **Quick Row Copy**: Instantly copies `host:port:user:pass` to clipboard.
- **Admin Tab**:
  - **Sync Data**: Merges new proxies from `all.xlsx` into the database without touching existing checked/archived history.
  - **Clear Data**: Wipes the database and re-seeds from `all.xlsx`.
- **Authentication**: Session-cookie login page.
- **Premium UI**: Glassmorphism aesthetic, dark mode, smooth micro-animations.

---

## Project Structure

```text
proxies/
├── .env                  # Credentials (git-ignored)
├── assets/
│   └── all.xlsx          # Original source proxy list (never modified at runtime)
├── migrations/           # Versioned SQL schema files
├── server/
│   ├── index.js          # Express server, auth, API routes
│   ├── supabase.js       # Supabase client
│   ├── proxyLoader.js    # All database read/write operations
│   ├── proxyChecker.js   # Live proxy check via HTTP
│   └── classifier.js     # Residential vs Datacenter ISP classification
├── public/
│   ├── index.html        # SPA shell
│   ├── login.html        # Login page
│   ├── index.css         # Styles (dark mode)
│   └── app.js            # Frontend logic
└── package.json
```

---

## Setup & Installation

### 1. Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Supabase](https://supabase.com) project (free tier is sufficient)

### 2. Install Dependencies

```bash
npm install
```

### 3. Create the Database Table

In your Supabase project, go to **SQL Editor** and run the contents of `migrations/001_initial_schema.sql`.

### 4. Environment Variables

Create a `.env` file in the root directory:

```ini
ADMIN_USER=admin
ADMIN_PASS=your_secure_password
SESSION_SECRET=a_random_secret_string
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are found in **Supabase Dashboard → Settings → API**.

### 5. Provide the Data

Place your source Excel file at `assets/all.xlsx`. Expected column structure:

`TYPE | HOST PORT | IPv4 | IPv6 | GEO | TIME ZONE | CITY | IPS | MS | STATUS`

The `HOST PORT` column encodes `host:port:username:password` as a single colon-delimited string.

On first boot with an empty database, the server automatically seeds all rows from `all.xlsx`.

### 6. Start the Server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Open `http://localhost:3456` and log in with your `.env` credentials.

---

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/login` | Authenticate and issue session cookie |
| `GET` | `/api/proxies` | Paginated active proxies with filters |
| `GET` | `/api/archived` | Paginated archived proxies with filters |
| `GET` | `/api/stats` | Counts by total, country, category |
| `GET` | `/api/filters` | Available filter options |
| `POST` | `/api/proxies/:id/check` | Check single proxy liveness |
| `POST` | `/api/proxies/:id/archive` | Move proxy to archived |
| `POST` | `/api/archived/:id/restore` | Restore proxy to active |
| `POST` | `/api/admin/sync` | Merge new proxies from `all.xlsx` |
| `POST` | `/api/admin/clear` | Wipe database and re-seed from `all.xlsx` |
