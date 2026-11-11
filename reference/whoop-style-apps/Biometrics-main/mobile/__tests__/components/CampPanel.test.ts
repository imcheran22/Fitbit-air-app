import { nextStop, panelStops, revealScrollY, snapStop, stepStop } from '../../src/components/social/CampPanel';
import { PEEK_RESERVE } from '../../src/components/social/campSceneGeometry';

it('rests at Peek above the home indicator, Half 40% down and Full 11% down', () => {
  expect(panelStops(844, { top: 47, bottom: 34 })).toEqual({ peek: 844 - 140, half: 338, full: 93 });
  // No home indicator: Peek is just its content.
  expect(panelStops(667, { top: 20, bottom: 0 })).toEqual({ peek: 667 - 106, half: 267, full: 73 });
  // Full never goes under the status bar; Peek never takes more than the scene keeps clear.
  expect(panelStops(667, { top: 80, bottom: 60 }).full).toBe(88);
  expect(panelStops(932, { top: 59, bottom: 60 }).peek).toBe(932 - PEEK_RESERVE);
});

it('a slow release snaps to the nearest stop, never in between', () => {
  const stops = panelStops(844, { top: 47, bottom: 34 }); // peek 704, half 338, full 93
  expect(snapStop(stops, 690, 0)).toBe('peek');
  expect(snapStop(stops, 360, 0)).toBe('half');
  expect(snapStop(stops, 120, 0)).toBe('full');
  expect(snapStop(stops, 500, -400)).toBe('half');
  expect(snapStop(stops, 540, 400)).toBe('peek');
  // Exactly at the flick speed is still slow.
  expect(snapStop(stops, 680, -500)).toBe('peek');
});

it('a flick (over 500 px/s) moves one stop in its direction, however short the drag', () => {
  const stops = panelStops(844, { top: 47, bottom: 34 });
  // A short flick up from Peek reaches Half, not Full; from Half, Full.
  expect(snapStop(stops, 690, -501)).toBe('half');
  expect(snapStop(stops, 690, -4000)).toBe('half');
  expect(snapStop(stops, 330, -900)).toBe('full');
  // Down: one stop below where the panel is.
  expect(snapStop(stops, 100, 900)).toBe('half');
  expect(snapStop(stops, 345, 900)).toBe('peek');
  // Past the end it stays at the end.
  expect(snapStop(stops, 93, -900)).toBe('full');
  expect(snapStop(stops, 704, 900)).toBe('peek');
});

it('steps: the handle goes up and wraps from Full to Peek; increment and decrement stop at the ends', () => {
  expect([nextStop('peek'), nextStop('half'), nextStop('full')]).toEqual(['half', 'full', 'peek']);
  expect([stepStop('peek', 1), stepStop('half', 1), stepStop('full', 1)]).toEqual(['half', 'full', 'full']);
  expect([stepStop('peek', -1), stepStop('half', -1), stepStop('full', -1)]).toEqual(['peek', 'peek', 'half']);
});

it('scrolls the composer above the keyboard on a short phone: Share in view, the input never under the header', () => {
  // 667 tall, keyboard 336, at Half (lifted to Full, 73), a 110-px handle and fire block: 148 px left in view.
  const base = { height: 667, keyboard: 336, stopTop: 267, full: 73, header: 110 };
  // Input at 150, Share's bottom at 270 (no chips): Share's bottom + 12 at the view's bottom.
  expect(revealScrollY({ ...base, top: 150, bottom: 270 })).toBe(270 + 12 - 148);
  // A taller composer (chips showing) keeps the input in view instead.
  expect(revealScrollY({ ...base, top: 120, bottom: 360 })).toBe(112);
  // Room to spare: no scroll.
  expect(revealScrollY({ ...base, keyboard: 0, stopTop: 93, top: 120, bottom: 260 })).toBe(0);
});
