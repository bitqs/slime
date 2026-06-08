#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const state = require('../core/state');
let id = process.argv[2];
try {
  if (!id) {
    // fall back to the most recently written report
    const dir = path.join(state.ROOT, 'reports');
    const newest = fs.readdirSync(dir)
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0];
    if (!newest) { console.log('No battle log yet.'); process.exit(0); }
    id = path.basename(newest.f, '.txt');
  }
  console.log(fs.readFileSync(state.reportPath(id), 'utf8'));
} catch { console.log('No battle log for this session yet.'); }
process.exit(0);
