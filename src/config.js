'use strict';

/**
 * config.js — CLI configuration management (~/.beeboo/config.json)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = 'config.json';

function getPath() {
  return path.join(os.homedir(), '.beeboo', CONFIG_FILE);
}

function load() {
  try {
    const data = fs.readFileSync(getPath(), 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function save(config) {
  const dir = path.dirname(getPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(getPath(), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

function get(key) {
  const cfg = load();
  return cfg[key];
}

function set(key, value) {
  const cfg = load();
  cfg[key] = value;
  save(cfg);
}

function del(key) {
  const cfg = load();
  delete cfg[key];
  save(cfg);
}

const KNOWN_KEYS = {
  'api.url': 'BeeBoo API URL',
  'output.format': 'Default output format: text or json',
  'output.color': 'Enable color output: true or false',
};

async function handleConfig(args) {
  const out = require('./output');
  const sub = args[0];

  if (!sub || sub === 'list') {
    const cfg = load();
    const keys = Object.keys(cfg).sort();
    if (keys.length === 0) {
      out.info('No config values set.');
      console.log(`\n  Available keys:`);
      for (const [k, desc] of Object.entries(KNOWN_KEYS)) {
        console.log(`  ${out.style.cyan(k)} — ${desc}`);
      }
      return;
    }
    out.brand('Configuration');
    console.log('');
    for (const k of keys) {
      console.log(`  ${out.style.cyan(k)} = ${cfg[k]}`);
    }
    return;
  }

  if (sub === 'set') {
    const key = args[1];
    const value = args.slice(2).join(' ');
    if (!key || !value) {
      out.error('Usage: beeboo config set <key> <value>');
      process.exit(1);
    }
    set(key, value);
    out.success(`Set ${out.style.cyan(key)} = ${value}`);
    return;
  }

  if (sub === 'get') {
    const key = args[1];
    if (!key) {
      out.error('Usage: beeboo config get <key>');
      process.exit(1);
    }
    const val = get(key);
    if (val === undefined) {
      out.warn(`Key "${key}" not set.`);
    } else {
      console.log(val);
    }
    return;
  }

  if (sub === 'delete' || sub === 'unset') {
    const key = args[1];
    if (!key) {
      out.error('Usage: beeboo config delete <key>');
      process.exit(1);
    }
    del(key);
    out.success(`Deleted ${out.style.cyan(key)}`);
    return;
  }

  out.error(`Unknown config command: ${sub}`);
  console.log('  Commands: list, set, get, delete');
}

module.exports = {
  load,
  save,
  get,
  set,
  del,
  handleConfig,
  KNOWN_KEYS,
};
