// Central shared type definitions for Questline scripts.

export interface BossState {
  name: string;
  hp: number;
  turns?: number;
  created?: number;
  named?: boolean;
}

export interface Snapshot {
  sessionId: string;
  turn: number;
  combo: number;
  kills: number;
  dmg: number;
  summons: number;
  casts?: number;
  inTurn?: boolean;
  lastText?: string;
  updated?: number;
  boss?: { name: string; hp: number };
  gear?: string[];
}

export interface RateWindow {
  used: number;
  resetsAt: number;
}

export interface UsageCache {
  fiveHour: RateWindow | null;
  sevenDay: RateWindow | null;
  contextPct: number | null;
  source: string | null;
  cost?: number | null;
  model?: string | null;
  lines?: { added: number; removed: number } | null;
  durationMs?: number | null;
  t: number;
}

export interface Milestone {
  boss: string;
  date: string;
  turns: number;
  project: string;
}

export interface Profile {
  milestones: Milestone[];
  totals: { turns: number; dmg: number; kills: number };
  gear: Record<string, unknown>;
  langStats?: Record<string, number>;
  gearUse?: Record<string, number>;
}

/** Locale catalog: string keys → string values (loaded from JSON). */
export type LocaleCatalog = Record<string, unknown>;

export interface QLEvent {
  t: number;
  kind: string;
  text?: string;
  dmg?: number;
  combo?: number;
  kill?: boolean;
  hit?: boolean;
  tool?: string;
  boss?: string;
  bossName?: string;
  est?: number;
  questions?: unknown[];
  chosen?: string[];
  plan?: string;
}

/** Shape of JSON piped from the Claude Code statusline to our scripts. */
export interface StatuslineStdin {
  session_id?: string;
  rate_limits?: {
    five_hour?: { used_percentage: number; resets_at: number };
    seven_day?: { used_percentage: number; resets_at: number };
  };
  cost?: {
    total_cost_usd?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
    total_duration_ms?: number;
  };
  context_window?: { used_percentage: number };
  model?: { display_name: string };
}

/** Todo item shape used by TodoWrite tool. */
export interface TodoItem {
  status: string;
  [key: string]: unknown;
}
