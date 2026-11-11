import { openNight, openSleep } from '../../src/navigation/sleepNavigation';

describe('sleepNavigation', () => {
  it('openSleep opens the Sleep page on a night, or on its default night', () => {
    const nav = { navigate: jest.fn() };
    openSleep(nav, '2026-10-08');
    openSleep(nav);
    expect(nav.navigate).toHaveBeenNthCalledWith(1, 'Sleep', { date: '2026-10-08' });
    expect(nav.navigate).toHaveBeenNthCalledWith(2, 'Sleep', undefined);
  });
  it('openNight is the Sleep page on that night (the Recovery Last night tile)', () => {
    const nav = { navigate: jest.fn() };
    openNight(nav, '2026-10-08');
    expect(nav.navigate).toHaveBeenCalledWith('Sleep', { date: '2026-10-08' });
  });
});
