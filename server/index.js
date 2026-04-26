const fs = require('fs');
const path = require('path');

// Load env before any module that reads process.env at require-time
if (fs.existsSync(path.join(__dirname, '..', '.env'))) {
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length) process.env[key.trim()] = values.join('=').trim();
  });
}

const express = require('express');
const proxyLoader = require('./proxyLoader');
const { checkProxy } = require('./proxyChecker');

const app = express();
const PORT = 3456;

app.use(express.json());

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
const SESSION_SECRET = process.env.SESSION_SECRET || 'proxy-portal-secret';

// Cookie parser
app.use((req, res, next) => {
  req.cookies = req.headers.cookie?.split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=');
    acc[k] = v;
    return acc;
  }, {}) || {};
  next();
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.cookie('auth_token', SESSION_SECRET, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// Auth middleware
app.use((req, res, next) => {
  if (req.path === '/login.html' || req.path === '/index.css' || req.path === '/api/login') {
    return next();
  }
  if (req.cookies['auth_token'] === SESSION_SECRET) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/login.html');
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API Routes ──────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    res.json(await proxyLoader.getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/filters', async (req, res) => {
  try {
    const isArchived = req.query.archived === 'true';
    res.json(await proxyLoader.getFilters(isArchived));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/proxies', async (req, res) => {
  try {
    const { page = 1, limit = 50, country, isp, category, search } = req.query;
    res.json(await proxyLoader.getActiveProxies({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      country, isp, category, search,
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/archived', async (req, res) => {
  try {
    const { page = 1, limit = 50, country, isp, category, search } = req.query;
    res.json(await proxyLoader.getArchivedProxies({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      country, isp, category, search,
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proxies/:id/check', async (req, res) => {
  const { id } = req.params;
  const isArchived = req.query.archived === 'true';

  try {
    const proxy = isArchived
      ? await proxyLoader.getArchivedProxy(id)
      : await proxyLoader.getActiveProxy(id);

    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });

    const result = await checkProxy(proxy);
    await proxyLoader.updateProxyStatus(id, result.alive ? 'LIVE' : 'DIE', result.latency);

    res.json({ ...result, status: result.alive ? 'LIVE' : 'DIE' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proxies/:id/archive', async (req, res) => {
  try {
    const proxy = await proxyLoader.archiveProxy(req.params.id);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });
    res.json({ success: true, proxy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/archived/:id/restore', async (req, res) => {
  try {
    const proxy = await proxyLoader.restoreProxy(req.params.id);
    if (!proxy) return res.status(404).json({ error: 'Proxy not found' });
    res.json({ success: true, proxy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/sync', async (_req, res) => {
  try {
    res.json({ success: true, ...await proxyLoader.syncFromOriginal() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/clear', async (_req, res) => {
  try {
    res.json({ success: true, ...await proxyLoader.clearData() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start after DB is ready ─────────────────────────────────

proxyLoader.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Proxy Portal running at http://localhost:${PORT}\n`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize:', err.message);
    process.exit(1);
  });
