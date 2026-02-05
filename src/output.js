'use strict';

/**
 * output.js — Pretty printing with ANSI colors, emoji, and --json support.
 * Respects NO_COLOR env var (https://no-color.org/).
 */

const useColor = !process.env.NO_COLOR && process.stdout.isTTY !== false;

const CODES = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function c(code, text) {
  if (!useColor) return text;
  return `${code}${text}${CODES.reset}`;
}

const style = {
  bold: (t) => c(CODES.bold, t),
  dim: (t) => c(CODES.dim, t),
  red: (t) => c(CODES.red, t),
  green: (t) => c(CODES.green, t),
  yellow: (t) => c(CODES.yellow, t),
  blue: (t) => c(CODES.blue, t),
  magenta: (t) => c(CODES.magenta, t),
  cyan: (t) => c(CODES.cyan, t),
  white: (t) => c(CODES.white, t),
  gray: (t) => c(CODES.gray, t),
  amber: (t) => c(CODES.yellow, t), // amber ≈ yellow in terminals
  error: (t) => c(CODES.red + CODES.bold, t),
  success: (t) => c(CODES.green + CODES.bold, t),
};

const BRAND = style.amber('🐝 BeeBoo');

function success(msg) {
  console.log(`${style.green('✓')} ${msg}`);
}

function error(msg) {
  console.error(`${style.red('✗')} ${msg}`);
}

function warn(msg) {
  console.log(`${style.yellow('⚠')} ${msg}`);
}

function info(msg) {
  console.log(`${style.cyan('ℹ')} ${msg}`);
}

function heading(text) {
  console.log(`\n${style.bold(text)}`);
}

function brand(subtitle) {
  if (subtitle) {
    console.log(`${BRAND} ${style.dim(subtitle)}`);
  } else {
    console.log(BRAND);
  }
}

function json(data) {
  console.log(JSON.stringify(data, null, 2));
}

function jsonCompact(data) {
  console.log(JSON.stringify(data));
}

function table(rows, columns) {
  if (!rows || rows.length === 0) {
    console.log(style.dim('  (no items)'));
    return;
  }

  // Calculate column widths
  const widths = {};
  for (const col of columns) {
    widths[col.key] = col.label.length;
  }
  for (const row of rows) {
    for (const col of columns) {
      const val = String(row[col.key] || '');
      widths[col.key] = Math.max(widths[col.key], val.length);
    }
  }

  // Header
  const header = columns.map(col => col.label.padEnd(widths[col.key])).join('  ');
  console.log(`  ${style.dim(header)}`);
  console.log(`  ${style.dim(columns.map(col => '─'.repeat(widths[col.key])).join('──'))}`);

  // Rows
  for (const row of rows) {
    const line = columns.map(col => {
      const val = String(row[col.key] || '');
      const padded = val.padEnd(widths[col.key]);
      if (col.color) return style[col.color](padded);
      return padded;
    }).join('  ');
    console.log(`  ${line}`);
  }
}

function list(items, { numbered = false, emoji = '' } = {}) {
  items.forEach((item, i) => {
    const prefix = numbered ? `${style.dim(`${i + 1}.`)}` : emoji || style.dim('•');
    console.log(`  ${prefix} ${item}`);
  });
}

function indent(text, spaces = 2) {
  const pad = ' '.repeat(spaces);
  console.log(text.split('\n').map(l => `${pad}${l}`).join('\n'));
}

function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

module.exports = {
  style,
  BRAND,
  success,
  error,
  warn,
  info,
  heading,
  brand,
  json,
  jsonCompact,
  table,
  list,
  indent,
  timeAgo,
  useColor,
};
