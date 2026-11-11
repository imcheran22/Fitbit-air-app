import { composeSprite, narrowHalf, SPRITE_SIZE, darkenHex } from '../../src/components/characters/sprites/compose';
import { SPRITES } from '../../src/components/characters/sprites/data';
import { CHARACTER_IDS } from '../../src/components/characters/types';

const N = SPRITE_SIZE;
const at = (g: readonly (string | null)[], x: number, y: number) => g[y * N + x];
const cols = (g: readonly (string | null)[]) => {
  const used = new Set<number>();
  g.forEach((c, i) => c && used.add(i % N));
  return used.size;
};

describe('composeSprite', () => {
  it.each(CHARACTER_IDS)('%s is mirror-symmetric in every eye mode', (id) => {
    for (const mode of ['open', 'blink', 'up', 'happy', 'shut'] as const) {
      const g = composeSprite(SPRITES[id], mode);
      for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) expect(at(g, x, y)).toBe(at(g, N - 1 - x, y));
    }
  });

  it('narrows by the configured columns', () => {
    const wide = (id: keyof typeof SPRITES) => cols(composeSprite({ ...SPRITES[id], slim: 0 }, 'open'));
    for (const id of CHARACTER_IDS) {
      const slim = SPRITES[id].slim;
      expect(cols(composeSprite(SPRITES[id], 'open'))).toBe(wide(id) - slim * 2);
    }
    expect(SPRITES.luna.slim).toBe(0);
    expect(SPRITES.sprout.slim).toBe(2);
    expect(SPRITES.kit.slim).toBe(1);
  });

  it('only outlines next to solid cells, in the soft outline colour', () => {
    const def = SPRITES.mochi;
    const outline = darkenHex(def.palette.s ?? def.palette.b!, 0.6);
    const g = composeSprite(def, 'open');
    const palette = new Set(Object.values(def.palette));
    g.forEach((c, i) => {
      if (c === outline && !palette.has(c)) {
        const x = i % N, y = Math.floor(i / N);
        const nbrs = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at(g, x + dx!, y + dy!));
        expect(nbrs.some((n) => n && n !== outline)).toBe(true);
      }
    });
  });

  it('never outlines sparkles, shadows or tentacles', () => {
    const g = composeSprite(SPRITES.jelly, 'open');
    const tentacle = SPRITES.jelly.palette.t!;
    const outline = darkenHex(SPRITES.jelly.palette.s!, 0.6);
    g.forEach((c, i) => {
      if (c !== tentacle) return;
      const x = i % N, y = Math.floor(i / N);
      // the cell below the lowest tentacle pixel is empty, not outline
      if (y === N - 1 || at(g, x, y + 1) === tentacle) return;
      expect(at(g, x, y + 1)).not.toBe(outline);
    });
  });

  it('moves eyes for each mood and keeps the cell count stable', () => {
    const open = composeSprite(SPRITES.kit, 'open');
    const up = composeSprite(SPRITES.kit, 'up');
    const eye = SPRITES.kit.palette.e!;
    const rows = (g: readonly (string | null)[]) => g.map((c, i) => (c === eye ? Math.floor(i / N) : -1)).filter((r) => r >= 0);
    expect(Math.min(...rows(up))).toBe(Math.min(...rows(open)) - 1);
    expect(composeSprite(SPRITES.kit, 'shut')).not.toEqual(open);
    expect(composeSprite(SPRITES.kit, 'happy')).not.toEqual(open);
  });

  it('dims every hex colour for resting', () => {
    const g = composeSprite(SPRITES.mochi, 'shut', { dim: true });
    const plain = composeSprite(SPRITES.mochi, 'shut');
    expect(g.filter(Boolean)).toHaveLength(plain.filter(Boolean).length);
    expect(g).not.toEqual(plain);
  });

  it('treats Luna (no eyes) as unchanged by eye modes', () => {
    expect(composeSprite(SPRITES.luna, 'up')).toEqual(composeSprite(SPRITES.luna, 'open'));
  });

  it('memoises', () => {
    expect(composeSprite(SPRITES.boba, 'open')).toBe(composeSprite(SPRITES.boba, 'open'));
  });
});

describe('narrowHalf', () => {
  it('keeps 12 columns and pads the outside', () => {
    const half = Array.from({ length: 24 }, () => '..bbbbbbbbbb');
    const out = narrowHalf(half, 2);
    expect(out.every((r) => r.length === 12)).toBe(true);
    expect(out[0]!.startsWith('....')).toBe(true);
  });
});
