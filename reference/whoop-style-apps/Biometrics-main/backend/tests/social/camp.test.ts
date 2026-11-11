import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { block, unpair } from '../../src/buddies/relations';
import { deleteUserAccount } from '../../src/users/deletion';
import { campSummaryFor, getCamp } from '../../src/social/camp';
import { loadCircle } from '../../src/social/circle';
import { sayGoodnight } from '../../src/social/goodnight';
import { api, buddyUser, pairUp } from '../buddies/helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const LA = 'America/Los_Angeles'; // PDT, UTC−7
const NIGHT = new Date('2026-10-08T05:30:00Z'); // Wed Oct 7, 22:30 in Los Angeles (Thu 18:30 in Auckland)
const SUNRISE = new Date('2026-10-08T13:00:00Z');
/** Pairs made long before this week: they count on every night of it. */
const BEFORE = new Date('2026-09-01T00:00:00Z');
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };
const gn = (authorId: string, localDate: string, at: Date, onTime = true) =>
  prisma.goodnight.create({ data: { authorId, localDate: civilDateToUtcMidnight(localDate), at, onTime } });
const note = (authorId: string, text: string, createdAt: Date, expiresAt = SUNRISE) =>
  prisma.campNote.create({ data: { authorId, text, createdAt, expiresAt } });

it("shows me first, then buddies by latest activity, asleep or awake, with their live notes — never a stranger's", async () => {
  const me = await buddyUser({ timezone: LA, displayName: 'Me' });
  const sam = await buddyUser({ timezone: LA, displayName: 'Sam' });
  const ana = await buddyUser({ timezone: 'Pacific/Auckland', displayName: 'Ana' });
  const ben = await buddyUser({ timezone: LA, displayName: 'Ben' });
  const stranger = await buddyUser({ timezone: LA });
  for (const b of [sam, ana, ben]) await pairUp(me.id, b.id);
  await gn(sam.id, '2026-10-07', new Date('2026-10-08T05:00:00Z')); // 22:00, on time
  await note(sam.id, 'on time tonight', new Date('2026-10-08T04:50:00Z'));
  await note(ana.id, 'day 6 of 7', new Date('2026-10-08T05:10:00Z'), new Date('2026-10-08T17:00:00Z'));
  await note(stranger.id, 'not for you', new Date('2026-10-08T05:20:00Z'));
  await note(ben.id, 'old news', new Date('2026-10-07T04:00:00Z'), new Date('2026-10-07T13:00:00Z')); // expired

  const camp = await getCamp(me.id, NIGHT);
  expect(camp.night).toBe(true);
  expect(camp.members.map((m) => [m.person.id, m.mine, m.asleep, m.onTime, m.note])).toEqual([
    [me.id, true, false, null, null],
    [ana.id, false, false, null, 'day 6 of 7'], // her note at 05:10 is the latest activity
    [sam.id, false, true, true, 'on time tonight'], // asleep keeps the bubble
    [ben.id, false, false, null, null],
  ]);
  expect(camp.members[2]!.asleepSince).toBe('2026-10-08T05:00:00.000Z');
  expect(camp.fire).toEqual({ lit: 1, of: 4, segments: 2 });
  expect(camp.goodnight).toBeNull();
  const json = JSON.stringify(camp);
  expect(json).not.toContain('not for you');
  expect(json).not.toContain('old news');
  expect(camp.goodnightOpen).toBe(true);
  expect(camp.goodnightOpensAt).toBe('20:00');
  expect(campSummaryFor(await loadCircle(me.id, NIGHT), NIGHT)).toEqual({
    night: true, awake: 3, asleep: 1, goodnight: null, goodnightOpen: true, goodnightOpensAt: '20:00',
  });
});

it('my goodnight window follows my own goal: open at 17:30 with an 18:00 goal while the scene is still day', async () => {
  const me = await buddyUser({ timezone: LA });
  await prisma.user.update({ where: { id: me.id }, data: { bedtimeGoal: '18:00' } });
  const other = await buddyUser({ timezone: LA });
  const halfFive = new Date('2026-10-08T00:30:00Z'); // Oct 7, 17:30
  expect(await getCamp(me.id, halfFive)).toMatchObject({ night: false, goodnightOpen: true, goodnightOpensAt: '17:00' });
  expect(await getCamp(other.id, halfFive)).toMatchObject({ night: false, goodnightOpen: false, goodnightOpensAt: '20:00' });
  // No goal at 19:30: the scene is night, the window is not open yet.
  expect(await getCamp(other.id, new Date('2026-10-08T02:30:00Z'))).toMatchObject({ night: true, goodnightOpen: false });
});

it('an Auckland buddy sleeps by her own clock and is judged by her own goal while I am in Los Angeles', async () => {
  const me = await buddyUser({ timezone: LA });
  const ana = await buddyUser({ timezone: 'Pacific/Auckland' });
  await prisma.user.update({ where: { id: ana.id }, data: { bedtimeGoal: '21:30' } });
  await pairUp(me.id, ana.id, BEFORE);
  // Her 22:00 NZDT on Thu Oct 8 (2026-10-08T09:00Z; my Thu 02:00): late by her 21:30 goal, though on time by 23:00.
  const said = await sayGoodnight(ana.id, new Date('2026-10-08T09:00:00Z'));
  expect([said.localDate, said.onTime]).toEqual(['2026-10-08', false]);
  const anaAt = async (now: Date) => (await getCamp(me.id, now)).members.find((m) => m.person.id === ana.id)!;
  // My 02:30, night: she is asleep, and her flag is the one her goal gave.
  const myNight = new Date('2026-10-08T09:30:00Z');
  expect((await getCamp(me.id, myNight)).night).toBe(true);
  expect(await anaAt(myNight)).toMatchObject({ asleep: true, asleepSince: '2026-10-08T09:00:00.000Z', onTime: false });
  // My 13:00 is her Fri 09:00: still her morning, not checked in, so still asleep.
  expect(await anaAt(new Date('2026-10-08T20:00:00Z'))).toMatchObject({ asleep: true });
  // My 16:00 is her noon: awake.
  expect(await anaAt(new Date('2026-10-08T23:00:00Z'))).toMatchObject({ asleep: false, asleepSince: null, onTime: null });
});

it("at my 05:30 it is still my night, while an Auckland buddy's tonight is already the next evening", async () => {
  const me = await buddyUser({ timezone: LA });
  const ana = await buddyUser({ timezone: 'Pacific/Auckland' });
  await pairUp(me.id, ana.id, BEFORE);
  await gn(ana.id, '2026-10-08', new Date('2026-10-08T09:00:00Z')); // her Thu 22:00, on time
  const dawn = new Date('2026-10-08T12:30:00Z'); // my Thu 05:30 (the evening of Oct 7); her Fri 01:30 (the evening of Oct 8)
  const camp = await getCamp(me.id, dawn);
  expect(camp.night).toBe(true);
  expect(camp.members.find((m) => m.person.id === ana.id)).toMatchObject({ asleep: true, onTime: true });
  // Her own tonight (Oct 8) lights tonight's fire, though my evening is still Oct 7.
  expect(camp.fire).toEqual({ lit: 1, of: 2, segments: 3 });
});

it('my own goodnight comes back for Undo and puts my coach to sleep', async () => {
  const me = await buddyUser({ timezone: LA });
  const said = await sayGoodnight(me.id, NIGHT); // no goal: 22:30 is on time
  const camp = await getCamp(me.id, NIGHT);
  expect(camp.goodnight).toEqual(said);
  expect(camp.members[0]).toMatchObject({ mine: true, asleep: true, onTime: true });
  expect(camp.fire).toEqual({ lit: 1, of: 1, segments: 5 });
});

it('a coach stays asleep into the morning until its owner checks in or it is noon; a check-in hides an older note', async () => {
  const me = await buddyUser({ timezone: LA });
  const sam = await buddyUser({ timezone: LA });
  await pairUp(me.id, sam.id);
  await gn(sam.id, '2026-10-07', new Date('2026-10-08T05:00:00Z'));
  await note(sam.id, 'night all', new Date('2026-10-08T05:01:00Z'), new Date('2026-10-09T13:00:00Z'));
  const samAt = async (now: Date) => (await getCamp(me.id, now)).members.find((m) => m.person.id === sam.id)!;
  const morning = new Date('2026-10-08T15:00:00Z'); // Oct 8, 08:00
  expect(await samAt(morning)).toMatchObject({ asleep: true, onTime: true, asleepSince: '2026-10-08T05:00:00.000Z', note: 'night all' });
  expect((await getCamp(me.id, morning)).night).toBe(false);
  expect(await samAt(new Date('2026-10-08T19:00:00Z'))).toMatchObject({ asleep: false, asleepSince: null, onTime: null }); // 12:00
  // Written straight to the table (no saveCheckIn), so only the read-time rule hides the note.
  await prisma.checkIn.create({ data: { authorId: sam.id, localDate: civilDateToUtcMidnight('2026-10-08'), mood: 'RESTED', createdAt: new Date('2026-10-08T14:30:00Z') } });
  expect(await samAt(morning)).toMatchObject({ asleep: false, note: null });
});

it("counts this week's nights whose fire reached 3 segments (Mon–Sun of my evening); pairing today never unlights Monday", async () => {
  const me = await buddyUser({ timezone: LA });
  const a = await buddyUser({ timezone: LA });
  const b = await buddyUser({ timezone: LA });
  const c = await buddyUser({ timezone: LA });
  for (const u of [a, b, c]) await pairUp(me.id, u.id, BEFORE);
  // A camp of 4. Mon Oct 5: 2 on time (3 segments, lit). Tue: 1 on time, 1 late (2). Wed, tonight: 3 (4, lit).
  // Sun Oct 4: another week.
  for (const u of [me, a]) await gn(u.id, '2026-10-05', new Date('2026-10-06T05:00:00Z'));
  await gn(a.id, '2026-10-06', new Date('2026-10-07T05:00:00Z'));
  await gn(b.id, '2026-10-06', new Date('2026-10-07T05:10:00Z'), false);
  for (const u of [a, b, c]) await gn(u.id, '2026-10-07', new Date('2026-10-08T05:00:00Z'));
  for (const u of [me, a, b, c]) await gn(u.id, '2026-10-04', new Date('2026-10-05T05:00:00Z'));
  const before = await getCamp(me.id, NIGHT);
  expect(before.nightsLitThisWeek).toBe(2);
  expect(before.fire).toEqual({ lit: 3, of: 4, segments: 4 });

  // Two buddies pair with me tonight at 22:30, after this evening's 19:00. Tonight's fire is live and grows its camp
  // to 6; past nights are frozen: Monday stays 2 of 4 (counted against 6 it would be 2 segments, unlit) and tonight's
  // lit night is judged against its 19:00 camp of 4.
  for (let i = 0; i < 2; i++) await pairUp(me.id, (await buddyUser({ timezone: LA })).id, NIGHT);
  const after = await getCamp(me.id, NIGHT);
  expect(after.fire).toEqual({ lit: 3, of: 6, segments: 3 });
  expect(after.nightsLitThisWeek).toBe(2);
});

it("an unpaired or blocked buddy leaves my camp at once, and I leave theirs; a deleted account takes its note", async () => {
  const me = await buddyUser({ timezone: LA });
  const sam = await buddyUser({ timezone: LA });
  const ana = await buddyUser({ timezone: LA });
  const kai = await buddyUser({ timezone: LA });
  for (const u of [sam, ana, kai]) await pairUp(me.id, u.id);
  await note(me.id, 'my note', new Date('2026-10-08T05:00:00Z'));
  await note(sam.id, 'sam note', new Date('2026-10-08T05:00:00Z'));
  await note(ana.id, 'ana note', new Date('2026-10-08T05:00:00Z'));
  await note(kai.id, 'kai note', new Date('2026-10-08T05:00:00Z'));
  await unpair(me.id, sam.id, NIGHT);
  await block(me.id, ana.id, NIGHT);
  const mine = await getCamp(me.id, NIGHT);
  expect(mine.members.map((m) => m.person.id)).toEqual([me.id, kai.id]);
  expect(JSON.stringify(mine)).not.toMatch(/sam note|ana note/);
  for (const ex of [sam, ana]) {
    const theirs = await getCamp(ex.id, NIGHT);
    expect(theirs.members.map((m) => m.person.id)).toEqual([ex.id]);
    expect(JSON.stringify(theirs)).not.toContain('my note');
  }
  await deleteUserAccount(kai.id, noop);
  expect(await prisma.campNote.count({ where: { authorId: kai.id } })).toBe(0);
  expect((await getCamp(me.id, NIGHT)).members.map((m) => m.person.id)).toEqual([me.id]);
});

it("files each on-time goodnight under the viewer's evening it was said in, so tonight's lit fire is tonight's lit night", async () => {
  const me = await buddyUser({ timezone: LA });
  const ana = await buddyUser({ timezone: 'Pacific/Auckland' });
  const kai = await buddyUser({ timezone: 'Pacific/Auckland' });
  for (const u of [ana, kai]) await pairUp(me.id, u.id, BEFORE);
  await gn(me.id, '2026-10-07', NIGHT); // my Wed 22:30
  // Their Thu 22:00 NZDT (their evening of Oct 8) is my Thu 02:00: my evening of Oct 7.
  for (const u of [ana, kai]) await gn(u.id, '2026-10-08', new Date('2026-10-08T09:00:00Z'));
  const camp = await getCamp(me.id, new Date('2026-10-08T09:30:00Z')); // my 02:30
  expect(camp.fire).toEqual({ lit: 3, of: 3, segments: 5 });
  expect(camp.nightsLitThisWeek).toBe(1);
  // My next evening (Thu Oct 8, 22:30): nobody has said goodnight in it; their Oct 8 goodnights stay on my Oct 7.
  const nextEvening = await getCamp(me.id, new Date('2026-10-09T05:30:00Z'));
  expect(nextEvening.fire.lit).toBe(0);
  expect(nextEvening.nightsLitThisWeek).toBe(1);
});

it('a goodnight after an early check-in keeps the coach asleep into the morning', async () => {
  const me = await buddyUser({ timezone: LA });
  const sam = await buddyUser({ timezone: LA });
  await pairUp(me.id, sam.id);
  // Checked in at 01:00 on Oct 8, then said goodnight at 02:00 (the evening of Oct 7).
  await prisma.checkIn.create({ data: { authorId: sam.id, localDate: civilDateToUtcMidnight('2026-10-08'), mood: 'RESTED', createdAt: new Date('2026-10-08T08:00:00Z') } });
  await gn(sam.id, '2026-10-07', new Date('2026-10-08T09:00:00Z'));
  const six = new Date('2026-10-08T13:00:00Z'); // Oct 8, 06:00
  expect((await getCamp(me.id, six)).members.find((m) => m.person.id === sam.id)).toMatchObject({ asleep: true, asleepSince: '2026-10-08T09:00:00.000Z' });
});

it("a check-in after tonight's goodnight wakes the coach before 06:00; one before it does not (fix M-7)", async () => {
  const me = await buddyUser({ timezone: LA });
  const sam = await buddyUser({ timezone: LA });
  const ben = await buddyUser({ timezone: LA });
  await pairUp(me.id, sam.id, BEFORE);
  await pairUp(me.id, ben.id, BEFORE);
  // Sam: goodnight at 23:00 on Oct 7, then a check-in at 02:00 on Oct 8 (his new day, still the evening of Oct 7).
  await gn(sam.id, '2026-10-07', new Date('2026-10-08T06:00:00Z'));
  // Ben: a check-in at 01:00 on Oct 8, then a goodnight at 02:00.
  await prisma.checkIn.create({ data: { authorId: ben.id, localDate: civilDateToUtcMidnight('2026-10-08'), mood: 'RESTED', createdAt: new Date('2026-10-08T08:00:00Z') } });
  await gn(ben.id, '2026-10-07', new Date('2026-10-08T09:00:00Z'));
  const at = (camp: Awaited<ReturnType<typeof getCamp>>, id: string) => camp.members.find((m) => m.person.id === id)!;
  const oneThirty = new Date('2026-10-08T08:30:00Z'); // Oct 8, 01:30
  expect(at(await getCamp(me.id, oneThirty), sam.id)).toMatchObject({ asleep: true, asleepSince: '2026-10-08T06:00:00.000Z' });
  await prisma.checkIn.create({ data: { authorId: sam.id, localDate: civilDateToUtcMidnight('2026-10-08'), mood: 'RESTED', createdAt: new Date('2026-10-08T09:00:00Z') } });
  const twoThirty = new Date('2026-10-08T09:30:00Z'); // Oct 8, 02:30
  const camp = await getCamp(me.id, twoThirty);
  expect(at(camp, sam.id)).toMatchObject({ asleep: false, asleepSince: null, onTime: null });
  expect(at(camp, ben.id)).toMatchObject({ asleep: true, asleepSince: '2026-10-08T09:00:00.000Z' });
  // Sam's on-time goodnight still feeds tonight's fire; the banner agrees with the page.
  expect(camp.fire.lit).toBe(2);
  expect(campSummaryFor(await loadCircle(me.id, twoThirty), twoThirty)).toMatchObject({ awake: 2, asleep: 1 });
});

it("a buddy paired before 19:00 tonight is in tonight's camp; one paired after it is not", async () => {
  // Tonight, on time: the new buddy and one old buddy. With the new buddy in the camp: 2 of 4, 3 segments, lit.
  // Left out: only the old buddy counts, 1 of 3, 2 segments, unlit.
  const nightWith = async (pairedAt: Date) => {
    const me = await buddyUser({ timezone: LA });
    const a = await buddyUser({ timezone: LA });
    const b = await buddyUser({ timezone: LA });
    const c = await buddyUser({ timezone: LA });
    for (const u of [a, b]) await pairUp(me.id, u.id, BEFORE);
    await pairUp(me.id, c.id, pairedAt);
    for (const u of [a, c]) await gn(u.id, '2026-10-07', new Date('2026-10-08T05:00:00Z'));
    return getCamp(me.id, NIGHT);
  };
  const before = await nightWith(new Date('2026-10-08T01:30:00Z')); // 18:30
  expect(before.fire).toEqual({ lit: 2, of: 4, segments: 3 });
  expect(before.nightsLitThisWeek).toBe(1);
  const after = await nightWith(new Date('2026-10-08T02:30:00Z')); // 19:30
  expect(after.fire).toEqual({ lit: 2, of: 4, segments: 3 }); // the live fire counts everyone here now
  expect(after.nightsLitThisWeek).toBe(0);
});

it('GET /me/camp is never cached, has the documented shape, and needs a session', async () => {
  const me = await buddyUser();
  const agent = await api();
  const res = await agent.get('/me/camp').set(await authHeaderFor(me.id));
  expect([res.status, res.headers['cache-control']]).toEqual([200, 'private, no-store']);
  expect(Object.keys(res.body).sort()).toEqual(['fire', 'goodnight', 'goodnightOpen', 'goodnightOpensAt', 'members', 'night', 'nightsLitThisWeek']);
  expect(Object.keys(res.body.members[0]).sort()).toEqual(['asleep', 'asleepSince', 'mine', 'note', 'onTime', 'person']);
  expect((await agent.get('/me/camp')).status).toBe(401);
});
