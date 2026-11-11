// Thinking attachments (spec §4): pixel frames on a 36×32 stage, ported from
// docs/design/pixel-coaches/04-thinking-attachments.html. Pure.
import type { CharacterMood } from '../types';
import type { EyeMode } from '../sprites/compose';
import type { ThinkingAttachmentId } from '../thinking';

export type Cell = readonly [number, number, string];
export const STAGE_W = 36;
export const STAGE_H = 32;
export const ATTACHMENT_LOOP_MS = 3200;
export const ATTACHMENT_DONE_MS = 800;

const OUT = '#3A3D48', LIGHT = '#F1F5F9', GREY = '#94A3B8', DIM = '#52525B', GOLD = '#FDE047', GOLD2 = '#FEF08A';

function glyph(rows: string[], x0: number, y0: number, pal: Record<string, string>, outline: string | null = OUT): Cell[] {
  const cells: Cell[] = [];
  const on = new Set<string>();
  rows.forEach((r, y) => [...r].forEach((L, x) => {
    if (L !== '.') { cells.push([x0 + x, y0 + y, pal[L]!]); on.add(`${x0 + x},${y0 + y}`); }
  }));
  if (!outline) return cells;
  const ring = new Set<string>();
  for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const k = `${x + dx},${y + dy}`;
    if (!on.has(k)) ring.add(k);
  }
  return [...[...ring].map((k) => { const [x, y] = k.split(',').map(Number); return [x!, y!, outline] as Cell; }), ...cells];
}

function roundRect(x0: number, y0: number, w: number, h: number, fill: string): Cell[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) r += (x === 0 || x === w - 1) && (y === 0 || y === h - 1) ? '.' : 'f';
    rows.push(r);
  }
  return glyph(rows, x0, y0, { f: fill });
}

type Draw = (t: number, done: boolean) => Cell[];

const DRAW: Record<ThinkingAttachmentId, Draw> = {
  bulb(t, done) {
    const flick = done ? 2 : Math.floor(t / 130) % 7 === 0 ? 1 : Math.floor(t / 260) % 3 === 0 ? 1 : 0;
    const glass = flick === 2 ? GOLD : flick === 1 ? '#A8A29E' : DIM;
    const fil = flick === 2 ? '#FFFFFF' : flick === 1 ? '#FB923C' : '#78716C';
    const c = glyph(['.ggggg.', 'gggggHg', 'ggggggH', 'gg.f.gg', 'ggf.fgg', '.ggggg.', '..ggg..', '..mmm..', '..MMM..', '..mmm..'], 26, 1,
      { g: glass, H: flick === 2 ? '#FFFFFF' : '#A1A1AA', f: fil, m: '#94A3B8', M: '#64748B' });
    if (flick === 2) {
      // The mockup's rays that land on the stage (its x < 36, y >= 0 filter).
      for (const [x, y] of [[23, 1], [24, 2], [22, 5], [23, 5]] as const) c.push([x, y, GOLD2]);
      for (const [x, y] of [[24, 0], [34, 0], [24, 9], [34, 9]] as const) c.push([x, y, 'rgba(253,224,71,0.45)']);
    }
    return c;
  },
  cloud(t, done) {
    const k = done ? 3 : (Math.floor(t / 400) % 3) + 1;
    const c = roundRect(21, 0, 14, 9, LIGHT);
    for (let i = 0; i < 3; i++) {
      const col = i < k ? (done ? '#9333EA' : '#1E293B') : '#CBD5E1';
      const x = 24 + i * 3;
      c.push([x, 4, col], [x + 1, 4, col]);
    }
    return [...c, ...glyph(['ff', 'ff'], 19, 10, { f: LIGHT }), ...glyph(['f'], 17, 13, { f: LIGHT })];
  },
  typing(t, done) {
    const p = Math.floor(t / 170) % 3;
    const c = [...roundRect(20, 1, 15, 8, LIGHT), ...glyph(['ff.', 'f..'], 20, 9, { f: LIGHT })];
    for (let i = 0; i < 3; i++) {
      const up = !done && i === p ? 1 : 0;
      const col = done ? '#22C55E' : i === p ? '#1E293B' : '#94A3B8';
      const x = 23 + i * 3;
      c.push([x, 4 - up, col], [x + 1, 4 - up, col], [x, 5 - up, col], [x + 1, 5 - up, col]);
    }
    return c;
  },
  hourglass(t, done) {
    const k = done ? 7 : Math.min(6, Math.floor(t / 340));
    const top = [[3, 3], [2, 2], [4, 2], [3, 2], [2, 1], [4, 1], [3, 1]] as const;
    const bot = [[2, 7], [4, 7], [3, 7], [2, 6], [4, 6], [3, 6], [3, 5]] as const;
    const c = glyph(['wwwwwww', '.g...g.', '.g...g.', '..g.g..', '...g...', '..g.g..', '.g...g.', '.g...g.', 'wwwwwww'], 27, 1, { w: '#B45309', g: '#CBD5E1' });
    top.slice(k).forEach(([x, y]) => c.push([27 + x, 1 + y, GOLD2]));
    bot.slice(0, k).forEach(([x, y]) => c.push([27 + x, 1 + y, GOLD]));
    if (!done && Math.floor(t / 170) % 2 === 0) c.push([30, 5, GOLD2]);
    if (done) for (const [x, y] of [[25, 0], [35, 0], [25, 10], [35, 10]] as const) c.push([x, y, GOLD2]);
    return c;
  },
  gears(t, done) {
    const f = Math.floor(t / (done ? 90 : 220)) % 2;
    const A = ['...t...', '..ggg..', '.ggggg.', 'tgg.ggt', '.ggggg.', '..ggg..', '...t...'];
    const B = ['.t...t.', '..ggg..', '.ggggg.', '.gg.gg.', '.ggggg.', '..ggg..', '.t...t.'];
    const second = done ? GOLD : '#94A3B8';
    return [...glyph(f ? A : B, 23, 1, { g: '#CBD5E1', t: '#CBD5E1' }), ...glyph(f ? B : A, 29, 5, { g: second, t: second })];
  },
  question(t, done) {
    const bob = done ? 0 : Math.floor(t / 400) % 2;
    const Q = ['.qqq.', 'q...q', '....q', '...q.', '..q..', '.....', '..q..'];
    const X = ['.qq.', '.qq.', '.qq.', '.qq.', '.qq.', '....', '.qq.'];
    return done ? glyph(X, 28, 1, { q: GOLD }) : glyph(Q, 28, 1 + bob, { q: '#C4B5FD' });
  },
  sparkles(t, done) {
    const S = [['x'], ['.x.', 'xxx', '.x.'], ['..x..', '..x..', 'xxXxx', '..x..', '..x..']];
    const spots = [[23, 3], [30, 0], [32, 8]] as const;
    const c: Cell[] = [];
    spots.forEach(([x, y], i) => {
      const phase = done ? 2 : (Math.floor(t / 220) + i * 2) % 5;
      const g = S[Math.max(0, phase > 2 ? 4 - phase : phase)]!;
      const o = Math.floor(g.length / 2);
      g.forEach((r, yy) => [...r].forEach((L, xx) => { if (L !== '.') c.push([x + xx - o, y + yy - o + 2, L === 'X' ? '#FFFFFF' : GOLD2]); }));
    });
    return c;
  },
  clock(t, done) {
    const c = glyph(['..fff..', '.fffff.', 'fffffff', 'fffffff', 'fffffff', '.fffff.', '..fff..'], 27, 2, { f: done ? GOLD2 : LIGHT });
    const H = [[[0, -1], [0, -2]], [[1, -1], [2, -2]], [[1, 0], [2, 0]], [[1, 1], [2, 2]], [[0, 1], [0, 2]], [[-1, 1], [-2, 2]], [[-1, 0], [-2, 0]], [[-1, -1], [-2, -2]]] as const;
    const k = done ? 0 : Math.floor(t / 180) % 8;
    c.push([30, 5, '#1E293B']);
    for (const [dx, dy] of H[k]!) c.push([30 + dx, 5 + dy, '#1E293B']);
    if (done) for (const [x, y] of [[26, 1], [34, 1], [30, 0]] as const) c.push([x, y, GOLD]);
    return c;
  },
  spinner(t, done) {
    const ring = [[2, 0], [4, 1], [5, 3], [4, 5], [2, 6], [0, 5], [-1, 3], [0, 1]] as const;
    const head = Math.floor(t / 110) % 8;
    const c: Cell[] = [];
    ring.forEach(([x, y], i) => {
      const age = (head - i + 8) % 8;
      const col = done ? '#22C55E' : age === 0 ? LIGHT : age === 1 ? '#CBD5E1' : age === 2 ? GREY : OUT;
      c.push([28 + x, 2 + y, col], [29 + x, 2 + y, col], [28 + x, 3 + y, col], [29 + x, 3 + y, col]);
    });
    return c;
  },
};

// Attachments below this size don't read; the thinking text carries it (spec §4).
export const MIN_ATTACHMENT_SIZE = 24;

/** Whether a coach of this size draws the attachment stage (and so is size × 36/24 wide). */
export function drawsAttachment(attachment: ThinkingAttachmentId | null, size: number): boolean {
  return attachment !== null && size >= MIN_ATTACHMENT_SIZE;
}

export function attachmentFrame(id: ThinkingAttachmentId, tMs: number, done: boolean): readonly Cell[] {
  const t = ((tMs % ATTACHMENT_LOOP_MS) + ATTACHMENT_LOOP_MS) % ATTACHMENT_LOOP_MS;
  return DRAW[id](t, done).filter(([x, y]) => x >= 0 && y >= 0 && x < STAGE_W && y < STAGE_H);
}

/**
 * Whether the attachment is drawn (spec §3/§4): throughout thinking; while
 * answering only its "answer's here" frame, for the first ATTACHMENT_DONE_MS,
 * then hidden for the rest of the answering mood.
 */
export function showsAttachment(mood: CharacterMood, msSinceAnswering: number): boolean {
  if (mood === 'thinking') return true;
  return mood === 'answering' && msSinceAnswering < ATTACHMENT_DONE_MS;
}

/**
 * The sprite-clock time the answering mood started: latched on the first
 * running tick (t > 0; a clock that hasn't ticked yet, or a paused one, reads
 * 0) and cleared by any other mood.
 */
export function answeringStart(prev: number | null, mood: CharacterMood, t: number): number | null {
  if (mood !== 'answering') return null;
  return prev ?? (t > 0 ? t : null);
}

export function moodEyes(mood: CharacterMood, blinking: boolean): EyeMode {
  if (mood === 'thinking') return 'up';
  if (mood === 'answering') return 'happy';
  if (mood === 'resting') return 'shut';
  return blinking ? 'blink' : 'open';
}
