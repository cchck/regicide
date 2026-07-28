# REGICIDE · 弑君

A Dark Art Deco psychological gambling game. Three cards, one bluff, and a drill pointed
at your ear — E-Card (from *Kaiji*) rebuilt as a real-time 3D browser game.

Play an AI dealer with a personality, or a friend over a room code. Every hand you show
gets recorded, and eventually the table knows who you are.

---

## The game

Each set deals both sides five cards: four **citizens** and one key card — **Emperor** if
you hold the crown, **Slave** if you don't.

```
Emperor beats Citizen · Citizen beats Slave · Slave beats Emperor (×5 payout)
```

The Emperor side is strictly stronger, so sides swap every set and the match is
best-of-seven. The slave's only path is the regicide: catch the crown with the one card
that kills it. That asymmetry is the whole game.

**Folding** costs an escalating penalty within a set (1× ante, then 2×, then 3×…) and
**returns both cards to hand** — cutting your losses is a priced option, not a free reset.

## Features

- **Full 3D table** — react-three-fiber, first-person seated camera, PBR materials, a
  rigged dealer whose body language is a genuine tell, and an ear drill that advances one
  notch per set you lose.
- **Five endings, each with its own cinematic** — 处刑 (the drill finally arrives),
  弑君 (the dealer slumps back into his throne), 身无分文 (the lights die one by one),
  尽收囊中, 不战而胜.
- **Real-time PvP** — room codes, an authoritative Socket.IO server (opponents' hands never
  leave that process), 45s decision clocks, reconnect handling, and emotes.
- **读心 / Mind-reading** — pay 20% of the buy-in to see *when* your opponent historically
  plays their key card. Their eyes turn red, so they know you looked.
- **打牌人格 / Card personas** — 16 MBTI-style types derived from four axes of your real
  play (血性 / 时机 / 止损 / 虚实), with a shareable public page and OG card.
- **Chip economy** — persistent bankroll, three buy-in tiers, table stakes, and a
  settlement clamp so a client can't invent its own winnings.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind 4 · react-three-fiber / three.js ·
Socket.IO · Prisma 7 + PostgreSQL · NextAuth v5

The game engine (`src/lib/game-engine.ts`) is a pure reducer, reused verbatim by the
browser for AI matches and by the server as the authority for PvP.

## Running locally

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL and AUTH_SECRET
npx prisma migrate deploy
npx prisma generate
```

Two processes — the web app and the PvP server:

```bash
npm run dev    # http://localhost:3000
npm run ws     # PvP server on :3801
```

`npm run ws` is only needed for real-time PvP; AI matches run entirely in the browser.

### Environment

| Variable | Needed by | Notes |
|---|---|---|
| `DATABASE_URL` | web + ws | PostgreSQL |
| `AUTH_SECRET` | web + ws | **Must be identical in both** — web signs the ws ticket, ws verifies it |
| `NEXT_PUBLIC_WS_URL` | web | Public URL of the ws server; defaults to `http://localhost:3801` |
| `ALLOWED_ORIGIN` | ws | Locks Socket.IO CORS in production; open when unset |

## Deployment

Two long-running services (web + ws) plus Postgres. See [LAUNCH.md](LAUNCH.md) for the full
plan — including why this **can't** run on Cloudflare Workers, and the one
non-negotiable constraint:

> The **ws service must be a single instance**, with autoscaling and sleep disabled. Room
> state lives in that process's memory and the crash-recovery logic assumes exactly one
> writer.

Live matches survive restarts: rooms are mirrored to the DB on every state change and
restored on boot with their timers resumed from the stored deadline.

## Docs

- [LAUNCH.md](LAUNCH.md) — launch checklist, deployment plan, and the bugs and decisions
  behind the current design. Worth reading before touching recovery or the OG images.
- [ASSETS.md](ASSETS.md) — the 3D asset pipeline: Meshy prompts, rigging settings, and the
  compression run that takes 244MB of raw exports down to 4MB.

## Assets

3D models were generated with Meshy AI and compressed by `scripts/optimize-models.mjs`
(simplify → resize → WebP → meshopt). PBR textures are CC0 from Poly Haven. Music is
AI-generated; sound effects are synthesized procedurally in `src/lib/audio.ts`.

Pre-compression model backups live in `public/models/_raw` and are **not** in git — the
pipeline regenerates the shipped versions from them.
