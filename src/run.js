'use strict';

/**
 * run.js — Natural language `run` command.
 *
 * Parses natural language input using keyword matching + regex intent detection.
 * No LLMs, no API calls for parsing — fast, offline-capable routing.
 *
 * Supported intents:
 *   - knowledge.create  → store/save/add/remember + content
 *   - knowledge.search  → what is/what's/how do/find/search/look up
 *   - knowledge.list    → list/show all knowledge/entries
 *   - approvals.request → request approval/approve/need approval
 *   - approvals.list    → show/list pending approvals
 *   - approvals.decide  → approve/deny + id
 *   - requests.create   → create request/need/schedule/request to
 *   - requests.list     → show/list requests
 *   - status            → status/health/check
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

/**
 * Intent detection — ordered by specificity (most specific first).
 * Each rule: { test: (input) => boolean, intent: string, extract: (input) => data }
 */
const INTENT_RULES = [
  // --- Approvals: decide ---
  {
    test: (s) => /^approve\s+\S+/i.test(s) && !/(request|for|need)/i.test(s),
    intent: 'approvals.decide',
    extract: (s) => {
      const match = s.match(/^approve\s+(\S+)/i);
      return { id: match?.[1], decision: 'approved' };
    },
  },
  {
    test: (s) => /^(deny|reject)\s+\S+/i.test(s),
    intent: 'approvals.decide',
    extract: (s) => {
      const match = s.match(/^(?:deny|reject)\s+(\S+)/i);
      return { id: match?.[1], decision: 'denied' };
    },
  },

  // --- Approvals: list ---
  {
    test: (s) => /\b(show|list|get|display|view)\b.*\b(pending\s+)?approvals?\b/i.test(s),
    intent: 'approvals.list',
    extract: (s) => {
      const pending = /pending/i.test(s);
      return { status: pending ? 'pending' : undefined };
    },
  },

  // --- Approvals: request ---
  {
    test: (s) => /\b(request|need|submit)\s+(an?\s+)?approval\b/i.test(s) ||
                 /\bapproval\s+(for|to|request)/i.test(s) ||
                 /\bapprove\s+(a|the|this|my)\b/i.test(s),
    intent: 'approvals.request',
    extract: (s) => {
      // Try to extract title and amount
      let title = s
        .replace(/\b(request|need|submit)\s+(an?\s+)?approval\s*(for|to)?\s*/i, '')
        .replace(/\bapproval\s*(for|to|request)\s*/i, '')
        .trim();

      const amountMatch = s.match(/\$[\d,]+(\.\d{2})?/);
      const amount = amountMatch ? parseFloat(amountMatch[0].replace(/[$,]/g, '')) : undefined;

      // Clean up title
      if (!title || title.length < 3) {
        title = s.replace(/^(request|need|submit)\s+(an?\s+)?approval\s*/i, '').trim();
      }

      return { title: title || 'Approval Request', description: s, amount };
    },
  },

  // --- Knowledge: create ---
  {
    test: (s) => /\b(store|save|add|remember|record|create\s+(a\s+)?knowledge|put|set)\b/i.test(s) &&
                 !/(request|approval)/i.test(s),
    intent: 'knowledge.create',
    extract: (s) => {
      // Pattern: "store <title>: <content>"
      const colonMatch = s.match(/\b(?:store|save|add|remember|record|put|set)\s+(?:(?:a|our|the|my|this)\s+)?(.+?):\s*(.+)/i);
      if (colonMatch) {
        return {
          title: colonMatch[1].trim(),
          content: colonMatch[2].trim(),
        };
      }

      // Pattern: "store that <content>" or "remember <content>"
      const simpleMatch = s.match(/\b(?:store|save|add|remember|record|put|set)\s+(?:that\s+|this\s+|our\s+|the\s+|a\s+)?(.+)/i);
      if (simpleMatch) {
        const text = simpleMatch[1].trim();
        // Use first few words as title
        const words = text.split(/\s+/);
        const title = words.slice(0, Math.min(5, words.length)).join(' ');
        return { title, content: text };
      }

      return { title: 'New Entry', content: s };
    },
  },

  // --- Knowledge: list ---
  {
    test: (s) => /\b(list|show|display|view)\s+(all\s+)?(knowledge|entries|docs)\b/i.test(s),
    intent: 'knowledge.list',
    extract: () => ({}),
  },

  // --- Knowledge: search ---
  {
    test: (s) => /\b(what('?s|\s+is|\s+are)|how\s+(do|to|does)|find|search|look\s*up|where|tell\s+me|explain|describe)\b/i.test(s) &&
                 !/(approval|request|pending)/i.test(s),
    intent: 'knowledge.search',
    extract: (s) => {
      // Strip question prefixes to get the actual query
      let query = s
        .replace(/\b(what('?s|\s+is|\s+are)|how\s+(do|to|does)|find|search(\s+for)?|look\s*up|where('?s|\s+is)|tell\s+me\s+(about)?|explain|describe)\s*/gi, '')
        .replace(/^(our|the|my|a|an)\s+/i, '')
        .replace(/\?+$/, '')
        .trim();

      if (!query || query.length < 2) {
        query = s.replace(/\?+$/, '').trim();
      }

      return { query };
    },
  },

  // --- Requests: list ---
  {
    test: (s) => /\b(show|list|display|view)\s+(all\s+)?(open\s+)?requests?\b/i.test(s),
    intent: 'requests.list',
    extract: (s) => {
      const pending = /\b(open|pending|active)\b/i.test(s);
      return { status: pending ? 'open' : undefined };
    },
  },

  // --- Requests: create ---
  {
    test: (s) => /\b(create|make|new|submit|open)\s+(a\s+)?request\b/i.test(s) ||
                 /\brequest\s+to\b/i.test(s) ||
                 (/\b(need|schedule|book|arrange)\b/i.test(s) && !/(approval)/i.test(s)),
    intent: 'requests.create',
    extract: (s) => {
      let title = s
        .replace(/\b(create|make|new|submit|open)\s+(a\s+)?request\s*(for|to)?\s*/i, '')
        .replace(/\brequest\s+to\s*/i, '')
        .replace(/\b(need\s+to|need\s+a|schedule|book|arrange)\s*/i, '')
        .trim();

      // Detect priority
      let priority = 'medium';
      if (/\b(urgent|asap|critical|emergency)\b/i.test(s)) priority = 'critical';
      else if (/\bhigh\s*(?:priority)?\b/i.test(s)) priority = 'high';
      else if (/\blow\s*(?:priority)?\b/i.test(s)) priority = 'low';

      // Clean priority from title
      title = title.replace(/\b(urgent|asap|critical|emergency|high\s*priority|low\s*priority)\b/gi, '').trim();

      if (!title || title.length < 3) {
        title = s.trim();
      }

      return { title, description: s, priority };
    },
  },

  // --- Status ---
  {
    test: (s) => /^(status|health|check|ping)\b/i.test(s),
    intent: 'status',
    extract: () => ({}),
  },
];

/**
 * Detect intent from natural language input.
 * Returns { intent, data } or null if no match.
 */
function detectIntent(input) {
  const s = input.trim();

  for (const rule of INTENT_RULES) {
    if (rule.test(s)) {
      return {
        intent: rule.intent,
        data: rule.extract(s),
      };
    }
  }

  // Fallback: try knowledge search for anything that looks like a question
  if (s.endsWith('?') || s.length < 80) {
    return {
      intent: 'knowledge.search',
      data: { query: s.replace(/\?+$/, '').trim() },
    };
  }

  return null;
}

/**
 * Execute the detected intent.
 */
async function executeIntent(intent, data, flags) {
  switch (intent) {
    case 'knowledge.create':
      return await doKnowledgeCreate(data, flags);
    case 'knowledge.search':
      return await doKnowledgeSearch(data, flags);
    case 'knowledge.list':
      return await doKnowledgeList(flags);
    case 'approvals.request':
      return await doApprovalRequest(data, flags);
    case 'approvals.list':
      return await doApprovalsList(data, flags);
    case 'approvals.decide':
      return await doApprovalsDecide(data, flags);
    case 'requests.create':
      return await doRequestCreate(data, flags);
    case 'requests.list':
      return await doRequestsList(data, flags);
    case 'status':
      return await doStatus(flags);
    default:
      out.error(`Could not understand: "${intent}"`);
      showRunHelp();
      process.exit(1);
  }
}

// --- Intent executors ---

async function doKnowledgeCreate(data, flags) {
  try {
    const entry = {
      title: data.title,
      content: data.content || '',
      namespace: 'default',
      content_type: 'text',
      key: data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    };

    const res = await api.createKnowledgeEntry(entry);

    if (!isOk(res)) {
      out.error(`Failed: ${getError(res)}`);
      process.exit(1);
    }

    const result = getData(res);

    if (flags.json) {
      out.jsonCompact({ action: 'knowledge.create', ...result });
      return;
    }

    out.success(`Knowledge entry created: "${data.title}"`);
    if (result?.id) console.log(`  ID: ${out.style.dim(result.id)}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function doKnowledgeSearch(data, flags) {
  try {
    const res = await api.searchKnowledge(data.query, { limit: 5 });

    if (!isOk(res)) {
      out.error(`Search failed: ${getError(res)}`);
      process.exit(1);
    }

    const results = getData(res);
    const items = Array.isArray(results) ? results : (results?.results || []);

    if (flags.json) {
      out.jsonCompact({ action: 'knowledge.search', query: data.query, results: items });
      return;
    }

    if (items.length === 0) {
      out.info(`No knowledge found for "${data.query}".`);
      console.log(`  Try: ${out.style.cyan(`npx beeboo run "store ${data.query}: <your content>"`)}`);
      return;
    }

    // If single result, show details
    if (items.length === 1) {
      const r = items[0];
      console.log(`📚 ${out.style.bold('Found:')} ${out.style.amber(r.title || r.key)}`);
      if (r.content) console.log(`  ${r.content}`);
      return;
    }

    console.log(`📚 ${out.style.bold(`${items.length} results`)} for "${data.query}":\n`);
    for (const r of items) {
      console.log(`  ${out.style.amber(r.title || r.key || '(untitled)')}`);
      if (r.content) {
        const preview = r.content.length > 100 ? r.content.slice(0, 100) + '...' : r.content;
        console.log(`  ${out.style.dim(preview)}`);
      }
      console.log('');
    }
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function doKnowledgeList(flags) {
  const { handleKnowledge } = require('./knowledge');
  return handleKnowledge(['list'], flags);
}

async function doApprovalRequest(data, flags) {
  try {
    const body = {
      title: data.title,
      description: data.description || '',
      category: 'general',
      urgency: 'normal',
    };

    if (data.amount) body.amount = data.amount;

    const res = await api.submitApproval(body);

    if (!isOk(res)) {
      out.error(`Failed: ${getError(res)}`);
      process.exit(1);
    }

    const result = getData(res);

    if (flags.json) {
      out.jsonCompact({ action: 'approvals.request', ...result });
      return;
    }

    out.success(`Approval requested: "${data.title}"`);
    console.log(`  Status: ${out.style.yellow('pending')}`);
    if (result?.id) console.log(`  ID: ${out.style.dim(result.id)}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function doApprovalsList(data, flags) {
  try {
    const query = {};
    if (data.status) query.status = data.status;

    const res = await api.listApprovals(query);

    if (!isOk(res)) {
      out.error(`Failed: ${getError(res)}`);
      process.exit(1);
    }

    const items = getData(res);
    const approvals = Array.isArray(items) ? items : [];

    if (flags.json) {
      out.jsonCompact({ action: 'approvals.list', approvals });
      return;
    }

    if (approvals.length === 0) {
      out.info('No approvals found.');
      return;
    }

    const label = data.status ? `${data.status} ` : '';
    console.log(`📋 ${approvals.length} ${label}approval${approvals.length === 1 ? '' : 's'}:`);
    approvals.forEach((a, i) => {
      const age = a.created_at ? ` (${out.timeAgo(a.created_at)})` : '';
      const status = a.status !== 'pending' ? ` [${a.status}]` : '';
      console.log(`  ${out.style.dim(`${i + 1}.`)} ${a.title || '(untitled)'}${status}${out.style.dim(age)}`);
    });
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function doApprovalsDecide(data, flags) {
  const { handleApprovals } = require('./approvals');
  const cmd = data.decision === 'approved' ? 'approve' : 'deny';
  return handleApprovals([cmd, data.id], flags);
}

async function doRequestCreate(data, flags) {
  try {
    const body = {
      title: data.title,
      description: data.description || '',
      priority: data.priority || 'medium',
    };

    const res = await api.createRequest(body);

    if (!isOk(res)) {
      out.error(`Failed: ${getError(res)}`);
      process.exit(1);
    }

    const result = getData(res);

    if (flags.json) {
      out.jsonCompact({ action: 'requests.create', ...result });
      return;
    }

    out.success(`Request created: "${data.title}"`);
    console.log(`  Priority: ${data.priority || 'medium'}`);
    if (result?.id) console.log(`  ID: ${out.style.dim(result.id)}`);
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function doRequestsList(data, flags) {
  try {
    const query = {};
    if (data.status) query.status = data.status;

    const res = await api.listRequests(query);

    if (!isOk(res)) {
      out.error(`Failed: ${getError(res)}`);
      process.exit(1);
    }

    const items = getData(res);
    const requests = Array.isArray(items) ? items : [];

    if (flags.json) {
      out.jsonCompact({ action: 'requests.list', requests });
      return;
    }

    if (requests.length === 0) {
      out.info('No requests found.');
      return;
    }

    console.log(`📋 ${requests.length} request${requests.length === 1 ? '' : 's'}:`);
    requests.forEach((r, i) => {
      const age = r.created_at ? ` (${out.timeAgo(r.created_at)})` : '';
      const prio = r.priority && r.priority !== 'medium' ? ` [${r.priority}]` : '';
      console.log(`  ${out.style.dim(`${i + 1}.`)} ${r.title || '(untitled)'}${prio}${out.style.dim(age)}`);
    });
  } catch (err) {
    out.error(`Network error: ${err.message}`);
    process.exit(1);
  }
}

async function doStatus(flags) {
  try {
    const res = await api.health();

    if (flags.json) {
      out.jsonCompact({ action: 'status', healthy: isOk(res), status: res.status });
      return;
    }

    if (isOk(res)) {
      out.success('BeeBoo API is healthy');
      console.log(`  URL: ${out.style.dim(credentials.getApiUrl())}`);
    } else {
      out.error(`API returned status ${res.status}`);
    }
  } catch (err) {
    out.error(`Cannot reach API: ${err.message}`);
    console.log(`  URL: ${out.style.dim(credentials.getApiUrl())}`);
    process.exit(1);
  }
}

function showRunHelp() {
  console.log(`
  ${out.style.amber('Usage:')} npx beeboo run "<natural language instruction>"

  ${out.style.bold('Examples:')}
    ${out.style.dim('# Knowledge')}
    npx beeboo run "store our refund policy: full refund within 30 days"
    npx beeboo run "what's our escalation protocol?"

    ${out.style.dim('# Approvals')}
    npx beeboo run "request approval for $5000 vendor payment"
    npx beeboo run "show me all pending approvals"

    ${out.style.dim('# Requests')}
    npx beeboo run "create a request to schedule HVAC inspection"
    npx beeboo run "show all open requests"

    ${out.style.dim('# Status')}
    npx beeboo run "status"
`);
}

async function handleRun(args, flags) {
  requireAuth();

  const input = args.join(' ').trim();

  if (!input) {
    out.error('Please provide an instruction.');
    showRunHelp();
    process.exit(1);
  }

  const detected = detectIntent(input);

  if (!detected) {
    out.error(`Could not understand: "${input}"`);
    showRunHelp();
    process.exit(1);
  }

  await executeIntent(detected.intent, detected.data, flags);
}

module.exports = { handleRun, detectIntent };
