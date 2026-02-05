'use strict';

/**
 * credentials.js — Token storage in ~/.beeboo/credentials.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR_NAME = '.beeboo';
const CRED_FILE = 'credentials.json';
const DIR_PERM = 0o700;
const FILE_PERM = 0o600;

function getDir() {
  return path.join(os.homedir(), DIR_NAME);
}

function getPath() {
  return path.join(getDir(), CRED_FILE);
}

function ensureDir() {
  const dir = getDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: DIR_PERM });
  }
}

function load() {
  const fp = getPath();
  try {
    const data = fs.readFileSync(fp, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function save(creds) {
  ensureDir();
  const fp = getPath();
  fs.writeFileSync(fp, JSON.stringify(creds, null, 2) + '\n', { mode: FILE_PERM });
}

function remove() {
  const fp = getPath();
  try {
    fs.unlinkSync(fp);
    return true;
  } catch {
    return false;
  }
}

function getApiKey() {
  // Env var takes priority
  if (process.env.BEEBOO_API_KEY) {
    return process.env.BEEBOO_API_KEY;
  }
  const creds = load();
  return creds?.api_key || null;
}

function getApiUrl() {
  // Env var takes priority
  if (process.env.BEEBOO_API_URL) {
    return process.env.BEEBOO_API_URL;
  }
  const creds = load();
  return creds?.api_url || 'https://beeboo-api-625726065149.us-central1.run.app';
}

function isAuthenticated() {
  return !!getApiKey();
}

module.exports = {
  load,
  save,
  remove,
  getApiKey,
  getApiUrl,
  getDir,
  getPath,
  isAuthenticated,
};
