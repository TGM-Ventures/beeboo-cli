'use strict';

/**
 * log.js — Show history of knowledge changes (like git log).
 *
 * Usage:
 *   beeboo log                     # Recent commits across all entries
 *   beeboo log --key refund-policy # History for specific key
 *   beeboo log --limit 5           # Limit results
 *   beeboo log --status draft      # Filter by status
 */

const { api, isOk, getData, getError } = require('../api');
const out = require('../output');
const credentials = require('../credentials');

function requireAuth() {
  if (!credentials.isAuthenticated()) {
    out.error('Not authenticated. Run: npx beeboo auth');
    process.exit(1);
  }
}

/**
 * Format a date as a git-log-style string.
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${d.toTimeString().slice(0, 8)} ${d.getFullYear()}`;
}

async function handleLog(args, flags) {
  requireAuth();

  try {
    // Build query
    const query = {};
    if (flags.namespace) query.namespace = flags.namespace;
    if (flags.status) query.status = flags.status;
    if (flags.key) query.key = flags.key;

    const res = await api.listKnowledgeEntries(query);

    if (!isOk(res)) {
      out.error(`Failed to fetch log: ${getError(res)}`);
      process.exit(1);
    }

    let entries = getData(res);
    entries = Array.isArray(entries) ? entries : [];

    // Filter by key if specified (client-side, in case API doesn't support key filter)
    if (flags.key) {
      entries = entries.filter(e => e.key === flags.key);
    }

    // Sort by updated_at descending (most recent first)
    entries.sort((a, b) => {
      const da = new Date(b.updated_at || b.created_at || 0);
      const db = new Date(a.updated_at || a.created_at || 0);
      return da - db;
    });

    // Apply limit
    const limit = flags.limit ? parseInt(flags.limit, 10) : 20;
    entries = entries.slice(0, limit);

    if (flags.json) {
      out.jsonCompact({ entries });
      return;
    }

    if (entries.length === 0) {
      out.info('No knowledge entries found.');
      if (flags.key) {
        console.log(`  No entries with key "${flags.key}".`);
      }
      console.log(`  Create one: ${out.style.cyan('beeboo commit "Your content" --key "your-key"')}`);
      return;
    }

    // Git log-style output
    for (const entry of entries) {
      const statusIcon = entry.status === 'published' ? out.style.green('●') :
                         entry.status === 'draft' ? out.style.yellow('○') :
                         entry.status === 'archived' ? out.style.dim('◌') : out.style.dim('?');
      const statusLabel = entry.status === 'published' ? out.style.green(entry.status) :
                          entry.status === 'draft' ? out.style.yellow(entry.status) :
                          out.style.dim(entry.status || 'unknown');

      console.log(`${out.style.yellow('commit ' + entry.id)}`);

      // Author
      const author = entry.created_by;
      if (author) {
        console.log(`Author: ${author.name || author.id || 'unknown'} <${author.type || 'user'}>`);
      }

      // Date
      console.log(`Date:   ${formatDate(entry.updated_at || entry.created_at)}`);

      // Status + Version
      console.log(`Status: ${statusIcon} ${statusLabel}  ${out.style.dim(`v${entry.version || 1}`)}`);

      // Namespace + Key
      if (entry.key) {
        console.log(`Key:    ${out.style.cyan(entry.key)} ${out.style.dim(`(${entry.namespace || 'default'})`)}`);
      }

      // Tags
      if (entry.tags?.length) {
        console.log(`Tags:   ${entry.tags.map(t => out.style.magenta(t)).join(', ')}`);
      }

      console.log('');

      // Title / content preview (indented like git log)
      console.log(`    ${out.style.bold(entry.title || '(untitled)')}`);
      if (entry.content) {
        const preview = entry.content.split('\n').slice(0, 3);
        for (const line of preview) {
          const trimmed = line.length > 100 ? line.slice(0, 100) + '...' : line;
          console.log(`    ${out.style.dim(trimmed)}`);
        }
      }
      console.log('');
    }

    console.log(out.style.dim(`  Showing ${entries.length} entries. Use --limit <n> to see more.`));
  } catch (err) {
    out.error(`Log failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { handleLog };
