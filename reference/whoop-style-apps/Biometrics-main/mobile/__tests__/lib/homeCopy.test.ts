import { HOME_COPY as C, sceneName } from '../../src/lib/homeCopy';

it('cuts a buddy name over 8 characters to 7 plus "…", by character', () => {
  expect(sceneName('Ava')).toBe('AVA');
  expect(sceneName('Jonathan')).toBe('JONATHAN');
  expect(sceneName('Bartholomew')).toBe('BARTHOL…');
  expect(sceneName('😀😀😀😀😀😀😀😀😀')).toBe('😀😀😀😀😀😀😀…');
});

it('words the tags\' spoken labels as the spec does', () => {
  expect(C.tags.sleepLabel(78, '7h 12m')).toBe('Bed: sleep 78, 7h 12m. Open Sleep');
  expect(C.tags.sleepLabel(null, null)).toBe('Bed: sleep, no reading yet. Open Sleep');
  expect(C.tags.tomorrowLabel({ low: 68, high: 76 })).toBe('Calendar: tomorrow likely 68 to 76. Open Tomorrow');
  expect(C.tags.tomorrowLabel(null)).toBe('Calendar: tomorrow, no reading yet. Open Tomorrow');
  expect(C.tags.recoveryLabel({ score: 68, weather: 'mostlyClear', band: 'scoreGood' })).toBe('Sky: recovery 68, mostly clear, Good. Open Recovery');
  expect(C.tags.recoveryLabel(null)).toBe('Sky: recovery, no reading yet. Open Recovery');
  expect(C.tags.recapsLabel(1)).toBe('Mailbox: recaps, 1 new. Open Recaps');
  expect(C.tags.recapsLabel(0)).toBe('Mailbox: recaps, no new recaps. Open Recaps');
});

it('speaks the Tomorrow tile\'s line, without a doubled full stop', () => {
  expect(C.tiles.tomorrowLabel({ low: 40, high: 80 }, 'Bed by 23:00')).toBe('Tomorrow likely 40 to 80. Bed by 23:00. Open Tomorrow');
  expect(C.tiles.tomorrowLabel(null, 'Check back later.')).toBe('Tomorrow. Check back later. Open Tomorrow');
  expect(C.tiles.tomorrowLabel(null, null)).toBe('Tomorrow, no reading yet. Open Tomorrow');
});

it('words the buddy tags, the header and the hints', () => {
  expect(C.buddies.all(5)).toBe('ALL 5 →');
  expect(C.buddies.requests(1)).toBe('1 REQUEST →');
  expect(C.buddies.requests(3)).toBe('3 REQUESTS →');
  expect(C.buddies.label('Bartholomew', 'Feeling great')).toBe('Bartholomew, Feeling great. Open their week');
  expect(C.header.date(new Date(2026, 9, 13, 9, 0))).toBe('Tue, Oct 13');
  expect(C.today.night('23:00')).toBe('Wind down · bed by 23:00');
  expect(C.today.night(null)).toBe('Wind down');
  expect(C.askCoach(true)).toBe('Ask Coach · see what’s shared first');
  expect(C.askCoach(false)).toBe('Ask Coach about today');
});
