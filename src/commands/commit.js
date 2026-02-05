'use strict';

/**
 * commit.js — Stage knowledge for review (like git commit + PR).
 *
 * Usage:
 *   beeboo commit "Refund policy is 30 days" --key "refund-policy" --tags "policy,customer-service"
 *   beeboo commit --title "Refund Policy" --content "Refund policy is 30 days" --key refund-policy
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

async function handleCommit(args, flags) {
  requireAuth();

  // Parse the commit message (first positional arg or --title/--content flags)
  const message = args.join(' ');
  const title = flags.title || (flags.key ? flags.key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null) || message.slice(0, 80);
  const content = flags.content || message;

  if (!content) {
    out.error('Commit message is required.');
    console.log('');
    console.log(`  ${out.style.bold('Usage:')}`);
    console.log(`  beeboo commit "Your knowledge content here" --key "unique-key"`);
    console.log(`  beeboo commit --title "Title" --content "Content" --key "key"`);
    console.log('');
    console.log(`  ${out.style.bold('Options:')}`);
    console.log(`  --key <key>         Unique key for this entry`);
    console.log(`  --title <title>     Entry title (defaults to key or message)`);
    console.log(`  --content <text>    Entry content (defaults to commit message)`);
    console.log(`  --tags <t1,t2>      Comma-separated tags`);
    console.log(`  --namespace <ns>    Namespace (default: "default")`);
    process.exit(1);
  }

  try {
    // Build the knowledge entry (status: draft — pending review)
    const entry = {
      title: title,
      content: content,
      content_type: flags.type || 'text',
      namespace: flags.namespace || 'default',
      status: 'draft',
    };

    if (flags.key) {
      entry.key = flags.key;
    } else {
      // Auto-generate key from title
      entry.key = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
    }

    if (flags.tags) {
      entry.tags = flags.tags.split(',').map(t => t.trim());
    }

    // Create the knowledge entry
    const res = await api.createKnowledgeEntry(entry);

    if (!isOk(res)) {
      out.error(`Commit failed: ${getError(res)}`);
      process.exit(1);
    }

    const data = getData(res);
    const entryId = data?.id || 'unknown';

    // Submit an approval request linked to this entry
    const approvalData = {
      title: `Knowledge commit: ${title}`,
      description: `New knowledge entry committed.\n\nKey: ${entry.key}\nContent: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`,
      category: 'knowledge',
      urgency: 'normal',
      metadata: {
        knowledge_entry_id: entryId,
        action: 'commit',
      },
    };

    const approvalRes = await api.submitApproval(approvalData);
    const approvalOk = isOk(approvalRes);
    const approvalId = approvalOk ? (getData(approvalRes)?.id || null) : null;

    if (flags.json) {
      out.jsonCompact({
        entry_id: entryId,
        approval_id: approvalId,
        key: entry.key,
        status: 'pending',
      });
      return;
    }

    // Git-style output
    console.log('');
    console.log(`📝 ${out.style.bold('Committed to knowledge base')} ${out.style.yellow('(pending approval)')}`);
    console.log('');
    console.log(`  ${out.style.dim('entry:')}    ${out.style.cyan(entryId)}`);
    if (approvalId) {
      console.log(`  ${out.style.dim('approval:')} ${out.style.cyan(approvalId)}`);
    }
    console.log(`  ${out.style.dim('key:')}      ${entry.key}`);
    if (entry.tags?.length) {
      console.log(`  ${out.style.dim('tags:')}     ${entry.tags.join(', ')}`);
    }
    console.log('');

    // Show commit-style diff
    const lines = content.split('\n');
    for (const line of lines.slice(0, 10)) {
      console.log(`  ${out.style.green('+ ' + line)}`);
    }
    if (lines.length > 10) {
      console.log(`  ${out.style.dim(`... and ${lines.length - 10} more lines`)}`);
    }
    console.log('');

    if (approvalId) {
      console.log(`  ${out.style.dim('Track:')} beeboo approvals get ${approvalId}`);
    }
  } catch (err) {
    out.error(`Commit failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { handleCommit };
