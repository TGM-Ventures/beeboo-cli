'use strict';

/**
 * auth.js — Authentication commands: auth, auth status, auth logout
 */

const readline = require('readline');
const credentials = require('./credentials');
const { api, isOk, getData, getError } = require('./api');
const out = require('./output');

/**
 * Prompt for input (hides input for secrets)
 */
function prompt(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (hidden && process.stdin.isTTY) {
      // For hidden input, use raw mode
      process.stdout.write(question);
      let input = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (ch) => {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (ch === '\u0003') {
          // Ctrl+C
          process.stdout.write('\n');
          process.exit(0);
        } else if (ch === '\u007f' || ch === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += ch;
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

async function handleAuth(args, flags) {
  const sub = args[0];

  if (sub === 'status') {
    return await authStatus(flags);
  }

  if (sub === 'logout') {
    return authLogout();
  }

  // Default: authenticate
  return await authenticate(args, flags);
}

async function authenticate(args, flags) {
  out.brand('Authentication');
  console.log('');

  let apiKey = flags['api-key'] || flags.key;

  if (!apiKey) {
    // Interactive mode
    if (!process.stdin.isTTY) {
      out.error('No API key provided. Use: beeboo auth --api-key <key>');
      process.exit(1);
    }
    apiKey = await prompt('  Enter your API key: ', true);
  }

  if (!apiKey) {
    out.error('No API key provided.');
    process.exit(1);
  }

  // Validate the API key
  process.stdout.write(out.style.dim('  Verifying... '));

  try {
    const res = await api.whoami({ apiKey });

    if (isOk(res)) {
      const data = getData(res);
      console.log(out.style.green('OK'));
      console.log('');

      const orgName = data?.org_name || data?.org?.name || 'Your Organization';
      const email = data?.email || data?.user?.email || '';

      credentials.save({
        api_key: apiKey,
        api_url: credentials.getApiUrl(),
        org_name: orgName,
        email: email,
        authenticated_at: new Date().toISOString(),
      });

      out.success(`Authenticated successfully!`);
      if (orgName) console.log(`  Org: ${out.style.amber(orgName)}`);
      if (email) console.log(`  User: ${email}`);
      console.log('');
      console.log(`  Credentials saved to ${out.style.dim(credentials.getPath())}`);
    } else {
      console.log(out.style.red('FAILED'));
      console.log('');

      if (res.status === 401 || res.status === 403) {
        out.error('API key invalid or expired.');
        console.log(`  Get a new key at ${out.style.cyan('https://beeboo.ai/dashboard')}`);
      } else {
        out.error(`Authentication failed: ${getError(res)}`);
      }
      process.exit(1);
    }
  } catch (err) {
    console.log(out.style.red('ERROR'));
    console.log('');
    out.error(`Could not reach the API: ${err.message}`);
    console.log(`  Check your connection or API status: ${out.style.cyan('npx beeboo status')}`);
    process.exit(1);
  }
}

async function authStatus(flags) {
  const apiKey = credentials.getApiKey();

  if (!apiKey) {
    if (flags.json) {
      out.jsonCompact({ authenticated: false });
      return;
    }
    out.error('Not authenticated. Run: npx beeboo auth');
    process.exit(1);
  }

  try {
    const res = await api.whoami();

    if (isOk(res)) {
      const data = getData(res);
      if (flags.json) {
        out.jsonCompact({ authenticated: true, ...data });
        return;
      }
      out.success('Authenticated');
      const creds = credentials.load();
      if (creds?.org_name) console.log(`  Org: ${out.style.amber(creds.org_name)}`);
      if (creds?.email) console.log(`  User: ${creds.email}`);
      console.log(`  API: ${out.style.dim(credentials.getApiUrl())}`);
      console.log(`  Key: ${out.style.dim(apiKey.slice(0, 10) + '...')}`);
    } else {
      if (flags.json) {
        out.jsonCompact({ authenticated: false, error: getError(res) });
        return;
      }
      out.error(`API key invalid: ${getError(res)}`);
      console.log(`  Run ${out.style.cyan('npx beeboo auth')} to re-authenticate.`);
      process.exit(1);
    }
  } catch (err) {
    if (flags.json) {
      out.jsonCompact({ authenticated: false, error: err.message });
      return;
    }
    out.warn(`Could not verify (offline?). Key is saved.`);
    const creds = credentials.load();
    if (creds?.org_name) console.log(`  Org: ${out.style.amber(creds.org_name)}`);
    console.log(`  Key: ${out.style.dim(apiKey.slice(0, 10) + '...')}`);
  }
}

function authLogout() {
  const removed = credentials.remove();
  if (removed) {
    out.success('Logged out. Credentials removed.');
  } else {
    out.info('Already logged out (no credentials found).');
  }
}

module.exports = { handleAuth };
