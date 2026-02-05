'use strict';

/**
 * push.js — Direct publish knowledge (like git push / merge to main).
 * Bypasses the approval queue — for admins.
 *
 * Usage:
 *   beeboo push "Updated policy" --key refund-policy
 *   beeboo push --title "Refund Policy" --content "30 days" --key refund-policy
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

async function handlePush(args, flags) {
  requireAuth();

  // Parse the commit message (first positional arg or --title/--content flags)
  const message = args.join(' ');
  const title = flags.title || (flags.key ? flags.key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null) || message.slice(0, 80);
  const content = flags.content || message;

  if (!content) {
    out.error('Push message is required.');
    console.log('');
    console.log(`  ${out.style.bold('Usage:')}`);
    console.log(`  beeboo push "Your knowledge content here" --key "unique-key"`);
    console.log(`  beeboo push --title "Title" --content "Content" --key "key"`);
    console.log('');
    console.log(`  ${out.style.bold('Options:')}`);
    console.log(`  --key <key>         Unique key for this entry`);
    console.log(`  --title <title>     Entry title`);
    console.log(`  --content <text>    Entry content`);
    console.log(`  --tags <t1,t2>      Comma-separated tags`);
    console.log(`  --namespace <ns>    Namespace (default: "default")`);
    console.log('');
    console.log(`  ${out.style.dim('Push publishes directly — no approval needed.')}`);
    console.log(`  ${out.style.dim('Use "beeboo commit" to stage for review instead.')}`);
    process.exit(1);
  }

  try {
    // Check if entry with this key already exists — update instead of create
    let existingId = null;
    if (flags.key) {
      const listRes = await api.listKnowledgeEntries({});
      if (isOk(listRes)) {
        const all = getData(listRes);
        const items = Array.isArray(all) ? all : [];
        const existing = items.find(e => e.key === flags.key);
        if (existing) {
          existingId = existing.id;
        }
      }
    }

    let res;
    if (existingId) {
      // Update existing entry
      const updates = {
        title: title,
        content: content,
        status: 'published',
      };
      if (flags.tags) {
        updates.tags = flags.tags.split(',').map(t => t.trim());
      }
      if (flags.namespace) {
        updates.namespace = flags.namespace;
      }

      res = await api.updateKnowledgeEntry(existingId, updates);
    } else {
      // Create new entry (published immediately)
      const entry = {
        title: title,
        content: content,
        content_type: flags.type || 'text',
        namespace: flags.namespace || 'default',
        status: 'published',
      };

      if (flags.key) {
        entry.key = flags.key;
      } else {
        entry.key = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
      }

      if (flags.tags) {
        entry.tags = flags.tags.split(',').map(t => t.trim());
      }

      res = await api.createKnowledgeEntry(entry);
    }

    if (!isOk(res)) {
      out.error(`Push failed: ${getError(res)}`);
      process.exit(1);
    }

    const data = getData(res);
    const entryId = data?.id || existingId || 'unknown';
    const action = existingId ? 'updated' : 'created';

    if (flags.json) {
      out.jsonCompact({
        entry_id: entryId,
        key: flags.key || data?.key,
        status: 'published',
        action: action,
      });
      return;
    }

    // Git push-style output
    console.log('');
    if (existingId) {
      console.log(`🚀 ${out.style.bold('Pushed update to knowledge base')} ${out.style.green('(published)')}`);
    } else {
      console.log(`🚀 ${out.style.bold('Pushed to knowledge base')} ${out.style.green('(published)')}`);
    }
    console.log('');
    console.log(`  ${out.style.dim('entry:')} ${out.style.cyan(entryId)}`);
    console.log(`  ${out.style.dim('key:')}   ${flags.key || data?.key || '—'}`);
    console.log(`  ${out.style.dim('action:')} ${action === 'updated' ? out.style.yellow(action) : out.style.green(action)}`);
    console.log('');

    // Show what was pushed
    const lines = content.split('\n');
    for (const line of lines.slice(0, 5)) {
      console.log(`  ${out.style.green('+ ' + line)}`);
    }
    if (lines.length > 5) {
      console.log(`  ${out.style.dim(`... and ${lines.length - 5} more lines`)}`);
    }
    console.log('');
    console.log(`  ${out.style.dim('No approval needed — direct publish. ✓')}`);
  } catch (err) {
    out.error(`Push failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { handlePush };
