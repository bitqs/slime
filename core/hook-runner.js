'use strict';
/** @typedef {import('./types').HookPayload} HookPayload */
/** @typedef {(payload: HookPayload) => void} HookHandler */

const state = require('./state');

/**
 * Shared fail-soft shell for Claude Code hooks.
 * Hooks are observers: malformed stdin or handler bugs must never block the
 * real session. Keep all business logic in the handler; keep the invariant here.
 *
 * @param {HookHandler} handler
 * @param {HookPayload | null} [payload]
 * @returns {boolean} true when a payload reached the handler
 */
function withHookPayload(handler, payload) {
  try {
    if (payload === undefined) {
      payload = /** @type {HookPayload | null} */ (state.readStdin());
    }
    if (!payload) return false;
    handler(payload);
    return true;
  } catch {
    return false;
  }
}

/** @param {HookHandler} handler */
function runHook(handler) {
  withHookPayload(handler);
  process.exit(0);
}

module.exports = { runHook, withHookPayload };
