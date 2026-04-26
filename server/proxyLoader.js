const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { classifyISP } = require('./classifier');
const supabase = require('./supabase');

const ORIGINAL_FILE = path.join(__dirname, '..', 'assets', 'all.xlsx');

function generateId(hostPort) {
  return crypto.createHash('md5').update(hostPort).digest('hex').substring(0, 12);
}

function parseXlsxRow(row) {
  const hostPort = row['HOST PORT'] || '';
  const parts = hostPort.split(':');
  const isp = row['IPS'] || '';
  return {
    id: generateId(hostPort),
    type: row['TYPE'] || 'HTTP',
    hostPort,
    host: parts[0] || '',
    port: parts[1] || '',
    username: parts[2] || '',
    password: parts.slice(3).join(':') || '',
    ipv4: row['IPv4'] || '',
    ipv6: row['IPv6'] || '',
    country: row['GEO'] || '',
    timezone: row['TIME ZONE'] || '',
    city: row['CITY'] || '',
    isp,
    latency: row['MS'] ? parseInt(row['MS'], 10) : null,
    status: row['STATUS'] || 'UNKNOWN',
    category: classifyISP(isp),
    lastChecked: null,
  };
}

function loadFromFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' }).map(parseXlsxRow);
}

function dbRowToProxy(row) {
  const hostPort = row.host_port || '';
  const parts = hostPort.split(':');
  return {
    id: row.id,
    type: row.type || 'HTTP',
    hostPort,
    host: parts[0] || '',
    port: parts[1] || '',
    username: parts[2] || '',
    password: parts.slice(3).join(':') || '',
    ipv4: row.ipv4 || '',
    ipv6: row.ipv6 || '',
    country: row.country || '',
    timezone: row.timezone || '',
    city: row.city || '',
    isp: row.isp || '',
    latency: row.latency,
    status: row.status || 'UNKNOWN',
    category: row.category || 'unknown',
    lastChecked: row.last_checked,
    lastCheckResult: row.status,
  };
}

function proxyToDbRow(proxy, isArchived = false) {
  return {
    id: proxy.id,
    type: proxy.type,
    host_port: proxy.hostPort,
    ipv4: proxy.ipv4,
    ipv6: proxy.ipv6,
    country: proxy.country,
    timezone: proxy.timezone,
    city: proxy.city,
    isp: proxy.isp,
    category: proxy.category,
    latency: proxy.latency || null,
    status: proxy.status,
    is_archived: isArchived,
    last_checked: proxy.lastChecked || null,
  };
}

async function insertBatch(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('proxies').insert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
}

async function init() {
  const { count, error } = await supabase
    .from('proxies')
    .select('*', { count: 'exact', head: true });

  if (error) throw new Error(`Supabase connection failed: ${error.message}`);

  if (count === 0) {
    if (!fs.existsSync(ORIGINAL_FILE)) {
      throw new Error(`Original file not found: ${ORIGINAL_FILE}`);
    }
    console.log('Empty database — seeding from all.xlsx...');
    const proxies = loadFromFile(ORIGINAL_FILE);
    await insertBatch(proxies.map(p => proxyToDbRow(p, false)));
    console.log(`Seeded ${proxies.length} proxies`);
  } else {
    const { count: archivedCount } = await supabase
      .from('proxies')
      .select('*', { count: 'exact', head: true })
      .eq('is_archived', true);
    console.log(`Supabase connected — ${count - (archivedCount || 0)} active, ${archivedCount || 0} archived`);
  }
}

function applyFilters(query, { country, isp, category, search }) {
  if (country) query = query.eq('country', country);
  if (isp) query = query.ilike('isp', `%${isp}%`);
  if (category) query = query.eq('category', category);
  if (search) query = query.or(
    `host_port.ilike.%${search}%,ipv4.ilike.%${search}%,city.ilike.%${search}%,isp.ilike.%${search}%`
  );
  return query;
}

async function fetchProxies(isArchived, { page = 1, limit = 50, country, isp, category, search } = {}) {
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  let query = supabase
    .from('proxies')
    .select('*', { count: 'exact' })
    .eq('is_archived', isArchived);

  query = applyFilters(query, { country, isp, category, search });

  const { data, count, error } = await query.range(start, end);
  if (error) throw new Error(error.message);

  return {
    data: data.map(dbRowToProxy),
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
}

async function getActiveProxies(opts) {
  return fetchProxies(false, opts);
}

async function getArchivedProxies(opts) {
  return fetchProxies(true, opts);
}

async function getActiveProxy(id) {
  const { data, error } = await supabase
    .from('proxies')
    .select('*')
    .eq('id', id)
    .eq('is_archived', false)
    .single();
  if (error) return null;
  return dbRowToProxy(data);
}

async function getArchivedProxy(id) {
  const { data, error } = await supabase
    .from('proxies')
    .select('*')
    .eq('id', id)
    .eq('is_archived', true)
    .single();
  if (error) return null;
  return dbRowToProxy(data);
}

async function updateProxyStatus(id, status, latency) {
  const { data, error } = await supabase
    .from('proxies')
    .update({ status, latency, last_checked: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return dbRowToProxy(data);
}

async function archiveProxy(id) {
  const { data, error } = await supabase
    .from('proxies')
    .update({ is_archived: true, status: 'ARCHIVED' })
    .eq('id', id)
    .eq('is_archived', false)
    .select()
    .single();
  if (error) return null;
  return dbRowToProxy(data);
}

async function restoreProxy(id) {
  const { data, error } = await supabase
    .from('proxies')
    .update({ is_archived: false, status: 'LIVE' })
    .eq('id', id)
    .eq('is_archived', true)
    .select()
    .single();
  if (error) return null;
  return dbRowToProxy(data);
}

async function getStats() {
  const [{ data: active, error }, { count: archivedCount }] = await Promise.all([
    supabase.from('proxies').select('country, category, isp').eq('is_archived', false),
    supabase.from('proxies').select('*', { count: 'exact', head: true }).eq('is_archived', true),
  ]);

  if (error) throw new Error(error.message);

  const countryCount = {};
  const categoryCount = { residential: 0, datacenter: 0, unknown: 0 };
  const ispCount = {};

  for (const p of active) {
    if (p.country) countryCount[p.country] = (countryCount[p.country] || 0) + 1;
    if (p.category) categoryCount[p.category] = (categoryCount[p.category] || 0) + 1;
    if (p.isp) ispCount[p.isp] = (ispCount[p.isp] || 0) + 1;
  }

  return {
    totalActive: active.length,
    totalArchived: archivedCount || 0,
    categories: categoryCount,
    topCountries: Object.entries(countryCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([code, count]) => ({ code, count })),
    topISPs: Object.entries(ispCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, count]) => ({ name, count })),
  };
}

async function getFilters(isArchived = false) {
  const { data, error } = await supabase
    .from('proxies')
    .select('country, isp, category')
    .eq('is_archived', isArchived);

  if (error) throw new Error(error.message);

  return {
    countries: [...new Set(data.map(p => p.country).filter(Boolean))].sort(),
    isps: [...new Set(data.map(p => p.isp).filter(Boolean))].sort(),
    categories: [...new Set(data.map(p => p.category).filter(Boolean))].sort(),
  };
}

async function syncFromOriginal() {
  if (!fs.existsSync(ORIGINAL_FILE)) throw new Error(`Original file not found: ${ORIGINAL_FILE}`);

  const originalProxies = loadFromFile(ORIGINAL_FILE);

  const { data: existing, error } = await supabase.from('proxies').select('id');
  if (error) throw new Error(error.message);

  const existingIds = new Set(existing.map(p => p.id));
  const newProxies = originalProxies.filter(p => !existingIds.has(p.id));

  if (newProxies.length > 0) {
    await insertBatch(newProxies.map(p => proxyToDbRow(p, false)));
  }

  const { count: totalActive } = await supabase
    .from('proxies')
    .select('*', { count: 'exact', head: true })
    .eq('is_archived', false);

  return { added: newProxies.length, totalActive };
}

async function clearData() {
  const { error } = await supabase.from('proxies').delete().neq('id', '');
  if (error) throw new Error(error.message);
  return init();
}

module.exports = {
  init,
  getActiveProxies,
  getArchivedProxies,
  getActiveProxy,
  getArchivedProxy,
  updateProxyStatus,
  archiveProxy,
  restoreProxy,
  getStats,
  getFilters,
  syncFromOriginal,
  clearData,
};
