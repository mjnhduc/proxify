/**
 * ISP-based Residential vs Datacenter classifier.
 * Uses keyword matching against known datacenter/hosting providers.
 */

const DATACENTER_KEYWORDS = [
  // Global cloud providers
  'cloud', 'aws', 'amazon', 'google cloud', 'azure', 'microsoft',
  'digital ocean', 'digitalocean', 'linode', 'vultr', 'oracle',
  
  // Hosting providers
  'hetzner', 'ovh', 'hostpapa', 'leaseweb', 'clouvider', 'heficed',
  'hostinger', 'godaddy', 'bluehost', 'namecheap', 'ionos',
  'rackspace', 'softlayer', 'contabo',
  
  // VPS / Server providers
  '3xk tech', 'vietserver', 'vncloud', 'lienvps', 'httvserver',
  'superdata', 'lightnode', 'whitelabelcolo', 'iron hosting',
  'eonix', 'orion network', 'bach kim network',
  'megacore', 'tejays dynamic',
  
  // CDN / Infrastructure
  'cloudflare', 'akamai', 'fastly', 'zscaler', 'cnisp',
  
  // Enterprise cloud (CN)
  'alibaba', 'tencent', 'huawei cloud',
  
  // Proxy-specific services
  'embratel cloud',
  
  // Keywords
  'hosting', 'server', 'vps', 'datacenter', 'data center',
  'colocation', 'colo',
];

/**
 * Classify an ISP as residential or datacenter.
 * @param {string} isp - ISP name
 * @returns {'residential' | 'datacenter'}
 */
function classifyISP(isp) {
  if (!isp || isp.trim() === '') return 'unknown';
  
  const lower = isp.toLowerCase().trim();
  
  for (const keyword of DATACENTER_KEYWORDS) {
    if (lower.includes(keyword)) {
      return 'datacenter';
    }
  }
  
  return 'residential';
}

module.exports = { classifyISP };
