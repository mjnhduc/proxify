# Proxy Management Portal

A premium Node.js web dashboard to securely manage, filter, check, and organize a large database of HTTP proxies loaded from Excel files.

![Proxy Portal](https://raw.githubusercontent.com/placeholder-image) <!-- Add a screenshot here later -->

## Features

- **Working Copy Architecture**: The system protects your original `all.xlsx` file. It automatically clones it into a `working.xlsx` file and applies all checks, mutations, and archives there, preventing data corruption.
- **Smart ISP Autocomplete**: Replaces clunky dropdowns with a real-time, searchable autocomplete for ISPs with hit counts and keyboard navigation.
- **Live Proxy Checking**: Asynchronously check proxies (`📡`) against `httpbin.org`. Visually seamless DOM updates mean the UI never jumps or flickers during checking.
- **Quick Row Copy**: A dedicated button (`📋`) on each row instantly copies the proxy string (`host:port:user:pass`) to your clipboard.
- **Admin Tab (`⚙️`)**:
  - **Sync Data**: If you update the original `all.xlsx` file externally, the sync function merges in new proxies without wiping your checked/archived history.
  - **Clear Data**: Nuke the working files and start fresh from the original file.
- **Authentication**: Secured by a session-cookie-based custom login page to prevent unauthorized access.
- **Premium UI**: Glassmorphism aesthetic, dark mode tokens, and smooth micro-animations.

---

## Project Structure

```text
proxies/
├── .env                  # Secure credentials (git-ignored)
├── assets/
│   ├── all.xlsx          # Original source proxy list (read-only)
│   ├── working.xlsx      # Working copy (auto-generated)
│   └── archived.xlsx     # Archived/dead proxies (auto-generated)
├── server/
│   ├── index.js          # Express server with Auth & API Routes
│   ├── proxyLoader.js    # Excel read/write, working copy management
│   ├── proxyChecker.js   # Live check via HTTP request through proxy
│   └── classifier.js     # Residential vs Datacenter ISP classification
├── public/
│   ├── index.html        # Main SPA shell (Dashboard)
│   ├── login.html        # Authentication page
│   ├── index.css         # Design system & styles (Dark Mode)
│   └── app.js            # Frontend SPA logic (State, UI Updates)
└── package.json
```

---

## Setup & Installation

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory (this file is ignored by git). Add the following variables to configure your administrator credentials:

```ini
ADMIN_USER=admin
ADMIN_PASS=your_secure_password
SESSION_SECRET=a_random_secret_string
```

### 4. Provide the Data
Ensure your source Excel file is placed at `assets/all.xlsx`. The application expects the following column structure:
- Host
- Port
- Username
- Password
- ... (Additional columns like City, Country, ISP are supported)

### 5. Start the Server
For development (with auto-reload):
```bash
npm run dev
```

For production:
```bash
npm start
```

### 6. Access the Portal
Open your browser and navigate to:
`http://localhost:3456`

You will be prompted to log in using the credentials defined in your `.env` file.

---

## API Documentation

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/login` | Authenticate user and issue HTTP-only session cookie |
| `GET` | `/api/proxies` | Paginated active proxies with filters |
| `GET` | `/api/archived` | Paginated archived proxies with filters |
| `GET` | `/api/stats` | Counts: total active, archived, by country/category |
| `GET` | `/api/filters` | Available filter options |
| `POST` | `/api/proxies/:id/check` | Check single proxy liveness (updates row status) |
| `POST` | `/api/proxies/:id/archive` | Move proxy from working → archived |
| `POST` | `/api/archived/:id/restore` | Move proxy from archived → working |
| `POST` | `/api/admin/sync` | Append new proxies from original to working copy |
| `POST` | `/api/admin/clear` | Wipe working/archive files and clone original |
