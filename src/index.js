'use strict';

/**
 * index.js — CLI router. Parses args and routes to the right handler.
 *
 * Commands:
 *   auth [status|logout]              Authenticate
 *   run "<instruction>"               Natural language command
 *   knowledge <sub>                   Knowledge management
 *   approvals <sub>                   Approval workflows
 *   requests <sub>                    Request management
 *   config <sub>                      Config management
 *   status                            API health check
 *   version | --version | -v          Show version
 *   help | --help | -h                Show help
 */

const { version } = require('../package.json');
const out = require('./output');

/**
 * Parse CLI arguments into { command, args, flags }.
 * Supports: --flag value, --flag=value, --bool-flag, -v, -h
 */
function parseArgs(argv) {
  const raw = argv.slice(2);
  const args = [];
  const flags = {};

  let i = 0;
  while (i < raw.length) {
    const arg = raw[i];

    if (arg === '--') {
      // Everything after -- is positional
      args.push(...raw.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        // --flag=value
        const key = arg.slice(2, eqIdx);
        flags[key] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        // Check if next arg is a value (not a flag)
        if (i + 1 < raw.length && !raw[i + 1].startsWith('-')) {
          flags[key] = raw[i + 1];
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short flags
      const key = arg[1];
      if (key === 'v') flags.version = true;
      else if (key === 'h') flags.help = true;
      else if (key === 'j') flags.json = true;
      else {
        if (i + 1 < raw.length && !raw[i + 1].startsWith('-')) {
          flags[key] = raw[i + 1];
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      args.push(arg);
    }
    i++;
  }

  const command = args.shift() || '';
  return { command, args, flags };
}

function showHelp() {
  console.log(`
${out.BRAND} ${out.style.dim(`v${version}`)}
${out.style.dim('Be the CEO of your agent organization.')}

${out.style.bold('Usage:')}
  npx beeboo <command> [options]

${out.style.bold('Commands:')}
  ${out.style.amber('auth')}                              Authenticate with your API key
  ${out.style.amber('auth status')}                       Check authentication status
  ${out.style.amber('auth logout')}                       Remove saved credentials

  ${out.style.amber('run')} ${out.style.dim('"instruction"')}                  Run a natural language command
                                    ${out.style.dim('Examples:')}
                                    ${out.style.dim('"store our refund policy: ..."')}
                                    ${out.style.dim('"what\'s our escalation protocol?"')}
                                    ${out.style.dim('"request approval for $5000 payment"')}
                                    ${out.style.dim('"show pending approvals"')}

  ${out.style.amber('knowledge')} list|add|search|get|delete
  ${out.style.amber('approvals')} list|request|approve|deny|get
  ${out.style.amber('requests')}  list|create|get|complete
  ${out.style.amber('config')}    list|set|get|delete
  ${out.style.amber('status')}                            Check API health
  ${out.style.amber('version')}                           Show version

${out.style.bold('Flags:')}
  --json                            Output as JSON
  --api-key <key>                   API key (for auth)
  --help, -h                        Show help
  --version, -v                     Show version

${out.style.bold('Environment:')}
  BEEBOO_API_KEY                    API key (overrides saved)
  BEEBOO_API_URL                    Custom API URL
  NO_COLOR                          Disable colored output

${out.style.dim('Docs: https://docs.beeboo.ai | Support: https://discord.gg/beeboo')}
`);
}

function showVersion() {
  console.log(`beeboo v${version}`);
}

async function main() {
  const { command, args, flags } = parseArgs(process.argv);

  // Global flags
  if (flags.version || flags.v) {
    showVersion();
    return;
  }

  if (flags.help || flags.h) {
    showHelp();
    return;
  }

  try {
    switch (command.toLowerCase()) {
      case '':
      case 'help':
        showHelp();
        break;

      case 'version':
        showVersion();
        break;

      case 'auth':
      case 'login': {
        const { handleAuth } = require('./auth');
        await handleAuth(args, flags);
        break;
      }

      case 'run':
      case 'do':
      case 'exec': {
        const { handleRun } = require('./run');
        await handleRun(args, flags);
        break;
      }

      case 'knowledge':
      case 'kb':
      case 'k': {
        const { handleKnowledge } = require('./knowledge');
        await handleKnowledge(args, flags);
        break;
      }

      case 'approvals':
      case 'approval':
      case 'a': {
        const { handleApprovals } = require('./approvals');
        await handleApprovals(args, flags);
        break;
      }

      case 'requests':
      case 'request':
      case 'req':
      case 'r': {
        const { handleRequests } = require('./requests');
        await handleRequests(args, flags);
        break;
      }

      case 'config':
      case 'cfg': {
        const { handleConfig } = require('./config');
        await handleConfig(args, flags);
        break;
      }

      case 'status':
      case 'health':
      case 'ping': {
        const { api, isOk, getData } = require('./api');
        const credentials = require('./credentials');

        try {
          const res = await api.health();
          if (flags.json) {
            out.jsonCompact({
              healthy: isOk(res),
              status: res.status,
              url: credentials.getApiUrl(),
              authenticated: credentials.isAuthenticated(),
            });
            return;
          }
          if (isOk(res)) {
            out.success('BeeBoo API is healthy');
            console.log(`  URL: ${out.style.dim(credentials.getApiUrl())}`);
            console.log(`  Auth: ${credentials.isAuthenticated() ? out.style.green('yes') : out.style.red('no')}`);
          } else {
            out.error(`API returned ${res.status}`);
          }
        } catch (err) {
          if (flags.json) {
            out.jsonCompact({ healthy: false, error: err.message });
            return;
          }
          out.error(`Cannot reach API: ${err.message}`);
          console.log(`  Check your connection.`);
          process.exit(1);
        }
        break;
      }

      case 'whoami': {
        const { api, isOk, getData, getError } = require('./api');
        const credentials = require('./credentials');

        if (!credentials.isAuthenticated()) {
          out.error('Not authenticated. Run: npx beeboo auth');
          process.exit(1);
        }

        try {
          const res = await api.whoami();
          if (!isOk(res)) {
            out.error(`Auth failed: ${getError(res)}`);
            process.exit(1);
          }
          const data = getData(res);
          if (flags.json) {
            out.jsonCompact(data);
          } else {
            out.json(data);
          }
        } catch (err) {
          out.error(`Network error: ${err.message}`);
          process.exit(1);
        }
        break;
      }

      default:
        out.error(`Unknown command: ${command}`);
        console.log(`  Run ${out.style.cyan('npx beeboo help')} for available commands.`);
        process.exit(1);
    }
  } catch (err) {
    out.error(`Unexpected error: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
