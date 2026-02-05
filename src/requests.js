'use strict';

/**
 * requests.js — Requests subcommands: list, create, get, complete
 */

const { api, isOk, getData, getError } = require('./api');
const out = require('./output');
const credentials = require('./credentials');

function requireAuth() {
  if (!credentials.isAuthenticated()) {
    out.error('Not authenticated. Run: npx beeboo auth');
    process.exit(1);
  }
}

async function handleRequests(args, flags) {
  requireAuth();
  const sub = args[0] || 'list';

  switch (sub) {
    case 'list':
    case 'ls':
      return await listRequests(flags);
    case 'create':
    case 'new':
      return await createRequest(args.slice(1), flags);
    case 'get':
      return await getRequest(args[1], flags);
    case 'complete':
    case 'done':
      return await completeRequest(args[1], flags);
    default:
      out.error(`Unknown requests command: ${sub}`);
      console.log('  Commands: list, create, get, complete');
      process.exit(1);
  }
}

async function listRequests(flags) {
  try {
    const query = {};
    if (flags.status) query.status = flags.status;
    if (flags.priority) query.priority = flags.priority;

    const res = await api.listRequests(query);

    if (!isOk(res)) {
      out.error(`Failed to list requests: ${getError(res)}`);
      process.exit(1);
    }

    const requests = getData(res);
    const items = Array.isArray(requests) ? requests : [];

    if (flags.json) {
      out.jsonCompact({ requests: items });
      return;
    }

    out.brand('Requests');
    console.log('');

    if (items.length === 0) {
      out.info('No requests found.');
      return;
    }

    out.table(items.map(r => ({
      id: r.id?.slice(0, 8) || '—',
      title: r.title || '(untitled)',
      status: r.status || 'open',
      priority: r.priority || 'medium',
      created: r.created_at ? out.timeAgo(r.created_at) : '—',
    })), [
      { key: 'id', label: 'ID', color: 'dim' },
      { key: 'title', label: 'TITLE' },
      { key: 'status', label: 'STATUS' },
      { key: 'priority', label: 'PRIORITY' },
      { key: 'created', label: 'CREATED', color: 'gray' },
    ]);

    console.log(`\n  ${out.style.dim(`${items.length} requests`)}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function createRequest(args, flags) {
  const title = flags.title || args.join(' ');

  if (!title) {
    out.error('Title is required.');
    console.log('  Usage: npx beeboo requests create --title "..." [--priority high]');
    process.exit(1);
  }

  try {
    const data = {
      title: title,
      description: flags.description || flags.desc || '',
      priority: flags.priority || 'medium',
    };

    const res = await api.createRequest(data);

    if (!isOk(res)) {
      out.error(`Failed to create request: ${getError(res)}`);
      process.exit(1);
    }

    const result = getData(res);

    if (flags.json) {
      out.jsonCompact(result);
      return;
    }

    out.success(`Request created: "${title}"`);
    console.log(`  Priority: ${data.priority}`);
    if (result?.id) console.log(`  ID: ${out.style.dim(result.id)}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function getRequest(id, flags) {
  if (!id) {
    out.error('Request ID is required.');
    console.log('  Usage: npx beeboo requests get <id>');
    process.exit(1);
  }

  try {
    const res = await api.getRequest(id);

    if (!isOk(res)) {
      out.error(`Failed: ${getError(res)}`);
      process.exit(1);
    }

    const request = getData(res);

    if (flags.json) {
      out.jsonCompact(request);
      return;
    }

    const statusIcon = request.status === 'completed' ? '✅' : '📋';
    console.log(`\n${statusIcon} ${out.style.bold(request.title || '(untitled)')}`);
    console.log(`  Status: ${request.status || 'open'}`);
    console.log(`  Priority: ${request.priority || 'medium'}`);
    if (request.description) {
      console.log(`\n  ${request.description}`);
    }
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function completeRequest(id, flags) {
  if (!id) {
    out.error('Request ID is required.');
    console.log('  Usage: npx beeboo requests complete <id>');
    process.exit(1);
  }

  try {
    const resolution = flags.resolution || flags.reason || 'Completed';
    const res = await api.completeRequest(id, resolution);

    if (!isOk(res)) {
      out.error(`Failed to complete: ${getError(res)}`);
      process.exit(1);
    }

    if (flags.json) {
      out.jsonCompact(getData(res));
      return;
    }

    out.success(`Request completed: ${id}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { handleRequests };
