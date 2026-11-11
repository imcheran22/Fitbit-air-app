import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { saveCheckIn } from '../../src/social/checkins';
import { sayGoodnight } from '../../src/social/goodnight';
import { getSocialHome } from '../../src/social/home';
import { buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const LA = 'America/Los_Angeles';
const NIGHT = new Date('2026-10-08T05:30:00Z'); // Oct 7, 22:30 in Los Angeles

it('at night the camp counts awake and asleep, me.goodnight is mine for Undo, and no note text is in the bundle', async () => {
  const me = await buddyUser({ timezone: LA });
  const sam = await buddyUser({ timezone: LA });
  const ana = await buddyUser({ timezone: LA });
  await pairUp(me.id, sam.id);
  await pairUp(me.id, ana.id);
  await saveCheckIn(sam.id, 'RESTED', new Date('2026-10-07T15:00:00Z')); // 08:00
  await prisma.goodnight.create({ data: { authorId: sam.id, localDate: civilDateToUtcMidnight('2026-10-07'), at: new Date('2026-10-08T05:00:00Z'), onTime: true } });
  await prisma.campNote.create({ data: { authorId: sam.id, text: 'secret words', createdAt: new Date('2026-10-08T05:05:00Z'), expiresAt: new Date('2026-10-08T13:00:00Z') } });

  const before = await getSocialHome(me.id, NIGHT);
  expect(before.camp).toEqual({ checkedIn: 1, members: 3, faces: [expect.any(String)], faceColours: ['coral'], night: true, awake: 2, asleep: 1, goodnightOpen: true });
  expect(before.me.goodnight).toBeNull();
  const said = await sayGoodnight(me.id, NIGHT);
  const after = await getSocialHome(me.id, NIGHT);
  expect(after.me.goodnight).toEqual(said);
  expect(after.camp).toMatchObject({ awake: 1, asleep: 2 });
  expect(JSON.stringify(after)).not.toContain('secret words');
});

it("a stranger's goodnight never moves my camp's awake, asleep or members", async () => {
  const me = await buddyUser({ timezone: LA });
  const sam = await buddyUser({ timezone: LA });
  const stranger = await buddyUser({ timezone: LA });
  await pairUp(me.id, sam.id);
  const before = (await getSocialHome(me.id, NIGHT)).camp;
  expect(before).toMatchObject({ members: 2, awake: 2, asleep: 0 });
  await prisma.goodnight.create({ data: { authorId: stranger.id, localDate: civilDateToUtcMidnight('2026-10-07'), at: new Date('2026-10-08T05:00:00Z'), onTime: true } });
  expect((await getSocialHome(me.id, NIGHT)).camp).toEqual(before);
});

it('by day the camp is not night and everyone is awake', async () => {
  const me = await buddyUser({ timezone: LA });
  const day = new Date('2026-10-07T20:00:00Z'); // 13:00
  expect((await getSocialHome(me.id, day)).camp).toEqual({ checkedIn: 0, members: 1, faces: [], faceColours: [], night: false, awake: 1, asleep: 0, goodnightOpen: false });
});

it('the goodnight window is mine: open at 17:30 with an 18:00 goal though not night, closed at 19:30 with no goal though night', async () => {
  const early = await buddyUser({ timezone: LA });
  await prisma.user.update({ where: { id: early.id }, data: { bedtimeGoal: '18:00' } });
  expect((await getSocialHome(early.id, new Date('2026-10-08T00:30:00Z'))).camp).toMatchObject({ night: false, goodnightOpen: true }); // 17:30
  const late = await buddyUser({ timezone: LA });
  expect((await getSocialHome(late.id, new Date('2026-10-08T02:30:00Z'))).camp).toMatchObject({ night: true, goodnightOpen: false }); // 19:30
});
