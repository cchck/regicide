import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { computePersona, PlayEvent } from '@/lib/persona';

const ROLE_LC = { EMPEROR: 'emperor', SLAVE: 'slave' } as const;
const CARD_LC = { EMPEROR: 'emperor', CITIZEN: 'citizen', SLAVE: 'slave' } as const;

// The player's own dossier data — computed from the raw event log (private view,
// folds included: you know what you played, even if the table never saw it).
// This is both the pipeline check and the data source for the /dossier page.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const events = await prisma.cardPlayEvent.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
  });

  // Tendency math runs on showdowns only. A folded round returns both cards to hand —
  // the card in that event was never shown AND is still available, so counting it
  // as "played at slot N" would poison exactly the timing signal this page exists
  // to expose. (Folds still count in the summary line below.)
  const shown = events.filter((e) => !e.folded);

  // The tell that matters: as slave, WHEN the slave card comes out; emperor likewise.
  const buildRole = (role: 'EMPEROR' | 'SLAVE') => {
    const keyCard = role;
    return [1, 2, 3, 4, 5].map((round) => {
      const rows = shown.filter((e) => e.role === role && e.round === round);
      const key = rows.filter((e) => e.card === keyCard).length;
      return {
        round,
        plays: rows.length,
        keyCardPlays: key,
        rate: rows.length > 0 ? key / rows.length : null,
      };
    });
  };

  // Does a heavy bet mean a real key card, or a bluff? Your own pattern, exposed.
  const buckets = [
    { label: '×1', min: 1, max: 1 },
    { label: '×2–3', min: 2, max: 3 },
    { label: '×4+', min: 4, max: 999 },
  ].map(({ label, min, max }) => {
    const rows = shown.filter((e) => e.betMultiplier >= min && e.betMultiplier <= max);
    const key = rows.filter((e) => e.card === e.role).length;
    const wins = rows.filter((e) => e.won).length;
    return {
      label,
      plays: rows.length,
      keyRate: rows.length > 0 ? key / rows.length : null,
      winRate: rows.length > 0 ? wins / rows.length : null,
    };
  });

  // The 16-type persona, from the same log (its own thresholds, folds included where
  // relevant). The DB stores role/card as uppercase enums; the analyzer speaks lowercase.
  const persona = computePersona(
    events.map<PlayEvent>((e) => ({
      role: ROLE_LC[e.role],
      card: CARD_LC[e.card],
      round: e.round,
      betMultiplier: e.betMultiplier,
      folded: e.folded,
      foldedSelf: e.foldedSelf,
      won: e.won,
    })),
  );

  return NextResponse.json({
    totalEvents: events.length,
    wins: events.filter((e) => e.won).length,
    folds: events.filter((e) => e.foldedSelf).length,
    grid: { emperor: buildRole('EMPEROR'), slave: buildRole('SLAVE') },
    betBuckets: buckets,
    persona,
  });
}
