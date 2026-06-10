// Central shared type definitions for Slime scripts.

export interface BossState {
  name: string;
  hp: number;
  turns?: number;
  created?: number;
  named?: boolean;
  broken?: boolean;
  estLines?: number;
  dmgTaken?: number;
  // whole-fight totals, accumulated across turns/sessions so a multi-turn kill
  // earns XP for the full fight, not just the turn it ended on
  fightDmg?: number;
  fightKills?: number;
  fightMaxCombo?: number;
  // hashes of green test commands already paid this fight (anti-farm; capped 20)
  testKillSigs?: number[];
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
  boss?: { name: string; hp: number; broken?: boolean };
  est?: number;
  cwd?: string;
  todos?: Array<{ content: string; status: string; label: string; activeForm?: string; form: number }>;
  gear?: string[];
  resolves?: number;
  [key: string]: unknown;
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
  ctxTokens?: number | null;
  outTokens?: number | null;
  ctxSize?: number | null;
  t: number;
}

export interface Milestone {
  boss: string;
  date: string;
  turns: number;
  project: string;
  at?: number;        // epoch ms of the kill (enables later time/streak features)
  dmg?: number;       // lines changed during the fight
  kills?: number;     // minions felled
  maxCombo?: number;  // peak combo in the fight
}

export interface Quest {
  id: string;                            // == kind for the active instance
  kind: 'weekly_kills' | 'streak_days';
  target: number;
  progress: number;
  startedAt: number;                     // epoch ms
  doneAt?: number;                       // epoch ms when completed
}

export interface Profile {
  milestones: Milestone[];
  totals: { turns: number; dmg: number; kills: number };
  gear: Record<string, unknown>;
  langStats?: Record<string, number>;
  gearUse?: Record<string, number>;
  // progression (all optional; back-filled by core/progression on first defeat)
  xp?: number;
  level?: number;
  prestige?: number;
  badges?: Array<{ id: string; unlockedAt: number }>;
  quests?: Quest[];
  streak?: { days: number; lastActiveDay: string; longest?: number; freezes?: number; freezeMax?: number };
}

export interface BadgeDef {
  id: string;
  nameKey: string;
  stat: 'bossCount' | 'maxCombo' | 'kills' | 'projects' | 'nightKills' | 'badgeCount' | 'longestStreak';
  gte: number;
}

/** Locale catalog: string keys → string values (loaded from JSON). */
export type LocaleCatalog = Record<string, unknown>;

export interface SlimeEvent {
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
  minion?: string;
  count?: number;
  badge?: string;
  quest?: string;
  loot?: string;
  xp?: number;
  fx?: string;
  tier?: number;
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
  context_window?: { used_percentage?: number; total_input_tokens?: number; total_output_tokens?: number; context_window_size?: number };
  model?: { display_name: string };
}

/** Todo item shape used by TodoWrite tool. */
export interface TodoItem {
  status: string;
  [key: string]: unknown;
}

/** Tool input bag — fields vary by tool; index sig required for HookPayload. */
export interface ToolInput {
  file_path?: string;
  pattern?: string;
  query?: string;
  skill?: string;
  description?: string;
  prompt?: string;
  command?: string;
  new_string?: string;
  content?: string;
  plan?: string;
  todos?: TodoItem[];
  questions?: Array<{ question?: string; options?: Array<{ label?: string }> }>;
  answers?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * JSON piped into hook scripts by Claude Code.
 * Superset of StatuslineStdin — adds the tool / prompt / cwd fields.
 */
export interface HookPayload {
  session_id?: string;
  tool_name?: string;
  tool_input?: ToolInput;
  tool_response?: { is_error?: boolean; answers?: Record<string, string>; [key: string]: unknown };
  cwd?: string;
  prompt?: string;
  [key: string]: unknown;
}

