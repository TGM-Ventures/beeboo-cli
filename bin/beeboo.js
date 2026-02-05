#!/usr/bin/env node

'use strict';

// Minimum Node.js version check
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('BeeBoo requires Node.js 18 or later. Current: ' + process.version);
  process.exit(1);
}

// Route to CLI
require('../src/index.js');
