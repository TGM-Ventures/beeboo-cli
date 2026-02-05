'use strict';

/**
 * diff.js — Show what changed in knowledge entries (like git diff).
 *
 * Usage:
 *   beeboo diff kb_abc123      # Show content of a specific entry
 *   beeboo diff --pending      # Show all pending/draft entries
 *   beeboo diff --key refund-policy  # Diff by key
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
 * Show a single entry as a diff (all content shown as additions since
 * the API doesn't have version diffing yet).
 */
function showEntryDiff(entry) {
  const statusIcon = entry.status === 'published' ? out.style.green('published') :
                     entry.status === 'draft' ? out.style.yellow('draft (pending)') :
                     out.style.dim(entry.status || 'unknown');

  console.log(out.style.bold(`diff --beeboo a/${entry.key || entry.id} b/${entry.key || entry.id}`));
  console.log(out.style.dim(`--- a/${entry.key || 'null'}`));
  console.log(out.style.dim(`+++ b/${entry.key || entry.id}`));
  console.log(out.style.cyan(`@@ entry: ${entry.id} | v${entry.version || 1} | ${statusIcon} @@`));
  console.log('');

  // Title
  if (entry.title) {
    console.log(out.style.green(`+ [title] ${entry.title}`));
  }

  // Key
  if (entry.key) {
    console.log(out.style.green(`+ [key]   ${entry.key}`));
  }

  // Namespace
  if (entry.namespace && entry.namespace !== 'default') {
    console.log(out.style.green(`+ [ns]    ${entry.namespace}`));
  }

  // Tags
  if (entry.tags?.length) {
    console.log(out.style.green(`+ [tags]  ${entry.tags.join(', ')}`));
  }

  console.log('');

  // Content lines
  if (entry.content) {
    const lines = entry.content.split('\n');
    for (const line of lines) {
      console.log(out.style.green('+ ' + line));
    }
  } else {
    console.log(out.style.dim('  (no content)'));
  }

  console.log('');
}

async function handleDiff(args, flags) {
  requireAuth();

  try {
    // Mode 1: --pending — show all draft entries
    if (flags.pending) {
      const res = await api.listKnowledgeEntries({ status: 'draft' });

      if (!isOk(res)) {
        out.error(`Failed to fetch pending entries: ${getError(res)}`);
        process.exit(1);
      }

      let entries = getData(res);
      entries = Array.isArray(entries) ? entries : [];

      if (flags.json) {
        out.jsonCompact({ pending: entries });
        return;
      }

      if (entries.length === 0) {
        out.info('No pending commits. Working tree clean.');
        return;
      }

      console.log(`\n📋 ${out.style.bold(`${entries.length} pending commit${entries.length === 1 ? '' : 's'}`)} awaiting approval:\n`);

      for (const entry of entries) {
        showEntryDiff(entry);
      }

      console.log(out.style.dim(`  ${entries.length} files changed`));
      return;
    }

    // Mode 2: --key <key> — diff by key
    if (flags.key) {
      const res = await api.listKnowledgeEntries({ key: flags.key });

      if (!isOk(res)) {
        out.error(`Failed to fetch entry: ${getError(res)}`);
        process.exit(1);
      }

      let entries = getData(res);
      entries = Array.isArray(entries) ? entries : [];

      // Client-side filter by key
      const matching = entries.filter(e => e.key === flags.key);

      if (matching.length === 0) {
        out.error(`No entry found with key "${flags.key}".`);
        process.exit(1);
      }

      if (flags.json) {
        out.jsonCompact({ entries: matching });
        return;
      }

      for (const entry of matching) {
        showEntryDiff(entry);
      }
      return;
    }

    // Mode 3: Specific entry ID
    const id = args[0];
    if (!id) {
      out.error('Entry ID or --pending / --key required.');
      console.log('');
      console.log(`  ${out.style.bold('Usage:')}`);
      console.log(`  beeboo diff <entry-id>     Show changes for specific entry`);
      console.log(`  beeboo diff --pending      Show all pending commits`);
      console.log(`  beeboo diff --key <key>    Show changes for a key`);
      process.exit(1);
    }

    const res = await api.getKnowledgeEntry(id);

    if (!isOk(res)) {
      if (res.status === 404) {
        out.error(`Entry not found: ${id}`);
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

    showEntryDiff(entry);
  } catch (err) {
    out.error(`Diff failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { handleDiff };
