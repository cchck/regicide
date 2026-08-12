// Request throttling.
//
// ⚠️ COUNTERS LIVE IN THIS PROCESS'S MEMORY. That is a deliberate trade, not an oversight:
// the deployment is a single Railway instance, and an in-memory window costs nothing and
// needs no new service. The moment a second replica exists, each one enforces its own
// share and the effective limit doubles. If this ever scales horizontally, move the
// counters to Redis (Upstash's free tier is enough) or to Postgres — do not just raise the
// numbers.
//
// Also: do NOT move this into Next middleware. Middleware runs on the Edge runtime by
// default, which does not share memory with the Node route handlers, so the counters there
// would be a different set that no route ever reads.

interface Rule {
  limit: number;
  windowMs: number;
}

/**
 * The rules, in one place so the ratios are visible against each other.
 *
 * Every number is set so that a real player never meets it. A match runs 5–35 rounds over
 * several minutes, so 60 stat writes a minute is far above honest play and far below what
 * a script needs to be worth running.
 */
export const LIMITS = {
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  statsPlay: { limit: 60, windowMs: 60 * 1000 },
  account: { limit: 30, windowMs: 60 * 1000 },
} satisfies Record<string, Rule>;

/** key → timestamps of the hits still inside the window. */
const hits = new Map<string, number[]>();

const SWEEP_EVERY_MS = 5 * 60 * 1000;
/** Widest window in use — anything older than this is dead under every rule. */
const MAX_WINDOW_MS = Math.max(...Object.values(LIMITS).map((r) => r.windowMs));
let lastSweep = Date.now();

/** Drop keys nothing can reference any more, so the map can't grow without bound. */
function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, times] of hits) {
    const live = times.filter((t) => now - t < MAX_WINDOW_MS);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
}

export interface RateResult {
  ok: boolean;
  /** Seconds until the oldest hit falls out of the window. Only meaningful when !ok. */
  retryAfter: number;
}

/**
 * Sliding window. Counts a hit only when the request is allowed — a rejected attempt does
 * not extend the block, so hammering a locked endpoint can't lock it out forever.
 */
export function take(key: string, rule: Rule): RateResult {
  const now = Date.now();
  sweep(now);

  const times = (hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);
  if (times.length >= rule.limit) {
    hits.set(key, times);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((rule.windowMs - (now - times[0])) / 1000)) };
  }
  times.push(now);
  hits.set(key, times);
  return { ok: true, retryAfter: 0 };
}

/**
 * Caller's IP. Railway (like any proxy) puts the real client at the head of
 * x-forwarded-for; everything after it is the proxy chain and must not be trusted.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** 429 with the header clients and crawlers actually honour. */
export function tooMany(retryAfter: number, message = '请求太频繁了，慢一点') {
  return Response.json(
    { error: message },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}
