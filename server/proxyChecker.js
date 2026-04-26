/**
 * Proxy liveness checker.
 * Sends a request through the proxy to verify it's working.
 */

const { HttpProxyAgent } = require('http-proxy-agent');
const fetch = require('node-fetch');

const CHECK_URL = 'http://httpbin.org/ip';
const TIMEOUT_MS = 10000;

/**
 * Check if a proxy is alive by sending a request through it.
 * @param {{ host: string, port: string, username: string, password: string }} proxy
 * @returns {Promise<{ alive: boolean, latency: number, externalIp: string | null, error: string | null }>}
 */
async function checkProxy(proxy) {
  const { host, port, username, password } = proxy;
  const proxyUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
  
  const agent = new HttpProxyAgent(proxyUrl);
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const response = await fetch(CHECK_URL, {
      agent,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    clearTimeout(timeout);
    const latency = Date.now() - start;
    
    if (response.ok) {
      const data = await response.json();
      return {
        alive: true,
        latency,
        externalIp: data.origin || null,
        error: null
      };
    }
    
    return {
      alive: false,
      latency,
      externalIp: null,
      error: `HTTP ${response.status}`
    };
  } catch (err) {
    const latency = Date.now() - start;
    return {
      alive: false,
      latency,
      externalIp: null,
      error: err.name === 'AbortError' ? 'Timeout' : err.message
    };
  }
}

module.exports = { checkProxy };
