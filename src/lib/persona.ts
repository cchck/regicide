// Turns a player's raw card-play log into a 16-type persona. Pure — same function feeds
// the private dossier badge and any server aggregation. No thresholds are eyeballed: each
// axis has an explicit split with a documented reason, and every split can be swapped to a
// population median later without touching callers.

import { AXES, AxisKey } from './persona-data';

// The subset of a CardPlayEvent this needs. `card`/`role` use the app's lowercase kinds.
export interface PlayEvent {
  role: 'emperor' | 'slave';
  card: 'emperor' | 'citizen' | 'slave';
  round: number;
  betMultiplier: number;
  folded: boolean;
  foldedSelf: boolean;
  won: boolean;
}

export interface AxisResult {
  key: AxisKey;
  /** 0 = left pole (猛/疾/抗/诈), 1 = right pole (稳/忍/避/直). */
  pole: 0 | 1;
  /** Lean strength on the chosen pole, 50–100. */
  pct: number;
  /** Enough samples for this axis to mean something. */
  confident: boolean;
}

export interface PersonaResult {
  /** Four-letter id, e.g. "AHDB" — always present (poles default sensibly on thin data). */
  latin: string;
  axes: AxisResult[];
  /** Showdown rounds logged — the reveal gate. */
  showdowns: number;
  /** True once there's enough to reveal the persona. */
  settled: boolean;
  /** Showdowns still needed before reveal (0 once settled). */
  needMore: number;
}

const REVEAL_SHOWDOWNS = 30; // gate: a persona only crystallises after this many showdowns

// Map a raw signal to a pole + a 50–100 lean. `split` is the boundary; `spanLeft`/
// `spanRight` are how far past the split counts as a full 100 on each side.
function lean(signal: number, split: number, spanLeft: number, spanRight: number): { pole: 0 | 1; pct: number } {
  if (signal >= split) {
    const t = Math.min((signal - split) / spanRight, 1);
    return { pole: 0, pct: 50 + t * 50 };
  }
  const t = Math.min((split - signal) / spanLeft, 1);
  return { pole: 1, pct: 50 + t * 50 };
}

export function computePersona(events: PlayEvent[]): PersonaResult {
  const showdowns = events.filter((e) => !e.folded).length;

  // ——— 血性 (猛/稳): how big the pots they push. All rounds carry a resolved multiplier. ———
  const mults = events.map((e) => e.betMultiplier);
  const avgMult = mults.length ? mults.reduce((a, b) => a + b, 0) / mults.length : 1;
  // Split at 2.2: opening bets run ×1–×5, so ~2.2 average already means routinely raising.
  const blood = lean(avgMult, 2.2, 1.2, 1.8);
  const bloodConf = events.length >= 10;

  // ——— 时机 (疾/忍): when the KEY card comes out, at showdown only (folds never reveal). ———
  const keyShowdowns = events.filter(
    (e) => !e.folded && ((e.role === 'emperor' && e.card === 'emperor') || (e.role === 'slave' && e.card === 'slave')),
  );
  const avgRound = keyShowdowns.length
    ? keyShowdowns.reduce((a, e) => a + Math.min(e.round, 5), 0) / keyShowdowns.length
    : 3; // no key-card showdowns yet → dead centre, leans 忍 at 50
  // Split at 3.0 (middle of rounds 1–5): ≤3 reads as 疾 (early), >3 as 忍 (hoarder).
  const timing = lean(avgRound, 3.0, 2.0, 2.0);
  // NB: signal below split → 疾 which is pole 0; lean() gives pole 1 for below-split, so flip.
  const timingFixed = { pole: (timing.pole === 0 ? 1 : 0) as 0 | 1, pct: timing.pct };
  const timingConf = keyShowdowns.length >= 5;

  // ——— 止损 (抗/避): fold-rate. Folding carries an escalating penalty, so 20% is already high. ———
  const foldRate = events.length ? events.filter((e) => e.foldedSelf).length / events.length : 0;
  // Higher fold-rate → 避 (pole 1). Split 0.20; full 避 by 0.45, full 抗 at 0.
  const stopRaw = lean(foldRate, 0.2, 0.2, 0.25);
  const stop = { pole: (stopRaw.pole === 0 ? 1 : 0) as 0 | 1, pct: stopRaw.pct };
  const stopConf = events.length >= 12;

  // ——— 虚实 (诈/直): on big bets, how often the card was an empty citizen vs a real key card. ———
  const bigBets = events.filter((e) => e.betMultiplier >= 3);
  const citizenOnBig = bigBets.length ? bigBets.filter((e) => e.card === 'citizen').length / bigBets.length : 0;
  // High citizen-share on big bets → 诈 (pole 0, empty pressure). Split 0.5.
  const bluff = lean(citizenOnBig, 0.5, 0.5, 0.5);
  const bluffConf = bigBets.length >= 5;

  const axisOrder: { key: AxisKey; pole: 0 | 1; pct: number; confident: boolean }[] = [
    { key: 'blood', ...blood, confident: bloodConf },
    { key: 'timing', ...timingFixed, confident: timingConf },
    { key: 'stop', ...stop, confident: stopConf },
    { key: 'bluff', ...bluff, confident: bluffConf },
  ];

  const latin = axisOrder.map((a, i) => AXES[i].letters[a.pole]).join('');

  return {
    latin,
    axes: axisOrder.map((a) => ({ key: a.key, pole: a.pole, pct: Math.round(a.pct), confident: a.confident })),
    showdowns,
    settled: showdowns >= REVEAL_SHOWDOWNS,
    needMore: Math.max(0, REVEAL_SHOWDOWNS - showdowns),
  };
}

export { REVEAL_SHOWDOWNS };
