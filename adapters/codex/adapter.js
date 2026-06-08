/** @typedef {import('../../core/types').HookContext} HookContext */
/** @typedef {import('../../core/types').StatuslineCtx} StatuslineCtx */
/** @typedef {import('../../core/types').HarnessAdapter} HarnessAdapter */

const os = require('node:os');
const path = require('node:path');

const EVENTS = [
  'session_start',
  'prompt',
  'pre_tool',
  'post_tool',
  'stop',
  'subagent_stop',
  'pre_compact',
];

/** @type {Record<string, HookContext['event']>} */
const EVENT_ALIASES = {
  SessionStart: 'session_start',
  UserPromptSubmit: 'prompt',
  PreToolUse: 'pre_tool',
  PostToolUse: 'post_tool',
  Stop: 'stop',
  SubagentStop: 'subagent_stop',
  PreCompact: 'pre_compact',
  session_start: 'session_start',
  prompt: 'prompt',
  pre_tool: 'pre_tool',
  post_tool: 'post_tool',
  stop: 'stop',
  subagent_stop: 'subagent_stop',
  pre_compact: 'pre_compact',
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObj(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** @param {unknown} value @returns {string | undefined} */
function str(value) {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string[]} keys
 * @returns {unknown}
 */
function pick(raw, keys) {
  for (const key of keys) {
    if (raw[key] !== undefined) return raw[key];
  }
  return undefined;
}

/** @param {string} event @returns {HookContext['event'] | null} */
function normalizeEvent(event) {
  return EVENT_ALIASES[event] || null;
}

/** @returns {string} */
function codexHome() {
  return process.env.CODEX_CONFIG_DIR || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

/** @returns {string} */
function resolveStateRoot() {
  return process.env.SLIME_ROOT || path.join(codexHome(), 'slime');
}

/** @returns {string} */
function resolveConfigDir() {
  return codexHome();
}

/**
 * Normalize Codex hook payloads into the engine contract. The parser accepts the
 * Claude-compatible shape Codex plugin hooks currently use, plus camelCase
 * aliases so recorded fixtures from future Codex builds can be adopted without
 * touching core.
 *
 * @param {unknown} raw
 * @param {HookContext['event'] | string} event
 * @returns {HookContext | null}
 */
function parseHookEvent(raw, event) {
  const normalized = normalizeEvent(event);
  if (!normalized || !isObj(raw)) return null;

  const sessionId = str(pick(raw, ['session_id', 'sessionId', 'conversation_id', 'conversationId', 'thread_id', 'threadId']));
  if (!sessionId) return null;

  return {
    event: normalized,
    sessionId,
    cwd: str(pick(raw, ['cwd', 'workdir', 'workspace', 'workspaceRoot'])),
    prompt: str(pick(raw, ['prompt', 'user_prompt', 'userPrompt', 'input'])),
    tool: str(pick(raw, ['tool_name', 'toolName', 'tool', 'name'])),
    toolInput: pick(raw, ['tool_input', 'toolInput', 'input_args', 'inputArgs', 'arguments']),
    toolResponse: pick(raw, ['tool_response', 'toolResponse', 'result', 'response', 'output']),
    source: str(pick(raw, ['source', 'startup_source', 'startupSource'])),
  };
}

/**
 * @param {unknown} raw
 * @returns {StatuslineCtx}
 */
function parseStatusline(raw) {
  if (!isObj(raw)) return {};
  const rate = isObj(raw.rate_limits) ? raw.rate_limits : {};
  const five = isObj(rate.five_hour) ? rate.five_hour : isObj(rate.fiveHour) ? rate.fiveHour : null;
  const seven = isObj(rate.seven_day) ? rate.seven_day : isObj(rate.sevenDay) ? rate.sevenDay : null;
  const cost = isObj(raw.cost) ? raw.cost : {};
  const model = isObj(raw.model) ? raw.model : {};
  const context = isObj(raw.context_window) ? raw.context_window : isObj(raw.contextWindow) ? raw.contextWindow : {};

  /** @type {StatuslineCtx} */
  const out = {
    sessionId: str(pick(raw, ['session_id', 'sessionId', 'conversation_id', 'conversationId', 'thread_id', 'threadId'])),
    model: str(pick(model, ['display_name', 'displayName', 'name'])) || str(raw.model),
    contextPct: typeof context.used_percentage === 'number'
      ? context.used_percentage
      : typeof context.usedPercentage === 'number'
        ? context.usedPercentage
        : undefined,
    costUsd: typeof cost.total_cost_usd === 'number'
      ? cost.total_cost_usd
      : typeof cost.totalCostUsd === 'number'
        ? cost.totalCostUsd
        : undefined,
  };

  if (five || seven) {
    out.rateLimits = {};
    if (five) {
      out.rateLimits.fiveHour = {
        used: Number(five.used_percentage ?? five.usedPercentage ?? five.used ?? 0),
        resetsAt: Number(five.resets_at ?? five.resetsAt ?? 0),
      };
    }
    if (seven) {
      out.rateLimits.sevenDay = {
        used: Number(seven.used_percentage ?? seven.usedPercentage ?? seven.used ?? 0),
        resetsAt: Number(seven.resets_at ?? seven.resetsAt ?? 0),
      };
    }
  }

  return out;
}

/** @param {string} _prompt @returns {void} */
function spawnNamer(_prompt) {
  // Codex does not expose a stable non-interactive local naming CLI yet.
}

/** @type {HarnessAdapter['manifest']} */
const manifest = {
  harness: 'codex',
  events: /** @type {HookContext['event'][]} */ (EVENTS),
  statuslineCommand: '',
  commands: ['arena', 'battlelog', 'defeat', 'milestones', 'wrapped'],
  installTargets: ['.codex-plugin/plugin.json', 'hooks.json', 'commands/'],
};

module.exports = {
  resolveStateRoot,
  resolveConfigDir,
  parseHookEvent,
  parseStatusline,
  spawnNamer,
  manifest,
};
