/**
 * Proxy Portal — Frontend Application
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────

  const state = {
    currentTab: 'active',     // 'active' | 'archived'
    page: 1,
    limit: 50,
    filters: {
      country: 'VN',
      isp: '',
      category: 'residential',
      search: '',
    },
    selected: new Map(),      // Map of proxy ID -> hostPort
    stats: null,
    checking: new Set(),      // IDs currently being checked
    ispList: [],              // Available ISPs with counts for autocomplete
    ispHighlightIndex: -1,    // Currently highlighted autocomplete item
  };

  // ── DOM References ─────────────────────────────────────────

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    headerStats: $('#headerStats'),
    statsGrid: $('#statsGrid'),
    tabActive: $('#tabActive'),
    tabArchived: $('#tabArchived'),
    tabAdmin: $('#tabAdmin'),
    tabActiveCount: $('#tabActiveCount'),
    tabArchivedCount: $('#tabArchivedCount'),
    searchInput: $('#searchInput'),
    filterCountry: $('#filterCountry'),
    filterCategory: $('#filterCategory'),
    filterISP: $('#filterISP'),
    ispAutocomplete: $('#ispAutocomplete'),
    ispDropdown: $('#ispDropdown'),
    btnClearFilters: $('#btnClearFilters'),
    selectAll: $('#selectAll'),
    proxyTableBody: $('#proxyTableBody'),
    paginationInfo: $('#paginationInfo'),
    paginationControls: $('#paginationControls'),
    adminPanel: $('#adminPanel'),
    btnSyncData: $('#btnSyncData'),
    btnClearData: $('#btnClearData'),
    floatingBar: $('#floatingBar'),
    selectedCount: $('#selectedCount'),
    btnCopySelected: $('#btnCopySelected'),
    btnDeselectAll: $('#btnDeselectAll'),
    toastContainer: $('#toastContainer'),
  };

  // ── Country flag emoji helper ──────────────────────────────

  function countryFlag(code) {
    if (!code || code.length !== 2) return '🌍';
    const offset = 0x1F1E6;
    const a = code.charCodeAt(0) - 65 + offset;
    const b = code.charCodeAt(1) - 65 + offset;
    return String.fromCodePoint(a) + String.fromCodePoint(b);
  }

  // ── API Helpers ────────────────────────────────────────────

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    
    if (res.status === 401) {
      window.location.href = '/login.html';
      return new Promise(() => {}); // hang promise so no further errors are thrown
    }
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async function fetchProxies() {
    const params = new URLSearchParams({
      page: state.page,
      limit: state.limit,
    });
    if (state.filters.country) params.set('country', state.filters.country);
    if (state.filters.isp) params.set('isp', state.filters.isp);
    if (state.filters.category) params.set('category', state.filters.category);
    if (state.filters.search) params.set('search', state.filters.search);

    const endpoint = state.currentTab === 'archived' ? '/api/archived' : '/api/proxies';
    return api(`${endpoint}?${params}`);
  }

  async function fetchStats() {
    return api('/api/stats');
  }

  async function fetchFilters() {
    const isArchived = state.currentTab === 'archived';
    return api(`/api/filters?archived=${isArchived}`);
  }

  // ── Toast Notifications ────────────────────────────────────

  function showToast(message, type = 'info') {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    els.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ── Render Stats ───────────────────────────────────────────

  function renderStats(stats) {
    state.stats = stats;

    // Header stats
    els.headerStats.innerHTML = `
      <div class="header-stat">Active: <strong>${stats.totalActive.toLocaleString()}</strong></div>
      <div class="header-stat">Archived: <strong>${stats.totalArchived.toLocaleString()}</strong></div>
    `;

    // Tab counts
    els.tabActiveCount.textContent = stats.totalActive.toLocaleString();
    els.tabArchivedCount.textContent = stats.totalArchived.toLocaleString();

    // Stats cards
    const topCountry = stats.topCountries[0];
    els.statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-label">Total Active</div>
        <div class="stat-card-value accent">${stats.totalActive.toLocaleString()}</div>
        <div class="stat-card-sub">${stats.totalArchived} archived</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Residential</div>
        <div class="stat-card-value purple">${(stats.categories.residential || 0).toLocaleString()}</div>
        <div class="stat-card-sub">${((stats.categories.residential || 0) / stats.totalActive * 100).toFixed(1)}% of total</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Datacenter</div>
        <div class="stat-card-value success">${(stats.categories.datacenter || 0).toLocaleString()}</div>
        <div class="stat-card-sub">${((stats.categories.datacenter || 0) / stats.totalActive * 100).toFixed(1)}% of total</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Top Country</div>
        <div class="stat-card-value warning">${topCountry ? countryFlag(topCountry.code) + ' ' + topCountry.code : '—'}</div>
        <div class="stat-card-sub">${topCountry ? topCountry.count.toLocaleString() + ' proxies' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Countries</div>
        <div class="stat-card-value accent">${stats.topCountries.length}+</div>
        <div class="stat-card-sub">Unique locations</div>
      </div>
    `;
  }

  // ── Render Filters ─────────────────────────────────────────

  function renderFilters(filters) {
    // Country dropdown
    els.filterCountry.innerHTML = '<option value="">All Countries</option>';
    filters.countries.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = `${countryFlag(c)} ${c}`;
      els.filterCountry.appendChild(opt);
    });
    els.filterCountry.value = state.filters.country;
    els.filterCategory.value = state.filters.category;

    // Store ISP list for autocomplete (with counts from stats)
    const ispCounts = {};
    if (state.stats && state.stats.topISPs) {
      state.stats.topISPs.forEach(item => { ispCounts[item.name] = item.count; });
    }
    state.ispList = filters.isps.map(name => ({
      name,
      count: ispCounts[name] || null,
    }));
  }

  // ── ISP Autocomplete ──────────────────────────────────────

  function highlightText(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }

  function renderISPDropdown(query) {
    const q = (query || '').toLowerCase().trim();
    let filtered = state.ispList;

    if (q) {
      filtered = filtered.filter(item => item.name.toLowerCase().includes(q));
    }

    // Limit to 20 results
    const shown = filtered.slice(0, 20);

    if (shown.length === 0) {
      els.ispDropdown.innerHTML = '<div class="autocomplete-empty">No ISPs found</div>';
    } else {
      els.ispDropdown.innerHTML = shown.map((item, i) => `
        <div class="autocomplete-item ${i === state.ispHighlightIndex ? 'highlighted' : ''}" data-isp="${item.name}">
          <span class="autocomplete-item-name">${highlightText(item.name, q)}</span>
          ${item.count ? `<span class="autocomplete-item-count">${item.count}</span>` : ''}
        </div>
      `).join('');
    }

    els.ispDropdown.classList.add('open');
  }

  function closeISPDropdown() {
    els.ispDropdown.classList.remove('open');
    state.ispHighlightIndex = -1;
  }

  function selectISP(ispName) {
    state.filters.isp = ispName;
    els.filterISP.value = ispName;
    els.filterISP.classList.add('has-value');
    els.ispAutocomplete.classList.add('has-value');
    closeISPDropdown();
    state.page = 1;
    reloadTable();
  }

  function clearISP() {
    state.filters.isp = '';
    els.filterISP.value = '';
    els.filterISP.classList.remove('has-value');
    els.ispAutocomplete.classList.remove('has-value');
    closeISPDropdown();
    state.page = 1;
    reloadTable();
  }

  // ISP input events
  let ispInputTimeout;
  els.filterISP.addEventListener('input', () => {
    clearTimeout(ispInputTimeout);
    state.ispHighlightIndex = -1;
    ispInputTimeout = setTimeout(() => {
      const query = els.filterISP.value;
      if (query.trim()) {
        renderISPDropdown(query);
      } else {
        // Show all ISPs when input is cleared
        renderISPDropdown('');
      }
    }, 150);
  });

  els.filterISP.addEventListener('focus', () => {
    renderISPDropdown(els.filterISP.value);
  });

  // Keyboard navigation for autocomplete
  els.filterISP.addEventListener('keydown', (e) => {
    const items = els.ispDropdown.querySelectorAll('.autocomplete-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.ispHighlightIndex = Math.min(state.ispHighlightIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === state.ispHighlightIndex));
      items[state.ispHighlightIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.ispHighlightIndex = Math.max(state.ispHighlightIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle('highlighted', i === state.ispHighlightIndex));
      items[state.ispHighlightIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (state.ispHighlightIndex >= 0 && items[state.ispHighlightIndex]) {
        selectISP(items[state.ispHighlightIndex].dataset.isp);
      }
    } else if (e.key === 'Escape') {
      closeISPDropdown();
      els.filterISP.blur();
    }
  });

  // Click on autocomplete item
  els.ispDropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.autocomplete-item');
    if (item) {
      selectISP(item.dataset.isp);
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!els.ispAutocomplete.contains(e.target)) {
      closeISPDropdown();
      // If the input has text but no ISP was selected, apply it as a partial filter
      const val = els.filterISP.value.trim();
      if (val && val !== state.filters.isp) {
        state.filters.isp = val;
        els.filterISP.classList.add('has-value');
        els.ispAutocomplete.classList.add('has-value');
        state.page = 1;
        reloadTable();
      }
    }
  });

  // Add clear button dynamically
  const ispClearBtn = document.createElement('button');
  ispClearBtn.className = 'autocomplete-clear';
  ispClearBtn.innerHTML = '✕';
  ispClearBtn.title = 'Clear ISP filter';
  ispClearBtn.type = 'button';
  ispClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearISP();
  });
  els.ispAutocomplete.appendChild(ispClearBtn);

  // ── Render Table ───────────────────────────────────────────

  function renderTable(result) {
    const { data, total, page, limit, totalPages } = result;

    if (data.length === 0) {
      els.proxyTableBody.innerHTML = `
        <tr>
          <td colspan="10">
            <div class="empty-state">
              <div class="empty-state-icon">${state.currentTab === 'archived' ? '📦' : '🔍'}</div>
              <div class="empty-state-title">${state.currentTab === 'archived' ? 'No archived proxies' : 'No proxies found'}</div>
              <div class="empty-state-desc">${state.currentTab === 'archived' ? 'Archived proxies will appear here' : 'Try adjusting your filters'}</div>
            </div>
          </td>
        </tr>
      `;
      els.paginationInfo.innerHTML = '';
      els.paginationControls.innerHTML = '';
      return;
    }

    const startNum = (page - 1) * limit + 1;

    els.proxyTableBody.innerHTML = data.map((proxy, i) => {
      const isSelected = state.selected.has(proxy.id);
      const isChecking = state.checking.has(proxy.id);
      const num = startNum + i;

      const latencyClass = !proxy.latency ? '' :
        proxy.latency < 2000 ? 'latency-fast' :
        proxy.latency < 5000 ? 'latency-medium' : 'latency-slow';

      const statusBadge = proxy.status === 'LIVE' ? 'badge-live' :
        proxy.status === 'DIE' ? 'badge-die' :
        proxy.status === 'ARCHIVED' ? 'badge-archived' : 'badge-unknown';

      const categoryBadge = proxy.category === 'residential' ? 'badge-residential' :
        proxy.category === 'datacenter' ? 'badge-datacenter' : 'badge-unknown';

      const isArchived = state.currentTab === 'archived';
      const actionBtn = isArchived
        ? `<button class="btn btn-sm btn-success" onclick="app.restoreProxy('${proxy.id}')" title="Restore to active">↩ Restore</button>`
        : `<button class="btn btn-sm btn-danger" onclick="app.archiveProxy('${proxy.id}')" title="Archive this proxy">📦 Archive</button>`;

      return `
        <tr class="${isSelected ? 'selected' : ''}" data-id="${proxy.id}">
          <td>
            <div class="checkbox-wrapper">
              <input type="checkbox" class="checkbox proxy-checkbox" data-id="${proxy.id}" ${isSelected ? 'checked' : ''} />
            </div>
          </td>
          <td style="color: var(--text-muted); font-size: 12px;">${num}</td>
          <td class="host-port" title="${proxy.hostPort}">${proxy.host}:${proxy.port}</td>
          <td>
            <span class="country">
              <span class="country-flag">${countryFlag(proxy.country)}</span>
              <span class="country-code">${proxy.country}</span>
            </span>
          </td>
          <td>${proxy.city || '—'}</td>
          <td title="${proxy.isp}">${proxy.isp ? (proxy.isp.length > 25 ? proxy.isp.substring(0, 25) + '…' : proxy.isp) : '—'}</td>
          <td><span class="badge ${categoryBadge}">${proxy.category}</span></td>
          <td><span class="latency ${latencyClass}">${proxy.latency ? proxy.latency.toLocaleString() + 'ms' : '—'}</span></td>
          <td><span class="badge ${statusBadge}">${proxy.status}</span></td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm btn-icon" onclick="app.checkProxy('${proxy.id}')" title="Check liveness" ${isChecking ? 'disabled' : ''}>
                ${isChecking ? '<div class="spinner"></div>' : '📡'}
              </button>
              <button class="btn btn-sm btn-icon" onclick="app.copyProxy('${proxy.hostPort}')" title="Copy proxy to clipboard">
                📋
              </button>
              ${actionBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Update select-all checkbox
    const pageIds = data.map(p => p.id);
    const allPageSelected = pageIds.every(id => state.selected.has(id));
    els.selectAll.checked = allPageSelected;

    // Pagination info
    const endNum = Math.min(startNum + limit - 1, total);
    els.paginationInfo.innerHTML = `
      Showing <strong>${startNum}–${endNum}</strong> of <strong>${total.toLocaleString()}</strong> proxies
    `;

    // Pagination controls
    renderPagination(page, totalPages);
  }

  function renderPagination(current, total) {
    if (total <= 1) {
      els.paginationControls.innerHTML = '';
      return;
    }

    let pages = [];
    
    // Always show first page
    pages.push(1);
    
    // Show pages around current
    const start = Math.max(2, current - 2);
    const end = Math.min(total - 1, current + 2);
    
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push('...');
    
    // Always show last page
    if (total > 1) pages.push(total);

    els.paginationControls.innerHTML = `
      <button class="page-btn" onclick="app.goToPage(${current - 1})" ${current === 1 ? 'disabled' : ''}>‹</button>
      ${pages.map(p => {
        if (p === '...') return '<span class="page-ellipsis">…</span>';
        return `<button class="page-btn ${p === current ? 'active' : ''}" onclick="app.goToPage(${p})">${p}</button>`;
      }).join('')}
      <button class="page-btn" onclick="app.goToPage(${current + 1})" ${current === total ? 'disabled' : ''}>›</button>
    `;
  }

  // ── Floating Bar ───────────────────────────────────────────

  function updateFloatingBar() {
    const count = state.selected.size;
    if (count > 0) {
      els.floatingBar.classList.add('visible');
      els.selectedCount.textContent = `${count} selected`;
    } else {
      els.floatingBar.classList.remove('visible');
    }
  }

  function addToSelection(proxy) {
    state.selected.set(proxy.id, proxy.hostPort);
  }

  function removeFromSelection(id) {
    state.selected.delete(id);
  }

  // ── Data Loading ───────────────────────────────────────────

  let currentProxies = [];

  async function loadData() {
    try {
      // Show loading
      els.proxyTableBody.innerHTML = `
        <tr><td colspan="10"><div class="loading-overlay"><div class="loading-spinner"></div></div></td></tr>
      `;

      const [result, stats, filters] = await Promise.all([
        fetchProxies(),
        fetchStats(),
        fetchFilters(),
      ]);

      currentProxies = result.data;
      renderStats(stats);
      renderFilters(filters);
      renderTable(result);
    } catch (err) {
      console.error('Failed to load data:', err);
      showToast('Failed to load proxies: ' + err.message, 'error');
    }
  }

  async function reloadTable() {
    try {
      const result = await fetchProxies();
      currentProxies = result.data;
      renderTable(result);
    } catch (err) {
      showToast('Failed to reload: ' + err.message, 'error');
    }
  }

  // ── Actions ────────────────────────────────────────────────

  window.app = {
    goToPage(page) {
      if (page < 1) return;
      state.page = page;
      reloadTable();
      // Scroll to top of table
      document.querySelector('.table-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    copyProxy(text) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard', 'success');
      }).catch(() => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Copied to clipboard', 'success');
      });
    },

    async checkProxy(id) {
      state.checking.add(id);
      
      // Selectively update button to show spinner
      const row = els.proxyTableBody.querySelector(`tr[data-id="${id}"]`);
      if (row) {
        const btn = row.querySelector('.btn-icon');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<div class="spinner"></div>';
        }
      }

      try {
        const isArchived = state.currentTab === 'archived';
        const result = await api(`/api/proxies/${id}/check?archived=${isArchived}`, { method: 'POST' });

        if (result.alive) {
          showToast(`Proxy is LIVE! Latency: ${result.latency}ms, IP: ${result.externalIp}`, 'success');
        } else {
          showToast(`Proxy is DEAD: ${result.error || 'No response'}`, 'error');
        }

        // Update memory
        const proxy = currentProxies.find(p => p.id === id);
        if (proxy) {
          proxy.status = result.alive ? 'LIVE' : 'DIE';
          proxy.latency = result.latency;
        }

        // Update DOM selectively
        if (row) {
          const latencyClass = !result.latency ? '' :
            result.latency < 2000 ? 'latency-fast' :
            result.latency < 5000 ? 'latency-medium' : 'latency-slow';
          
          const statusBadge = result.alive ? 'badge-live' : 'badge-die';
          
          const latencySpan = row.querySelector('.latency');
          if (latencySpan) {
            latencySpan.className = `latency ${latencyClass}`;
            latencySpan.textContent = result.latency ? result.latency.toLocaleString() + 'ms' : '—';
          }
          
          const statusTd = row.querySelectorAll('td')[8];
          if (statusTd) {
            statusTd.innerHTML = `<span class="badge ${statusBadge}">${result.alive ? 'LIVE' : 'DIE'}</span>`;
          }
        }
      } catch (err) {
        showToast('Check failed: ' + err.message, 'error');
      }

      state.checking.delete(id);
      
      // Restore button
      if (row) {
        const btn = row.querySelector('.btn-icon');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '📡';
        }
      }
      
      // Update stats silently in background
      fetchStats().then(stats => renderStats(stats)).catch(err => console.error(err));
    },

    async archiveProxy(id) {
      try {
        await api(`/api/proxies/${id}/archive`, { method: 'POST' });
        removeFromSelection(id);
        updateFloatingBar();
        showToast('Proxy archived', 'warning');
        await loadData();
      } catch (err) {
        showToast('Archive failed: ' + err.message, 'error');
      }
    },

    async restoreProxy(id) {
      try {
        await api(`/api/archived/${id}/restore`, { method: 'POST' });
        removeFromSelection(id);
        updateFloatingBar();
        showToast('Proxy restored to active', 'success');
        await loadData();
      } catch (err) {
        showToast('Restore failed: ' + err.message, 'error');
      }
    },
  };

  // ── Event Listeners ────────────────────────────────────────

  // Tab switching
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === state.currentTab) return;

      state.currentTab = tab;
      
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      if (tab === 'admin') {
        // Show admin panel, hide table and filters
        $('.stats-grid').style.display = 'none';
        $('.toolbar').style.display = 'none';
        $('.table-wrapper').style.display = 'none';
        els.adminPanel.style.display = 'block';
        state.selected.clear();
        updateFloatingBar();
        return;
      }

      // Hide admin panel, show table and filters
      $('.stats-grid').style.display = 'grid';
      $('.toolbar').style.display = 'flex';
      $('.table-wrapper').style.display = 'block';
      els.adminPanel.style.display = 'none';

      state.page = 1;
      state.selected.clear();
      updateFloatingBar();

      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Clear filters back to default
      state.filters = { country: 'VN', isp: '', category: 'residential', search: '' };
      els.searchInput.value = '';
      els.filterCountry.value = 'VN';
      els.filterCategory.value = 'residential';
      clearISP();

      loadData();
    });
  });

  // Search input with debounce
  let searchTimeout;
  els.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.filters.search = els.searchInput.value.trim();
      state.page = 1;
      reloadTable();
    }, 300);
  });

  // Filter selects
  els.filterCountry.addEventListener('change', () => {
    state.filters.country = els.filterCountry.value;
    state.page = 1;
    reloadTable();
  });

  els.filterCategory.addEventListener('change', () => {
    state.filters.category = els.filterCategory.value;
    state.page = 1;
    reloadTable();
  });

  // Clear filters back to default
  els.btnClearFilters.addEventListener('click', () => {
    state.filters = { country: 'VN', isp: '', category: 'residential', search: '' };
    state.page = 1;
    els.searchInput.value = '';
    els.filterCountry.value = 'VN';
    els.filterCategory.value = 'residential';
    clearISP();
    reloadTable();
  });

  // Select all checkbox
  els.selectAll.addEventListener('change', () => {
    const checked = els.selectAll.checked;
    currentProxies.forEach(p => {
      if (checked) {
        addToSelection(p);
      } else {
        removeFromSelection(p.id);
      }
    });
    renderTable({ data: currentProxies, total: 0, page: state.page, limit: state.limit, totalPages: 0 });
    // Re-fetch to get proper pagination info
    reloadTable();
    updateFloatingBar();
  });

  // Individual checkbox clicks (event delegation)
  els.proxyTableBody.addEventListener('change', (e) => {
    if (e.target.classList.contains('proxy-checkbox')) {
      const id = e.target.dataset.id;
      const proxy = currentProxies.find(p => p.id === id);
      if (e.target.checked && proxy) {
        addToSelection(proxy);
      } else {
        removeFromSelection(id);
      }

      // Update row highlight
      const row = e.target.closest('tr');
      row.classList.toggle('selected', e.target.checked);

      // Update select-all
      const allChecked = currentProxies.every(p => state.selected.has(p.id));
      els.selectAll.checked = allChecked;

      updateFloatingBar();
    }
  });

  // Copy selected — fully synchronous, no API call needed
  els.btnCopySelected.addEventListener('click', () => {
    if (state.selected.size === 0) return;

    const text = Array.from(state.selected.values()).join('\n');
    const count = state.selected.size;

    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied ${count} proxies to clipboard`, 'success');
    }).catch(() => {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(`Copied ${count} proxies to clipboard`, 'success');
    });
  });

  // Deselect all
  els.btnDeselectAll.addEventListener('click', () => {
    state.selected.clear();
    updateFloatingBar();
    reloadTable();
  });

  // Admin Actions
  els.btnSyncData.addEventListener('click', async () => {
    const btn = els.btnSyncData;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '🔄 Syncing...';
    
    try {
      const res = await api('/api/admin/sync', { method: 'POST' });
      showToast(`Sync complete! Added ${res.added.toLocaleString()} new proxies. Total active: ${res.totalActive.toLocaleString()}`, 'success');
      // We don't need to loadData here because we're on the admin tab and data will load when switching tabs
    } catch (err) {
      showToast('Sync failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  els.btnClearData.addEventListener('click', async () => {
    if (!confirm('Are you SURE you want to clear all data? This will reset the working copy to the original all.xlsx file. Any proxies you have archived will be moved back to active, and all live/die statuses will be reset.')) {
      return;
    }
    
    const btn = els.btnClearData;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⚠️ Clearing...';
    
    try {
      const res = await api('/api/admin/clear', { method: 'POST' });
      showToast(`System reset complete. Loaded ${res.active.toLocaleString()} active proxies.`, 'success');
      
      // Update header stats immediately
      if (state.stats) {
        state.stats.totalActive = res.active;
        state.stats.totalArchived = res.archived;
        els.tabActiveCount.textContent = res.active.toLocaleString();
        els.tabArchivedCount.textContent = res.archived.toLocaleString();
      }
    } catch (err) {
      showToast('Clear failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  // ── Initialize ─────────────────────────────────────────────

  loadData();

})();
