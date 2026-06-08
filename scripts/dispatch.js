#!/usr/bin/env node
/** @typedef {import('../core/types').HookContext} HookContext */
/** @typedef {import('../core/types').HookPayload} HookPayload */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** @type {Record<HookContext['event'], string>} */
const SCRIPT_BY_EVENT = {
  session_start: 'hook-sessionstart.js',
  prompt: 'hook-prompt.js',
  pre_tool: 'hook-pretool.js',
  post_tool: 'hook-posttool.js',
  stop: 'hook-stop.js',
  subagent_stop: 'hook-subagentstop.js',
  pre_compact: 'hook-precompact.js',
};

/** @param {string} name @returns {string | null} */
function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] || null : null;
}

/** @returns {unknown} */
function readRaw() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); }
  catch { return null; }
}

/**
 * @param {HookContext} ctx
 * @returns {HookPayload}
 */
function toLegacyPayload(ctx) {
  return {
    session_id: ctx.sessionId,
    cwd: ctx.cwd,
    prompt: ctx.prompt,
    source: ctx.source,
    tool_name: ctx.tool,
    tool_input: /** @type {HookPayload['tool_input']} */ (ctx.toolInput),
    tool_response: /** @type {HookPayload['tool_response']} */ (ctx.toolResponse),
  };
}

try {
  const harness = arg('--harness') || process.env.SLIME_HARNESS || 'claude-code';
  const event = arg('--event');
  if (!event) process.exit(0);

  /** @type {{ parseHookEvent(raw: unknown, event: string): HookContext | null }} */
  const adapter = require(path.join('..', 'adapters', harness, 'adapter.js'));
  const ctx = adapter.parseHookEvent(readRaw(), event);
  if (!ctx) process.exit(0);

  const script = SCRIPT_BY_EVENT[ctx.event];
  if (!script) process.exit(0);

  const child = spawnSync(process.execPath, [path.join(__dirname, script)], {
    input: JSON.stringify(toLegacyPayload(ctx)),
    env: { ...process.env, SLIME_HARNESS: harness },
    encoding: 'utf8',
  });
  if (child.stdout) process.stdout.write(child.stdout);
} catch {}
process.exit(0);
