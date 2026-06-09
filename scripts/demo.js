#!/usr/bin/env node
'use strict';
/* One-command local arena demo.
   Starts the fake event feed and the read-only arena server against the same
   throwaway SLIME_ROOT, then tears both down together on Ctrl-C. */

const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const ROOT = process.env.SLIME_ROOT || path.join(os.tmpdir(), 'slime-demo');
const PORT = process.env.SLIME_PORT || '4118';
const ENV = { ...process.env, SLIME_ROOT: ROOT, SLIME_PORT: PORT };

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

/**
 * @param {string} label
 * @param {string} script
 */
function start(label, script) {
  const child = spawn(process.execPath, [path.join(__dirname, script)], {
    env: ENV,
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code === 0 || signal) return;
    console.error(`${label} exited with ${code}`);
    shutdown(code || 1);
  });
  children.push(child);
  return child;
}

/** @param {number} [code] */
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 150).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`Slime demo root: ${ROOT}`);
console.log(`Slime demo arena: http://127.0.0.1:${PORT}`);
console.log('Press Ctrl-C to stop.');

start('demo feed', 'demo-feed.js');
start('arena server', 'serve.js');
