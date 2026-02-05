'use strict';

/**
 * api.js — HTTP client for the BeeBoo API. Zero dependencies (uses Node.js https).
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const credentials = require('./credentials');

const USER_AGENT = 'beeboo-cli/0.3.0 (node)';

/**
 * Make an HTTP request to the BeeBoo API.
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g., /api/v1/knowledge/entries)
 * @param {object} [body] - Request body (will be JSON-encoded)
 * @param {object} [opts] - Additional options
 * @param {object} [opts.query] - Query parameters
 * @param {string} [opts.apiKey] - Override API key
 * @param {string} [opts.baseUrl] - Override base URL
 * @returns {Promise<{status: number, data: any, raw: string}>}
 */
function request(method, path, body, opts = {}) {
  return new Promise((resolve, reject) => {
    const apiKey = opts.apiKey || credentials.getApiKey();
    const baseUrl = opts.baseUrl || credentials.getApiUrl();

    // Build URL with query params
    let fullUrl = baseUrl + path;
    if (opts.query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null && v !== '') {
          params.set(k, v);
        }
      }
      const qs = params.toString();
      if (qs) fullUrl += '?' + qs;
    }

    const parsed = new URL(fullUrl);
    const isHTTPS = parsed.protocol === 'https:';
    const lib = isHTTPS ? https : http;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': USER_AGENT,
    };

    if (apiKey) {
      if (apiKey.startsWith('bb_')) {
        headers['X-API-Key'] = apiKey;
      }
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    let bodyStr = null;
    if (body) {
      bodyStr = JSON.stringify(body);
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHTTPS ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: method,
      headers: headers,
      timeout: 30000,
    };

    const req = lib.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          data: parsed,
          raw: data,
        });
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Network error: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out (30s)'));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

// Convenience methods
const api = {
  get: (path, opts) => request('GET', path, null, opts),
  post: (path, body, opts) => request('POST', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  delete: (path, opts) => request('DELETE', path, null, opts),

  // --- Auth ---
  whoami: (opts) => api.get('/api/v1/auth/whoami', opts),

  // --- Org ---
  getOrg: () => api.get('/api/v1/org'),

  // --- Knowledge ---
  createKnowledgeEntry: (entry) => api.post('/api/v1/knowledge/entries', entry),
  listKnowledgeEntries: (query) => api.get('/api/v1/knowledge/entries', { query }),
  getKnowledgeEntry: (id) => api.get(`/api/v1/knowledge/entries/${id}`),
  updateKnowledgeEntry: (id, updates) => api.patch(`/api/v1/knowledge/entries/${id}`, updates),
  deleteKnowledgeEntry: (id) => api.delete(`/api/v1/knowledge/entries/${id}`),
  searchKnowledge: (query, opts) => api.post('/api/v1/knowledge/search', { query, limit: opts?.limit || 10, ...opts }),

  // --- Approvals ---
  submitApproval: (data) => api.post('/api/v1/approvals', data),
  listApprovals: (query) => api.get('/api/v1/approvals', { query }),
  getApproval: (id) => api.get(`/api/v1/approvals/${id}`),
  decideApproval: (id, decision, note) => api.post(`/api/v1/approvals/${id}/decide`, { decision, note }),

  // --- Requests ---
  createRequest: (data) => api.post('/api/v1/requests', data),
  listRequests: (query) => api.get('/api/v1/requests', { query }),
  getRequest: (id) => api.get(`/api/v1/requests/${id}`),
  updateRequest: (id, updates) => api.patch(`/api/v1/requests/${id}`, updates),
  completeRequest: (id, resolution) => api.post(`/api/v1/requests/${id}/complete`, { resolution }),

  // --- Projects ---
  listProjects: () => api.get('/api/v1/projects'),
  getProject: (id) => api.get(`/api/v1/projects/${id}`),
  createProject: (data) => api.post('/api/v1/projects', data),

  // --- Knowledge (extended) ---
  getKnowledgeEntryByKey: (key) => api.get('/api/v1/knowledge/entries', { query: { key } }),
  listKnowledgeEntriesByStatus: (status) => api.get('/api/v1/knowledge/entries', { query: { status } }),

  // --- Health ---
  health: () => api.get('/readyz'),
  apiInfo: () => api.get('/api/v1'),
};

/**
 * Check if response is OK (2xx)
 */
function isOk(res) {
  return res.status >= 200 && res.status < 300;
}

/**
 * Extract data from standard { data: ... } response
 */
function getData(res) {
  if (res.data?.data !== undefined) return res.data.data;
  return res.data;
}

/**
 * Extract error message from standard { error: { message: ... } } response
 */
function getError(res) {
  if (res.data?.error?.message) return res.data.error.message;
  if (res.data?.error) return typeof res.data.error === 'string' ? res.data.error : JSON.stringify(res.data.error);
  if (typeof res.data === 'string') return res.data;
  return `HTTP ${res.status}`;
}

module.exports = {
  request,
  api,
  isOk,
  getData,
  getError,
};
