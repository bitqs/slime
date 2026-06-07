#!/usr/bin/env node
// Detached boss namer. Hooks can't wait (2s cap) — this runs async and
// rewrites the boss file when the name arrives. Template name stays if we fail.
const { execSync } = require('node:child_process');
const boss = require('./lib/boss');

const cwd = process.argv[2];
const prompt = process.argv[3] || '';
try {
  if (!cwd) process.exit(0);
  const cmd = process.env.QL_NAMER_CMD ||
    `claude -p ${JSON.stringify(
      `Invent a short menacing RPG boss name (3-5 words, definite article) for this coding task: "${prompt.slice(0, 200)}". Reply with the name only.`
    )} --model haiku --max-turns 1`;
  const name = execSync(cmd, { timeout: 30000 }).toString().trim().split('\n').pop().trim();
  if (name && name.length >= 4 && name.length <= 60) {
    const b = boss.loadOrCreate(cwd, prompt);
    b.name = name;
    boss.save(cwd, b);
  }
} catch {}
process.exit(0);
