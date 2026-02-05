'use strict';

/**
 * knowledge.js — Knowledge subcommands: list, add, search, get, delete
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

async function handleKnowledge(args, flags) {
  requireAuth();
  const sub = args[0] || 'list';

  switch (sub) {
    case 'list':
    case 'ls':
      return await listEntries(flags);
    case 'add':
    case 'create':
      return await addEntry(args.slice(1), flags);
    case 'search':
    case 'find':
      return await searchEntries(args.slice(1), flags);
    case 'get':
      return await getEntry(args[1], flags);
    case 'delete':
    case 'rm':
      return await deleteEntry(args[1], flags);
    default:
      out.error(`Unknown knowledge command: ${sub}`);
      console.log('  Commands: list, add, search, get, delete');
      process.exit(1);
  }
}

async function listEntries(flags) {
  try {
    const query = {};
    if (flags.namespace) query.namespace = flags.namespace;
    if (flags.status) query.status = flags.status;

    const res = await api.listKnowledgeEntries(query);

    if (!isOk(res)) {
      out.error(`Failed to list entries: ${getError(res)}`);
      process.exit(1);
    }

    const entries = getData(res);
    const items = Array.isArray(entries) ? entries : [];

    if (flags.json) {
      out.jsonCompact({ entries: items });
      return;
    }

    out.brand('Knowledge Base');
    console.log('');

    if (items.length === 0) {
      out.info('No knowledge entries found.');
      console.log(`  Add one: ${out.style.cyan('npx beeboo knowledge add --title "..." --content "..."')}`);
      return;
    }

    out.table(items.map(e => ({
      id: e.id?.slice(0, 8) || '—',
      title: e.title || e.key || '(untitled)',
      namespace: e.namespace || 'default',
      status: e.status || '—',
      updated: e.updated_at ? out.timeAgo(e.updated_at) : '—',
    })), [
      { key: 'id', label: 'ID', color: 'dim' },
      { key: 'title', label: 'TITLE' },
      { key: 'namespace', label: 'NAMESPACE', color: 'cyan' },
      { key: 'status', label: 'STATUS' },
      { key: 'updated', label: 'UPDATED', color: 'gray' },
    ]);

    console.log(`\n  ${out.style.dim(`${items.length} entries`)}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function addEntry(args, flags) {
  const title = flags.title || args[0];
  const content = flags.content || args.slice(1).join(' ');

  if (!title) {
    out.error('Title is required.');
    console.log('  Usage: npx beeboo knowledge add --title "Title" --content "Content"');
    process.exit(1);
  }

  try {
    const entry = {
      title: title,
      content: content || '',
      namespace: flags.namespace || 'default',
      content_type: flags.type || 'text',
      key: flags.key || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    };

    if (flags.tags) {
      entry.tags = flags.tags.split(',').map(t => t.trim());
    }

    const res = await api.createKnowledgeEntry(entry);

    if (!isOk(res)) {
      out.error(`Failed to create entry: ${getError(res)}`);
      process.exit(1);
    }

    const data = getData(res);

    if (flags.json) {
      out.jsonCompact(data);
      return;
    }

    out.success(`Knowledge entry created: "${title}"`);
    if (data?.id) console.log(`  ID: ${out.style.dim(data.id)}`);
    if (data?.status) console.log(`  Status: ${data.status}`);
    if (data?.approval_id) console.log(`  Approval: ${out.style.dim(data.approval_id)} (${data.approval_status || 'pending'})`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function searchEntries(args, flags) {
  const query = flags.query || args.join(' ');

  if (!query) {
    out.error('Search query is required.');
    console.log('  Usage: npx beeboo knowledge search "query"');
    process.exit(1);
  }

  try {
    const opts = {};
    if (flags.namespace) opts.namespace = flags.namespace;
    if (flags.limit) opts.limit = parseInt(flags.limit);

    const res = await api.searchKnowledge(query, opts);

    if (!isOk(res)) {
      out.error(`Search failed: ${getError(res)}`);
      process.exit(1);
    }

    const data = getData(res);
    const results = Array.isArray(data) ? data : (data?.results || []);

    if (flags.json) {
      out.jsonCompact({ query, results });
      return;
    }

    if (results.length === 0) {
      out.info(`No results for "${query}".`);
      return;
    }

    console.log(`📚 ${out.style.bold(`${results.length} result${results.length === 1 ? '' : 's'}`)} for "${query}":\n`);

    for (const r of results) {
      console.log(`  ${out.style.amber(r.title || r.key || '(untitled)')}`);
      if (r.content) {
        const preview = r.content.length > 120 ? r.content.slice(0, 120) + '...' : r.content;
        console.log(`  ${out.style.dim(preview)}`);
      }
      if (r.id) console.log(`  ${out.style.dim('ID: ' + r.id)}`);
      console.log('');
    }
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function getEntry(id, flags) {
  if (!id) {
    out.error('Entry ID is required.');
    console.log('  Usage: npx beeboo knowledge get <id>');
    process.exit(1);
  }

  try {
    const res = await api.getKnowledgeEntry(id);

    if (!isOk(res)) {
      if (res.status === 404) {
        out.error('Entry not found. Run: npx beeboo knowledge list');
      } else {
        out.error(`Failed: ${getError(res)}`);
      }
      process.exit(1);
    }

    const entry = getData(res);

    if (flags.json) {
      out.jsonCompact(entry);
      return;
    }

    console.log(`\n📚 ${out.style.bold(entry.title || entry.key || '(untitled)')}`);
    if (entry.namespace) console.log(`  Namespace: ${out.style.cyan(entry.namespace)}`);
    if (entry.status) console.log(`  Status: ${entry.status}`);
    if (entry.tags?.length) console.log(`  Tags: ${entry.tags.join(', ')}`);
    console.log('');
    if (entry.content) console.log(entry.content);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function deleteEntry(id, flags) {
  if (!id) {
    out.error('Entry ID is required.');
    console.log('  Usage: npx beeboo knowledge delete <id>');
    process.exit(1);
  }

  try {
    const res = await api.deleteKnowledgeEntry(id);

    if (!isOk(res)) {
      out.error(`Failed to delete: ${getError(res)}`);
      process.exit(1);
    }

    if (flags.json) {
      out.jsonCompact({ deleted: id });
      return;
    }

    out.success(`Knowledge entry deleted: ${id}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { handleKnowledge };
