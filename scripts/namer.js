#!/usr/bin/env node
// Detached boss namer. Hooks can't wait (2s cap) — this runs async and
// rewrites the boss file when the name arrives. Template name stays if we fail.
// No shell: argv-array exec only (SLIME_NAMER_CMD must be a JSON argv array).
const { execFileSync } = require('node:child_process');
const boss = require('./lib/boss');
const locale = require('./lib/locale');

const cwd = process.argv[2];
const prompt = process.argv[3] || '';
try {
  if (!cwd) process.exit(0);
  let argv;
  if (process.env.SLIME_NAMER_CMD) {
    argv = JSON.parse(process.env.SLIME_NAMER_CMD); // e.g. ["node","-e","console.log('X')"]
  } else {
    const lang = locale.current();
    const namerPrompt = lang === 'zh'
      ? `为这个编程任务起一个简短霸气的中文 RPG Boss 名(4-10字):"${prompt.slice(0, 200)}". 只回名字。`
      : `Invent a short menacing RPG boss name (3-5 words, definite article) for this coding task: "${prompt.slice(0, 200)}". Reply with the name only.`;
    argv = ['claude', '-p', namerPrompt, '--model', 'haiku', '--max-turns', '1'];
  }
  const name = (execFileSync(argv[0], argv.slice(1), { timeout: 30000 })
    .toString().trim().split('\n').pop() || '').trim();
  if (name && name.length >= 4 && name.length <= 60) {
    const b = boss.loadOrCreate(cwd, prompt);
    b.name = name;
    boss.save(cwd, b);
  }
} catch {}
process.exit(0);
