/**
 * Express server for the Proxy Management Portal.
 */

const express = require('express');
const path = require('path');
const proxyLoader = require('./proxyLoader');
const { checkProxy } = require('./proxyChecker');

const app = express();
const PORT = 3456;

// Middleware
app.use(express.json());

// Load env variables
const fs = require('fs');
if (fs.existsSync(path.join(__dirname, '..', '.env'))) {
  const envConfig = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n');
  envConfig.forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length) {
      process.env[key.trim()] = values.join('=').trim();
    }
  });
}

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET || 'proxy-portal-secret';

// Cookie Parser Middleware
app.use((req, res, next) => {
  req.cookies = req.headers.cookie?.split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=');
    acc[k] = v;
    return acc;
  }, {}) || {};
  next();
});

// Login API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.cookie('auth_token', SESSION_SECRET, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// Auth Middleware (protects all following routes and static files)
app.use((req, res, next) => {
  // Allow public access to login page and assets
  if (req.path === '/login.html' || req.path === '/index.css' || req.path === '/api/login') {
    return next();
  }

  // Check auth
  if (req.cookies['auth_token'] === SESSION_SECRET) {
    return next();
  }

  // If API request, return 401. Otherwise redirect to login.
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  } else {
    return res.redirect('/login.html');
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// Initialize proxy data
proxyLoader.init();

// ─── API Routes ──────────────────────────────────────────────

/**
 * GET /api/stats — Dashboard statistics
 */
app.get('/api/stats', (req, res) => {
  res.json(proxyLoader.getStats());
});

/**
 * GET /api/filters — Available filter options for active proxies
 */
app.get('/api/filters', (req, res) => {
  const isArchived = req.query.archived === 'true';
  res.json(proxyLoader.getFilters(isArchived));
});

/**
 * GET /api/proxies — Paginated active proxies with filters
 */
app.get('/api/proxies', (req, res) => {
  const { page = 1, limit = 50, country, isp, category, search } = req.query;
  const result = proxyLoader.getActiveProxies({
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    country,
    isp,
    category,
    search,
  });
  res.json(result);
});

/**
 * GET /api/archived — Paginated archived proxies with filters
 */
app.get('/api/archived', (req, res) => {
  const { page = 1, limit = 50, country, isp, category, search } = req.query;
  const result = proxyLoader.getArchivedProxies({
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    country,
    isp,
    category,
    search,
  });
  res.json(result);
});

/**
 * POST /api/proxies/:id/check — Check if a proxy is alive
 */
app.post('/api/proxies/:id/check', async (req, res) => {
  const { id } = req.params;
  const isArchived = req.query.archived === 'true';
  
  const proxy = isArchived
    ? proxyLoader.getArchivedProxy(id)
    : proxyLoader.getActiveProxy(id);
  
  if (!proxy) {
    return res.status(404).json({ error: 'Proxy not found' });
  }
  
  try {
    const result = await checkProxy(proxy);
    proxyLoader.updateProxyStatus(
      id,
      result.alive ? 'LIVE' : 'DIE',
      result.latency,
      isArchived
    );
    
    res.json({
      ...result,
      status: result.alive ? 'LIVE' : 'DIE',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/proxies/:id/archive — Move proxy from active to archived
 */
app.post('/api/proxies/:id/archive', (req, res) => {
  const { id } = req.params;
  const proxy = proxyLoader.archiveProxy(id);
  
  if (!proxy) {
    return res.status(404).json({ error: 'Proxy not found' });
  }
  
  res.json({ success: true, proxy });
});

/**
 * POST /api/archived/:id/restore — Move proxy from archived to active
 */
app.post('/api/archived/:id/restore', (req, res) => {
  const { id } = req.params;
  const proxy = proxyLoader.restoreProxy(id);
  
  if (!proxy) {
    return res.status(404).json({ error: 'Proxy not found' });
  }
  
  res.json({ success: true, proxy });
});

/**
 * POST /api/admin/sync — Sync new proxies from all.xlsx
 */
app.post('/api/admin/sync', (req, res) => {
  try {
    const result = proxyLoader.syncFromOriginal();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/clear — Clear system data and reload from all.xlsx
 */
app.post('/api/admin/clear', (req, res) => {
  try {
    const result = proxyLoader.clearData();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Catch-all: serve index.html for SPA ────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 Proxy Portal running at http://localhost:${PORT}\n`);
});
