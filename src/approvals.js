'use strict';

/**
 * approvals.js — Approval subcommands: list, request, approve, deny, get
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

async function handleApprovals(args, flags) {
  requireAuth();
  const sub = args[0] || 'list';

  switch (sub) {
    case 'list':
    case 'ls':
      return await listApprovals(flags);
    case 'request':
    case 'submit':
    case 'create':
      return await submitApproval(args.slice(1), flags);
    case 'approve':
      return await decideApproval(args[1], 'approved', flags);
    case 'deny':
    case 'reject':
      return await decideApproval(args[1], 'denied', flags);
    case 'get':
      return await getApproval(args[1], flags);
    default:
      out.error(`Unknown approvals command: ${sub}`);
      console.log('  Commands: list, request, approve, deny, get');
      process.exit(1);
  }
}

async function listApprovals(flags) {
  try {
    const query = {};
    if (flags.status) query.status = flags.status;

    const res = await api.listApprovals(query);

    if (!isOk(res)) {
      out.error(`Failed to list approvals: ${getError(res)}`);
      process.exit(1);
    }

    const approvals = getData(res);
    const items = Array.isArray(approvals) ? approvals : [];

    if (flags.json) {
      out.jsonCompact({ approvals: items });
      return;
    }

    const statusFilter = flags.status ? ` (${flags.status})` : '';
    out.brand(`Approvals${statusFilter}`);
    console.log('');

    if (items.length === 0) {
      out.info('No approvals found.');
      return;
    }

    out.table(items.map(a => ({
      id: a.id?.slice(0, 8) || '—',
      title: a.title || '(untitled)',
      status: a.status || 'pending',
      urgency: a.urgency || 'normal',
      created: a.created_at ? out.timeAgo(a.created_at) : '—',
    })), [
      { key: 'id', label: 'ID', color: 'dim' },
      { key: 'title', label: 'TITLE' },
      { key: 'status', label: 'STATUS' },
      { key: 'urgency', label: 'URGENCY' },
      { key: 'created', label: 'CREATED', color: 'gray' },
    ]);

    console.log(`\n  ${out.style.dim(`${items.length} approvals`)}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function submitApproval(args, flags) {
  const title = flags.title || args.join(' ');

  if (!title) {
    out.error('Title is required.');
    console.log('  Usage: npx beeboo approvals request --title "..." [--description "..."]');
    process.exit(1);
  }

  try {
    const data = {
      title: title,
      description: flags.description || flags.desc || '',
      category: flags.category || 'general',
      urgency: flags.urgency || 'normal',
    };

    if (flags.amount) {
      data.amount = parseFloat(flags.amount);
    }

    const res = await api.submitApproval(data);

    if (!isOk(res)) {
      out.error(`Failed to submit approval: ${getError(res)}`);
      process.exit(1);
    }

    const result = getData(res);

    if (flags.json) {
      out.jsonCompact(result);
      return;
    }

    out.success(`Approval requested: "${title}"`);
    console.log(`  Status: ${out.style.yellow('pending')}`);
    if (result?.id) console.log(`  ID: ${out.style.dim(result.id)}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function decideApproval(id, decision, flags) {
  if (!id) {
    out.error('Approval ID is required.');
    console.log(`  Usage: npx beeboo approvals ${decision === 'approved' ? 'approve' : 'deny'} <id>`);
    process.exit(1);
  }

  try {
    const note = flags.reason || flags.note || '';
    const res = await api.decideApproval(id, decision, note);

    if (!isOk(res)) {
      out.error(`Failed to ${decision === 'approved' ? 'approve' : 'deny'}: ${getError(res)}`);
      process.exit(1);
    }

    const result = getData(res);

    if (flags.json) {
      out.jsonCompact(result);
      return;
    }

    if (decision === 'approved') {
      out.success(`Approved: ${id}`);
    } else {
      out.success(`Denied: ${id}`);
    }
    if (note) console.log(`  Reason: ${note}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function getApproval(id, flags) {
  if (!id) {
    out.error('Approval ID is required.');
    console.log('  Usage: npx beeboo approvals get <id>');
    process.exit(1);
  }

  try {
    const res = await api.getApproval(id);

    if (!isOk(res)) {
      out.error(`Failed: ${getError(res)}`);
      process.exit(1);
    }

    const approval = getData(res);

    if (flags.json) {
      out.jsonCompact(approval);
      return;
    }

    const statusIcon = approval.status === 'approved' ? '✅' :
                        approval.status === 'denied' ? '❌' : '⏳';

    console.log(`\n${statusIcon} ${out.style.bold(approval.title || '(untitled)')}`);
    console.log(`  Status: ${approval.status || 'pending'}`);
    if (approval.category) console.log(`  Category: ${approval.category}`);
    if (approval.urgency) console.log(`  Urgency: ${approval.urgency}`);
    if (approval.amount) console.log(`  Amount: $${approval.amount}`);
    if (approval.description) {
      console.log(`\n  ${approval.description}`);
    }
    if (approval.decided_at) {
      console.log(`\n  Decided: ${out.timeAgo(approval.decided_at)}`);
    }
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { handleApprovals };
