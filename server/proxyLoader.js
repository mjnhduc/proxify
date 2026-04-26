/**
 * Excel-based proxy data loader and writer.
 * Reads/writes proxy data from/to .xlsx files.
 * 
 * On init, clones all.xlsx → working.xlsx so the original is never modified.
 * All mutations (archive, restore, status updates) are persisted to working files.
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { classifyISP } = require('./classifier');

// Original source file (never modified)
const ORIGINAL_FILE = path.join(__dirname, '..', 'assets', 'all.xlsx');

// Working copies (all reads/writes happen here)
const WORKING_FILE = path.join(__dirname, '..', 'assets', 'working.xlsx');
const ARCHIVED_FILE = path.join(__dirname, '..', 'assets', 'archived.xlsx');

const COLUMNS = ['TYPE', 'HOST PORT', 'IPv4', 'IPv6', 'GEO', 'TIME ZONE', 'CITY', 'IPS', 'MS', 'STATUS'];

// In-memory cache
let activeProxies = [];
let archivedProxies = [];

/**
 * Generate a stable ID for a proxy based on its host:port string.
 */
function generateId(hostPort) {
  return crypto.createHash('md5').update(hostPort).digest('hex').substring(0, 12);
}

/**
 * Parse a row from the Excel sheet into a proxy object.
 */
function parseRow(row) {
  const hostPort = row['HOST PORT'] || '';
  const parts = hostPort.split(':');
  
  const host = parts[0] || '';
  const port = parts[1] || '';
  const username = parts[2] || '';
  const password = parts.slice(3).join(':') || ''; // password might contain ':'
  
  const isp = row['IPS'] || '';
  
  return {
    id: generateId(hostPort),
    type: row['TYPE'] || 'HTTP',
    hostPort,
    host,
    port,
    username,
    password,
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
    lastCheckResult: null,
  };
}

/**
 * Convert a proxy object back to an Excel row.
 */
function proxyToRow(proxy) {
  return {
    'TYPE': proxy.type,
    'HOST PORT': proxy.hostPort,
    'IPv4': proxy.ipv4,
    'IPv6': proxy.ipv6,
    'GEO': proxy.country,
    'TIME ZONE': proxy.timezone,
    'CITY': proxy.city,
    'IPS': proxy.isp,
    'MS': proxy.latency,
    'STATUS': proxy.status,
  };
}

/**
 * Load proxies from an xlsx file.
 */
function loadFromFile(filePath) {
  try {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    return rows.map(parseRow);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return []; // File doesn't exist yet
    }
    throw err;
  }
}

/**
 * Save proxies to an xlsx file.
 */
function saveToFile(filePath, proxies) {
  const rows = proxies.map(proxyToRow);
  const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  
  // Set column widths
  ws['!cols'] = [
    { wch: 6 },  // TYPE
    { wch: 50 }, // HOST PORT
    { wch: 16 }, // IPv4
    { wch: 16 }, // IPv6
    { wch: 5 },  // GEO
    { wch: 25 }, // TIME ZONE
    { wch: 25 }, // CITY
    { wch: 40 }, // IPS
    { wch: 8 },  // MS
    { wch: 8 },  // STATUS
  ];
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet');
  XLSX.writeFile(wb, filePath);
}

/**
 * Initialize: clone original to working copy if it doesn't exist, then load into memory.
 * The original all.xlsx is never touched after this.
 */
function init() {
  if (!fs.existsSync(WORKING_FILE)) {
    console.log(`Cloning ${ORIGINAL_FILE} → ${WORKING_FILE}`);
    fs.copyFileSync(ORIGINAL_FILE, WORKING_FILE);
  } else {
    console.log(`Using existing working copy: ${WORKING_FILE}`);
  }
  
  activeProxies = loadFromFile(WORKING_FILE);
  archivedProxies = loadFromFile(ARCHIVED_FILE);
  
  console.log(`Loaded ${activeProxies.length} active proxies (from working copy)`);
  console.log(`Loaded ${archivedProxies.length} archived proxies`);
  console.log(`Original file preserved: ${ORIGINAL_FILE}`);
  
  return { active: activeProxies.length, archived: archivedProxies.length };
}

/**
 * Sync data from all.xlsx to working.xlsx.
 * This will load the original file and append any new proxies that are not already
 * in the active or archived list based on their host:port ID.
 */
function syncFromOriginal() {
  const originalProxies = loadFromFile(ORIGINAL_FILE);
  
  // Keep track of existing IDs to avoid duplicates
  const existingIds = new Set([
    ...activeProxies.map(p => p.id),
    ...archivedProxies.map(p => p.id)
  ]);
  
  let addedCount = 0;
  
  for (const proxy of originalProxies) {
    if (!existingIds.has(proxy.id)) {
      activeProxies.push(proxy);
      addedCount++;
    }
  }
  
  if (addedCount > 0) {
    saveWorkingFile();
  }
  
  return { added: addedCount, totalActive: activeProxies.length };
}

/**
 * Clear all data in the current system (working.xlsx and archived.xlsx)
 * and start fresh by copying the original all.xlsx again.
 */
function clearData() {
  // Delete existing working and archived files if they exist
  if (fs.existsSync(WORKING_FILE)) {
    fs.unlinkSync(WORKING_FILE);
  }
  if (fs.existsSync(ARCHIVED_FILE)) {
    fs.unlinkSync(ARCHIVED_FILE);
  }
  
  // Re-initialize from original
  return init();
}

/**
 * Save the current active proxies to the working file.
 */
function saveWorkingFile() {
  saveToFile(WORKING_FILE, activeProxies);
}

/**
 * Save the current archived proxies to the archived file.
 */
function saveArchivedFile() {
  saveToFile(ARCHIVED_FILE, archivedProxies);
}

/**
 * Get active proxies with pagination and filters.
 */
function getActiveProxies({ page = 1, limit = 50, country, isp, category, search } = {}) {
  return filterAndPaginate(activeProxies, { page, limit, country, isp, category, search });
}

/**
 * Get archived proxies with pagination and filters.
 */
function getArchivedProxies({ page = 1, limit = 50, country, isp, category, search } = {}) {
  return filterAndPaginate(archivedProxies, { page, limit, country, isp, category, search });
}

/**
 * Filter and paginate a proxy list.
 */
function filterAndPaginate(proxies, { page, limit, country, isp, category, search }) {
  let filtered = [...proxies];
  
  if (country) {
    filtered = filtered.filter(p => p.country === country);
  }
  if (isp) {
    filtered = filtered.filter(p => p.isp.toLowerCase().includes(isp.toLowerCase()));
  }
  if (category) {
    filtered = filtered.filter(p => p.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.hostPort.toLowerCase().includes(q) ||
      p.ipv4.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q) ||
      p.isp.toLowerCase().includes(q)
    );
  }
  
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);
  
  return { data, total, page, limit, totalPages };
}

/**
 * Get a single active proxy by ID.
 */
function getActiveProxy(id) {
  return activeProxies.find(p => p.id === id) || null;
}

/**
 * Get a single archived proxy by ID.
 */
function getArchivedProxy(id) {
  return archivedProxies.find(p => p.id === id) || null;
}

/**
 * Update proxy status after a live check and persist to Excel.
 */
function updateProxyStatus(id, status, latency, isArchived = false) {
  const list = isArchived ? archivedProxies : activeProxies;
  const proxy = list.find(p => p.id === id);
  if (proxy) {
    proxy.status = status;
    proxy.latency = latency;
    proxy.lastChecked = new Date().toISOString();
    proxy.lastCheckResult = status;
    
    // Persist status change to the Excel file
    if (isArchived) {
      saveArchivedFile();
    } else {
      saveWorkingFile();
    }
  }
  return proxy;
}

/**
 * Archive a proxy: move from active → archived.
 */
function archiveProxy(id) {
  const index = activeProxies.findIndex(p => p.id === id);
  if (index === -1) return null;
  
  const [proxy] = activeProxies.splice(index, 1);
  proxy.status = 'ARCHIVED';
  archivedProxies.push(proxy);
  
  // Persist both working files
  saveWorkingFile();
  saveArchivedFile();
  
  return proxy;
}

/**
 * Restore a proxy: move from archived → active.
 */
function restoreProxy(id) {
  const index = archivedProxies.findIndex(p => p.id === id);
  if (index === -1) return null;
  
  const [proxy] = archivedProxies.splice(index, 1);
  proxy.status = 'LIVE';
  activeProxies.push(proxy);
  
  // Persist both working files
  saveWorkingFile();
  saveArchivedFile();
  
  return proxy;
}

/**
 * Get stats for the dashboard.
 */
function getStats() {
  const countryCount = {};
  const categoryCount = { residential: 0, datacenter: 0, unknown: 0 };
  const ispCount = {};
  
  for (const p of activeProxies) {
    countryCount[p.country] = (countryCount[p.country] || 0) + 1;
    categoryCount[p.category] = (categoryCount[p.category] || 0) + 1;
    if (p.isp) {
      ispCount[p.isp] = (ispCount[p.isp] || 0) + 1;
    }
  }
  
  // Sort countries and ISPs by count
  const topCountries = Object.entries(countryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ code, count }));
  
  const topISPs = Object.entries(ispCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
  
  return {
    totalActive: activeProxies.length,
    totalArchived: archivedProxies.length,
    categories: categoryCount,
    topCountries,
    topISPs,
  };
}

/**
 * Get available filter options.
 */
function getFilters(isArchived = false) {
  const list = isArchived ? archivedProxies : activeProxies;
  
  const countries = [...new Set(list.map(p => p.country).filter(Boolean))].sort();
  const isps = [...new Set(list.map(p => p.isp).filter(Boolean))].sort();
  const categories = [...new Set(list.map(p => p.category).filter(Boolean))].sort();
  
  return { countries, isps, categories };
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
