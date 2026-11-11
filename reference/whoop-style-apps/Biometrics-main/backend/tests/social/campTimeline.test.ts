import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { getStory, loadStoryRings } from '../../src/social/stories';
import { buildTimeline } from '../../src/social/timeline';
import { buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const LA = 'America/Los_Angeles';
const NIGHT = new Date('2026-10-08T05:30:00Z'); // Oct 7, 22:30 in Los Angeles
const day = (d: string) => civilDateToUtcMidnight(d);

async function camp(n: number) {
  const me = await buddyUser({ timezone: LA });
  const others = [];
  for (let i = 0; i < n; i++) {
    const u = await buddyUser({ timezone: LA });
    await pairUp(me.id, u.id);
    others.push(u);
  }
  return { me, others };
}

it("a goodnight is a story frame in the author's day — never locked — and a timeline item with its on-time flag", async () => {
  const { me, others: [sam] } = await camp(1);
  const at = new Date('2026-10-08T05:00:00Z'); // 22:00
  await prisma.goodnight.create({ data: { authorId: sam!.id, localDate: day('2026-10-07'), at, onTime: true } });
  expect((await getStory(me.id, sam!.id, NIGHT)).frames).toEqual([{ kind: 'goodnight', at: at.toISOString(), onTime: true }]);
  // I haven't checked in, yet the goodnight-only ring is not locked.
  expect((await loadStoryRings(me.id, NIGHT)).rings.map((r) => [r.author.id, r.locked, r.frameCount])).toEqual([[sam!.id, false, 1]]);
  const items = await buildTimeline(me.id, NIGHT);
  expect(items).toEqual([{ id: expect.stringMatching(/^goodnight:/), kind: 'goodnight', at: at.toISOString(), actor: expect.objectContaining({ id: sam!.id }), mine: false, onTime: true }]);
});

it("a goodnight after midnight opens the new day's story, and leaves the old one", async () => {
  const { me, others: [sam, ana] } = await camp(2);
  await prisma.goodnight.create({ data: { authorId: sam!.id, localDate: day('2026-10-07'), at: new Date('2026-10-08T07:30:00Z'), onTime: false } }); // 00:30 Oct 8
  await prisma.goodnight.create({ data: { authorId: ana!.id, localDate: day('2026-10-07'), at: new Date('2026-10-08T05:00:00Z'), onTime: true } }); // 22:00 Oct 7
  const oneAm = new Date('2026-10-08T08:00:00Z'); // Oct 8, 01:00
  expect((await getStory(me.id, sam!.id, oneAm)).frames.map((f) => f.kind)).toEqual(['goodnight']);
  expect((await getStory(me.id, ana!.id, oneAm)).frames).toEqual([]);
});

it('lists a camp note written at night as "left a camp note" — never its text — and skips day, expired and cleared notes', async () => {
  const { me, others: [sam, ana, ben, kai] } = await camp(4);
  const sunrise = new Date('2026-10-08T13:00:00Z');
  await prisma.campNote.create({ data: { authorId: sam!.id, text: 'secret words', createdAt: new Date('2026-10-08T05:10:00Z'), expiresAt: sunrise } }); // 22:10
  await prisma.campNote.create({ data: { authorId: ana!.id, text: 'lunch thoughts', createdAt: new Date('2026-10-07T19:00:00Z'), expiresAt: sunrise } }); // 12:00
  await prisma.campNote.create({ data: { authorId: ben!.id, text: 'gone already', createdAt: new Date('2026-10-08T03:00:00Z'), expiresAt: new Date('2026-10-08T04:00:00Z') } });
  await prisma.campNote.create({ data: { authorId: kai!.id, text: 'cleared', createdAt: new Date('2026-10-08T02:30:00Z'), expiresAt: sunrise } }); // 19:30
  await prisma.checkIn.create({ data: { authorId: kai!.id, localDate: day('2026-10-07'), mood: 'OKAY', createdAt: new Date('2026-10-08T03:00:00Z') } }); // after the note
  const items = await buildTimeline(me.id, NIGHT);
  const notes = items.filter((i) => i.kind === 'camp_note');
  expect(notes.map((i) => i.actor.id)).toEqual([sam!.id]);
  expect(Object.keys(notes[0]!).sort()).toEqual(['actor', 'at', 'id', 'kind', 'mine']);
  const json = JSON.stringify(items);
  for (const text of ['secret words', 'lunch thoughts', 'gone already', 'cleared']) expect(json).not.toContain(text);
});

it("an unpaired buddy's goodnight and note leave my timeline", async () => {
  const { me, others: [sam] } = await camp(1);
  await prisma.goodnight.create({ data: { authorId: sam!.id, localDate: day('2026-10-07'), at: new Date('2026-10-08T05:00:00Z'), onTime: true } });
  await prisma.campNote.create({ data: { authorId: sam!.id, text: 'night all', createdAt: new Date('2026-10-08T05:05:00Z'), expiresAt: new Date('2026-10-08T13:00:00Z') } });
  expect((await buildTimeline(me.id, NIGHT)).map((i) => i.kind)).toEqual(['goodnight', 'camp_note']);
  await prisma.buddyPair.deleteMany({ where: { OR: [{ userAId: sam!.id }, { userBId: sam!.id }] } });
  expect(await buildTimeline(me.id, NIGHT)).toEqual([]);
});

describe('an Auckland author, judged in her own zone (final wave)', () => {
  const NZ = 'Pacific/Auckland'; // NZDT = UTC+13 in October

  it("her note written in her night shows even though it is my Los Angeles morning; an LA buddy's note then does not", async () => {
    const me = await buddyUser({ timezone: LA });
    const ana = await buddyUser({ timezone: NZ });
    const sam = await buddyUser({ timezone: LA });
    await pairUp(me.id, ana.id);
    await pairUp(me.id, sam.id);
    const written = new Date('2026-10-07T15:00:00Z'); // Oct 8, 04:00 in Auckland (night); Oct 7, 08:00 in Los Angeles (day)
    await prisma.campNote.create({ data: { authorId: ana.id, text: 'cannot sleep', createdAt: written, expiresAt: new Date('2026-10-07T17:00:00Z') } }); // her 06:00
    await prisma.campNote.create({ data: { authorId: sam.id, text: 'morning all', createdAt: written, expiresAt: new Date('2026-10-08T13:00:00Z') } });
    const items = await buildTimeline(me.id, new Date('2026-10-07T16:30:00Z')); // my 09:30
    expect(items.filter((i) => i.kind === 'camp_note').map((i) => i.actor.id)).toEqual([ana.id]);
  });

  it("her 00:30 NZDT goodnight opens her new day's story; one at 22:00 stays in the day before", async () => {
    const me = await buddyUser({ timezone: LA });
    const ana = await buddyUser({ timezone: NZ });
    const kai = await buddyUser({ timezone: NZ });
    await pairUp(me.id, ana.id);
    await pairUp(me.id, kai.id);
    await prisma.goodnight.create({ data: { authorId: ana.id, localDate: day('2026-10-07'), at: new Date('2026-10-07T11:30:00Z'), onTime: true } }); // 00:30 Oct 8 NZDT
    await prisma.goodnight.create({ data: { authorId: kai.id, localDate: day('2026-10-07'), at: new Date('2026-10-07T09:00:00Z'), onTime: true } }); // 22:00 Oct 7 NZDT
    const oneAm = new Date('2026-10-07T12:00:00Z'); // Oct 8, 01:00 in Auckland; Oct 7, 05:00 in Los Angeles
    expect((await getStory(me.id, ana.id, oneAm)).frames).toEqual([{ kind: 'goodnight', at: '2026-10-07T11:30:00.000Z', onTime: true }]);
    expect((await getStory(me.id, kai.id, oneAm)).frames).toEqual([]);
  });
});

it("a check-in and a goodnight while I haven't checked in: the ring is locked, yet the goodnight frame is not", async () => {
  const { me, others: [sam] } = await camp(1);
  await prisma.checkIn.create({ data: { authorId: sam!.id, localDate: day('2026-10-07'), mood: 'RESTED', createdAt: new Date('2026-10-08T03:00:00Z') } }); // 20:00
  const at = new Date('2026-10-08T05:00:00Z'); // 22:00
  await prisma.goodnight.create({ data: { authorId: sam!.id, localDate: day('2026-10-07'), at, onTime: true } });
  expect((await loadStoryRings(me.id, NIGHT)).rings.map((r) => [r.author.id, r.locked, r.frameCount])).toEqual([[sam!.id, true, 2]]);
  expect((await getStory(me.id, sam!.id, NIGHT)).frames).toEqual([
    { kind: 'checkin', at: '2026-10-08T03:00:00.000Z', locked: true },
    { kind: 'goodnight', at: at.toISOString(), onTime: true },
  ]);
});
