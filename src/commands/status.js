'use strict';

/**
 * status.js — Show pending commits and recent activity (like git status).
 *
 * Usage:
 *   beeboo status
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

async function handleStatus(args, flags) {
  requireAuth();

  try {
    // Fetch all data in parallel
    const [kbRes, approvalsRes, pendingRes] = await Promise.all([
      api.listKnowledgeEntries({}),
      api.listApprovals({}),
      api.listApprovals({ status: 'pending' }),
    ]);

    // Knowledge entries
    let entries = [];
    if (isOk(kbRes)) {
      const data = getData(kbRes);
      entries = Array.isArray(data) ? data : [];
    }

    // All approvals
    let allApprovals = [];
    if (isOk(approvalsRes)) {
      const data = getData(approvalsRes);
      allApprovals = Array.isArray(data) ? data : [];
    }

    // Pending approvals
    let pendingApprovals = [];
    if (isOk(pendingRes)) {
      const data = getData(pendingRes);
      pendingApprovals = Array.isArray(data) ? data : [];
    }

    // Compute stats
    const totalEntries = entries.length;
    const draftEntries = entries.filter(e => e.status === 'draft');
    const publishedEntries = entries.filter(e => e.status === 'published');

    // Approvals decided today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const approvedToday = allApprovals.filter(a => {
      if (a.status !== 'approved') return false;
      const decidedAt = a.decided_at ? new Date(a.decided_at) : null;
      return decidedAt && decidedAt >= today;
    });

    // Knowledge commits today
    const commitsToday = entries.filter(e => {
      const created = new Date(e.created_at);
      return created >= today;
    });

    if (flags.json) {
      out.jsonCompact({
        pending_commits: draftEntries.length,
        pending_approvals: pendingApprovals.length,
        approved_today: approvedToday.length,
        commits_today: commitsToday.length,
        total_entries: totalEntries,
        published: publishedEntries.length,
        draft: draftEntries.length,
      });
      return;
    }

    // Git status-style output
    console.log('');
    console.log(`${out.BRAND} ${out.style.dim('status')}`);
    console.log('');

    // Branch info (namespace)
    console.log(`On namespace ${out.style.cyan('default')}`);
    console.log('');

    // Pending commits (staged)
    if (draftEntries.length > 0) {
      console.log(`📋 ${out.style.yellow(`${draftEntries.length} pending commit${draftEntries.length === 1 ? '' : 's'}`)} awaiting approval`);
      console.log('');
      console.log(`  ${out.style.dim('(use "beeboo diff --pending" to see changes)')}`);
      console.log(`  ${out.style.dim('(use "beeboo approvals list --status pending" to manage)')}`);
      console.log('');
      for (const entry of draftEntries.slice(0, 5)) {
        console.log(`  ${out.style.yellow('modified:')} ${entry.key || entry.title || entry.id}`);
      }
      if (draftEntries.length > 5) {
        console.log(`  ${out.style.dim(`... and ${draftEntries.length - 5} more`)}`);
      }
      console.log('');
    } else {
      console.log(`${out.style.green('✓')} No pending commits — working tree clean`);
      console.log('');
    }

    // Pending approvals
    if (pendingApprovals.length > 0) {
      console.log(`⏳ ${out.style.yellow(`${pendingApprovals.length} approval${pendingApprovals.length === 1 ? '' : 's'}`)} pending review`);
    }

    // Approved today
    if (approvedToday.length > 0) {
      console.log(`✅ ${out.style.green(`${approvedToday.length} commit${approvedToday.length === 1 ? '' : 's'}`)} approved today`);
    }

    // Commits today
    if (commitsToday.length > 0) {
      console.log(`📝 ${out.style.cyan(`${commitsToday.length} commit${commitsToday.length === 1 ? '' : 's'}`)} made today`);
    }

    // Total stats
    console.log(`📊 ${out.style.bold(String(totalEntries))} total knowledge entries (${publishedEntries.length} published, ${draftEntries.length} draft)`);
    console.log('');
  } catch (err) {
    out.error(`Status check failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { handleStatus };
