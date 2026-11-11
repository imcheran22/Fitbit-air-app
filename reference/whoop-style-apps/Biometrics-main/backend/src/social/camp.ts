// The Campfire page (spec 2026-10-07 social §6). Your camp = you + your current buddies (the preloaded circle; a
// block deletes the pair, so an unpaired or blocked person — their coach, goodnight and camp note — is gone from
// your camp on the next read, and you from theirs). Asleep = a goodnight for the member's current evening, or for
// last evening between 06:00 and 11:59 local, either one until they check in after it (plan ruling; fix rulings M-1,
// M-7). Night or day (the scene, 19:00–05:59)
// follows the VIEWER's zone; my goodnight window (from min(20:00, my goal − 60 min) to 05:59) follows my zone and my
// goal; each member's "tonight" follows their own zone. Tonight's fire = members in bed on time ÷ the live camp.
// "Nights lit this week" judges each night against that night's camp — me plus the buddies paired by its 19:00 in my
// zone — so a past night is frozen (owner ruling Q2); an unpaired or blocked ex-buddy is absent from past nights too
// (ruling P5). Each on-time goodnight counts for the viewer evening in which it was said, the night whose live
// fire showed it, not its author's own evening date (fix ruling I-1: onTimeNightsByViewerEvening). Camp note text is user free text: returned only here, to the author and the author's current
// buddies, and never logged. A note is shown only while noteIsLive: not expired, and not older than its author's
// check-in today — that read-time check also covers a note shared while the check-in that clears it was being saved.

import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import type { PersonDTO } from '../buddies/people';
import { localHourOrUtc, mondayOf } from '../recap/periods';
import { shiftDate } from '../scoring/dates';
import { noteIsLive } from './campNotes';
import { loadCircle, type Circle, type GoodnightRow } from './circle';
import { toGoodnightDTO, type GoodnightDTO } from './goodnight';
import {
  campOnEvening, countLitNights, eveningDate, fireSegments, goodnightOpensAt, isGoodnightOpen, isNight, localInstant, NOON_HOUR,
  onTimeNightsByViewerEvening, SUNRISE_HOUR,
} from './night';

export interface CampMemberDTO {
  person: PersonDTO;
  mine: boolean;
  asleep: boolean;
  /** When the goodnight that keeps them asleep was said. */
  asleepSince: string | null;
  /** That goodnight's on-time flag; null while awake. */
  onTime: boolean | null;
  /** Their live camp note's text. */
  note: string | null;
}

export interface CampDTO {
  night: boolean;
  /** Me first, then buddies by latest activity (check-in, goodnight or note). */
  members: CampMemberDTO[];
  fire: { lit: number; of: number; segments: number };
  nightsLitThisWeek: number;
  /** My goodnight for tonight (the app offers Undo until its undoUntil). */
  goodnight: GoodnightDTO | null;
  /** Whether my "Say goodnight" window is open now (my zone, my goal). */
  goodnightOpen: boolean;
  /** When my window opens, "HH:MM" local: min(20:00, my goal − 60 min). */
  goodnightOpensAt: string;
}

export interface SleepState {
  asleep: boolean;
  /** The goodnight that keeps them asleep. */
  since: GoodnightRow | null;
  /** Their goodnight for their current evening (tonight's fire). */
  tonight: GoodnightRow | null;
}

export interface CampSummary {
  night: boolean;
  awake: number;
  asleep: number;
  goodnight: GoodnightDTO | null;
  goodnightOpen: boolean;
  goodnightOpensAt: string;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Each member's sleep, from the circle's goodnights and check-ins, each by the member's own clock. Pure. */
export function sleepStates(circle: Circle, now: Date): Map<string, SleepState> {
  const byEvening = new Map(circle.goodnights.map((g) => [`${g.authorId}:${isoDate(g.localDate)}`, g]));
  const states = new Map<string, SleepState>();
  for (const [id, m] of circle.members) {
    const tonight = byEvening.get(`${id}:${eveningDate(now, m.timezone)}`) ?? null;
    const hour = localHourOrUtc(now, m.timezone);
    const morning = hour >= SUNRISE_HOUR && hour < NOON_HOUR;
    const lastNight = morning ? byEvening.get(`${id}:${shiftDate(localCivilDateOrUtc(now, m.timezone), -1)}`) ?? null : null;
    // Only a check-in after the goodnight wakes them: one at 01:00, then a goodnight at 02:00, still sleeps; a
    // goodnight at 23:00, then a check-in at 02:00 (their new day), is awake. The same test for tonight and last night
    // (fix rulings M-1, M-7). `tonight` itself stays: it is their goodnight for the fire either way.
    const checkIn = circle.checkIns.get(id);
    const sleepsThrough = (g: GoodnightRow | null) => g !== null && (!checkIn || checkIn.createdAt.getTime() <= g.at.getTime());
    const since = tonight ? (sleepsThrough(tonight) ? tonight : null) : sleepsThrough(lastNight) ? lastNight : null;
    states.set(id, { asleep: since !== null, since, tonight });
  }
  return states;
}

/** What the camp banner and the evening timeline need, from the circle alone (no query). Pass `states` when they are already computed. */
export function campSummaryFor(circle: Circle, now: Date, states: Map<string, SleepState> = sleepStates(circle, now)): CampSummary {
  const asleep = [...states.values()].filter((s) => s.asleep).length;
  const mine = states.get(circle.viewer.person.id)?.tonight ?? null;
  const { timezone } = circle.viewer;
  return {
    night: isNight(now, timezone),
    awake: states.size - asleep,
    asleep,
    // My own goodnight: its undo window ends at the next 06:00 in my zone.
    goodnight: mine ? toGoodnightDTO(mine, timezone) : null,
    goodnightOpen: isGoodnightOpen(now, timezone, circle.viewerBedtimeGoal),
    goodnightOpensAt: goodnightOpensAt(circle.viewerBedtimeGoal),
  };
}

export async function getCamp(viewerId: string, now: Date): Promise<CampDTO> {
  const circle = await loadCircle(viewerId, now);
  const ids = [...circle.members.keys()];
  const tonightDate = eveningDate(now, circle.viewer.timezone);
  const weekStart = mondayOf(tonightDate);
  const [notes, week] = await Promise.all([
    // Only the camp's own notes (me + current buddies): a stranger's or an ex-buddy's never leaves the database.
    prisma.campNote.findMany({ where: { authorId: { in: ids }, expiresAt: { gt: now } }, select: { authorId: true, text: true, createdAt: true, expiresAt: true } }),
    prisma.goodnight.findMany({
      // Said in one of my evenings this week (Monday 06:00 in my zone up to now); a day of margin, filtered below.
      where: { authorId: { in: ids }, onTime: true, at: { gte: localInstant(shiftDate(weekStart, -1), '06:00', circle.viewer.timezone), lte: now } },
      select: { authorId: true, at: true, onTime: true },
    }),
  ]);
  const states = sleepStates(circle, now);
  const noteOf = new Map(notes.filter((n) => noteIsLive(n, circle, now)).map((n) => [n.authorId, n]));
  const lastActive = (id: string) => Math.max(
    circle.checkIns.get(id)?.createdAt.getTime() ?? 0,
    states.get(id)?.since?.at.getTime() ?? 0,
    noteOf.get(id)?.createdAt.getTime() ?? 0,
  );
  const buddies = [...circle.buddies].sort((a, b) => lastActive(b.person.id) - lastActive(a.person.id) || a.person.id.localeCompare(b.person.id));
  const members = [circle.viewer, ...buddies].map((m): CampMemberDTO => {
    const s = states.get(m.person.id)!;
    return {
      person: m.person,
      mine: m.person.id === viewerId,
      asleep: s.asleep,
      asleepSince: s.since ? s.since.at.toISOString() : null,
      onTime: s.since ? s.since.onTime : null,
      note: noteOf.get(m.person.id)?.text ?? null,
    };
  });
  // Tonight's fire is the live camp: everyone here now, each by their own tonight.
  const lit = [...states.values()].filter((s) => s.tonight?.onTime === true).length;
  const of = circle.members.size;
  // Each night of the week against that night's camp: me plus the buddies paired by its 19:00 (frozen past nights).
  const campOn = (date: string) => campOnEvening(date, viewerId, circle.pairedAt, circle.viewer.timezone);
  const onTimeThisWeek = onTimeNightsByViewerEvening(week, circle.viewer.timezone)
    .filter((g) => g.date >= weekStart && g.date <= tonightDate);
  const summary = campSummaryFor(circle, now, states);
  return {
    night: summary.night,
    members,
    fire: { lit, of, segments: fireSegments(lit, of) },
    nightsLitThisWeek: countLitNights(onTimeThisWeek, campOn),
    goodnight: summary.goodnight,
    goodnightOpen: summary.goodnightOpen,
    goodnightOpensAt: summary.goodnightOpensAt,
  };
}
