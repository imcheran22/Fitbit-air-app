import fs from 'fs';
import path from 'path';
import { openingTag, sourceFiles } from '../../jest-mocks/sourceScan';

// The type system (docs/superpowers/specs/2026-10-08-type-system-design.md):
// every text size in src is a token from tailwind.config.js (text-score,
// text-number, text-display, text-heading, text-headline, text-body,
// text-caption, text-fine, text-page-title, text-label), the face comes from
// ui/text, and every TextInput takes the shared input style. This guard reads
// every file under src as text, comments included (so name a token in a
// comment, never a banned class), and fails on:
//   - an arbitrary size: text-[13px], text-[.8rem], text-[length:13px] (an
//     arbitrary colour, text-[#…], text-[rgb(…)] or text-[var(…)], is fine)
//   - a stock size: text-xs, sm, base, lg, xl, 2xl … 9xl (NativeWind's rem is
//     14, so these draw 12.5% small, and they are not the scale)
//   - an old token: text-eyebrow, text-numeral*, text-display-sm, text-display-lg
//   - the serif: font-display
//   - an inline fontFamily: or fontSize:, quoted keys included
//   - a <TextInput> or <Animated.TextInput> whose own tag does not use
//     inputTextStyle or inputNumberStyle
//
// EXEMPT lists the files that keep some of these for good, with how many and
// why. PENDING lists the files the migration has not reached yet; each
// migration task deletes its files from it. A count must match exactly: more is
// a new violation, fewer is a stale entry.

const SRC = path.join(__dirname, '../../src');

type Rule = { id: string; pattern: RegExp; fix: string };

const RULES: Rule[] = [
  { id: 'arbitrary size', pattern: /(?<![\w-])text-\[(?!#|rgba?\(|var\()[^\]]*\]/g, fix: 'use a type token (text-body, text-caption, …)' },
  { id: 'stock size', pattern: /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g, fix: 'use a type token (text-body, text-caption, …)' },
  { id: 'old token', pattern: /(?<![\w-])text-(?:eyebrow|numeral(?:-sm|-lg|-xl)?|display-(?:sm|lg))(?![\w-])/g, fix: 'see the migration map (spec §4)' },
  { id: 'serif', pattern: /(?<![\w-])font-display(?![\w-])/g, fix: 'the serif is gone: PageTitle, text-heading or text-display' },
  { id: 'inline font', pattern: /(?<!\w)['"]?font(?:Family|Size)['"]?\s*:/g, fix: 'use a type token on a ui/text Text' },
];
// A JSX TextInput tag (Animated's too), not a type argument such as useRef<TextInput>.
const INPUT_START = /(?<![\w.])<(?:Animated\.)?TextInput(?=[\s/>])/g;
const INPUT_STYLE = /\binput(?:Text|Number)Style\b/;

type Hit = { file: string; line: number; rule: string; text: string };
type Exception = { file: string; count: number; reason: string };

// prettier-ignore
const EXEMPT: Exception[] = [
  // The Campfire scene (spec §6): its Silkscreen sizes (8–14), letter-spacing and Geist text render exactly as before.
  { file: 'components/social/CampScene.tsx', count: 11, reason: 'the Campfire scene: labels, z-z-z, note bubbles and kicker at their own pixel sizes (spec §6)' },
  { file: 'components/social/CampBanner.tsx', count: 3, reason: 'the camp banner: THE CAMP in pixel 10 over its line (spec §6)' },
  { file: 'components/social/CampNoteCard.tsx', count: 7, reason: 'the Campfire note card keeps its panel text as it is (spec §6); only its input took inputTextStyle (spec §3)' },
  { file: 'screens/CampfireScreen.tsx', count: 13, reason: 'the Campfire scene chrome and panel text keep their sizes (spec §6); only its two panel labels became SectionLabels' },
  // Share cards (spec §5): images scaled by u() / a(), so their sizes stay inline; Geist and pixel only.
  { file: 'components/recap/WeeklyStoryView.tsx', count: 39, reason: 'the weekly story share card, sized in card units (spec §5)' },
  { file: 'components/recap/RecapCardView.tsx', count: 14, reason: 'the monthly recap share card, sized in card units (spec §5)' },
  { file: 'components/recap/YearPixelsView.tsx', count: 16, reason: 'the Year in Pixels share card, sized in card units (spec §5)' },
  { file: 'components/recap/RecapShelf.tsx', count: 4, reason: "the recap shelf's cover tiles: a pixel badge and a title drawn with the tile (spec §5)" },
  { file: 'components/achievements/BadgeShareCard.tsx', count: 6, reason: 'the badge share card, sized in card units (spec §5)' },
  { file: 'components/achievements/CelebrationModal.tsx', count: 10, reason: 'the badge celebration, drawn like the share card (spec §5)' },
  { file: 'lib/recapShare.ts', count: 2, reason: "the share cards' quote fitting: fontSize is a number it computes, not a style" },
  // SVG <Text> sized in chart units would be exempt too (spec §5); there is none today: the charts draw their labels with ui/text.
  // The primitives that turn tokens into styles.
  { file: 'components/ui/text.tsx', count: 1, reason: 'the Text primitive sets fontFamily from the class list' },
  { file: 'components/ui/input-style.ts', count: 4, reason: 'the shared input styles: Geist at the body size (spec §3)' },
  { file: 'navigation/headerStyle.tsx', count: 4, reason: 'native headers sit outside NativeWind: Silkscreen 15 (spec §3); the style and its return type, which HeaderTitle draws with' },
  { file: 'screens/SignInScreen.tsx', count: 1, reason: 'the app name in the page-title face at 28, a one-off size (spec §4)' },
];

// prettier-ignore
const PENDING: Exception[] = [];

const ALLOWED = [...EXEMPT, ...PENDING];

const lineOf = (source: string, index: number) => source.slice(0, index).split('\n').length;

/** Every guard hit in one file. */
function findViolations(file: string, source: string): Hit[] {
  const hits: Hit[] = [];
  for (const rule of RULES) {
    for (const m of source.matchAll(rule.pattern)) {
      hits.push({ file, line: lineOf(source, m.index!), rule: rule.id, text: `${m[0]}: ${rule.fix}` });
    }
  }
  for (const m of source.matchAll(INPUT_START)) {
    if (!INPUT_STYLE.test(openingTag(source, m.index!))) {
      hits.push({ file, line: lineOf(source, m.index!), rule: 'input', text: '<TextInput> without inputTextStyle: style={[inputTextStyle, …]}' });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

/** Each hit in a file with no entry, and each entry whose file has a different number of hits. */
function violations(hits: Hit[], allowed: Exception[]): string[] {
  const out: string[] = [];
  const files = [...new Set(hits.map((h) => h.file))];
  for (const file of files) {
    const mine = hits.filter((h) => h.file === file);
    const entry = allowed.find((a) => a.file === file);
    if (!entry) for (const h of mine) out.push(`src/${h.file}:${h.line} ${h.rule}, ${h.text}`);
    else if (mine.length !== entry.count) out.push(`src/${file}: expected ${entry.count}, found ${mine.length} (lines ${mine.map((h) => h.line).join(', ')})`);
  }
  for (const a of allowed) if (!files.includes(a.file)) out.push(`src/${a.file}: expected ${a.count}, found 0`);
  return out;
}

function scan(): Hit[] {
  return sourceFiles(SRC)
    .map((full) => path.relative(SRC, full).split(path.sep).join('/'))
    .flatMap((file) => findViolations(file, fs.readFileSync(path.join(SRC, file), 'utf8')));
}

// One file's entries, for checking that file alone (the rest would read as stale).
const entriesFor = (file: string) => ALLOWED.filter((a) => a.file === file);

describe('typography convention', () => {
  it('has nothing left to migrate: only the permanent exemptions remain', () => {
    expect(PENDING).toEqual([]);
    expect(EXEMPT.map((a) => a.file).sort()).toEqual(
      [
        'components/achievements/BadgeShareCard.tsx',
        'components/achievements/CelebrationModal.tsx',
        'components/recap/RecapCardView.tsx',
        'components/recap/RecapShelf.tsx',
        'components/recap/WeeklyStoryView.tsx',
        'components/recap/YearPixelsView.tsx',
        'components/social/CampBanner.tsx',
        'components/social/CampNoteCard.tsx',
        'components/social/CampScene.tsx',
        'components/ui/input-style.ts',
        'components/ui/text.tsx',
        'lib/recapShare.ts',
        'navigation/headerStyle.tsx',
        'screens/CampfireScreen.tsx',
        'screens/SignInScreen.tsx',
      ].sort(),
    );
  });

  it('uses the type scale everywhere outside the listed files', () => {
    expect(violations(scan(), ALLOWED)).toEqual([]);
  });

  it('gives every entry one file, a count and a reason, and keeps exempt and pending apart', () => {
    const files = ALLOWED.map((a) => a.file);
    expect(new Set(files).size).toBe(files.length);
    for (const a of ALLOWED) {
      expect(a.reason.trim()).not.toBe('');
      expect(a.count).toBeGreaterThan(0);
    }
  });

  it('fails a deliberately re-added text-[13px] in a migrated file', () => {
    const file = 'components/ui/section-label.tsx';
    const source = fs.readFileSync(path.join(SRC, file), 'utf8') + '\nexport const Again = () => <Text className="text-[13px] text-muted-foreground">x</Text>;\n';
    const line = source.split('\n').length - 1;
    expect(violations(findViolations(file, source), entriesFor(file))).toEqual([
      `src/${file}:${line} arbitrary size, text-[13px]: use a type token (text-body, text-caption, …)`,
    ]);
  });

  it('fails one more inline size in an exempt file', () => {
    const file = 'components/social/CampScene.tsx';
    const source = fs.readFileSync(path.join(SRC, file), 'utf8') + '\nconst extra = { fontSize: 9 };\n';
    expect(violations(findViolations(file, source), entriesFor(file))).toEqual([expect.stringMatching(/^src\/components\/social\/CampScene\.tsx: expected 11, found 12/)]);
  });

  it('catches every stock size, in any variant, but not the tokens or the colours', () => {
    for (const cls of ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'dark:text-sm']) {
      expect(findViolations('x.tsx', `<Text className="${cls}">x</Text>`)).toHaveLength(1);
    }
    expect(findViolations('x.tsx', '<ScoreRing numeralClassName="text-lg" />')).toHaveLength(1);
    const fine = ['text-body', 'text-caption', 'text-fine', 'text-label', 'text-page-title', 'text-score', 'text-score-excellent', 'text-display', 'text-[#A5B4FC]', 'text-muted-foreground'];
    for (const cls of fine) expect(findViolations('x.tsx', `<Text className="${cls}">x</Text>`)).toEqual([]);
  });

  it('catches an arbitrary size that does not start with a digit, but not an arbitrary colour', () => {
    for (const cls of ['text-[.8rem]', 'text-[length:13px]', 'text-[calc(1rem+2px)]', 'md:text-[.9em]']) {
      expect(findViolations('x.tsx', `<Text className="${cls}">x</Text>`).map((h) => h.rule)).toEqual(['arbitrary size']);
    }
    for (const cls of ['text-[#A5B4FC]', 'text-[rgb(1,2,3)]', 'text-[rgba(1,2,3,0.5)]', 'text-[var(--muted)]']) {
      expect(findViolations('x.tsx', `<Text className="${cls}">x</Text>`)).toEqual([]);
    }
  });

  it('catches the old tokens and the serif', () => {
    for (const cls of ['text-eyebrow', 'text-numeral', 'text-numeral-sm', 'text-numeral-lg', 'text-numeral-xl', 'text-display-sm', 'text-display-lg', 'font-display']) {
      expect(findViolations('x.tsx', `<Text className="${cls}">x</Text>`)).toHaveLength(1);
    }
  });

  it('catches an inline fontFamily or fontSize, and nothing else in a style', () => {
    expect(findViolations('x.tsx', '<Text style={{ fontSize: 12 }}>x</Text>')).toHaveLength(1);
    expect(findViolations('x.tsx', '<Text style={{ fontFamily: FONTS.sans, fontSize: 12 }}>x</Text>')).toHaveLength(2);
    expect(findViolations('x.tsx', "<Text style={{ fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: 1 }}>x</Text>")).toEqual([]);
  });

  it('catches a quoted fontSize or fontFamily key, once each', () => {
    expect(findViolations('x.tsx', "const s = { 'fontSize': 12 };").map((h) => h.rule)).toEqual(['inline font']);
    expect(findViolations('x.tsx', 'const s = { "fontSize": 12 };').map((h) => h.rule)).toEqual(['inline font']);
    expect(findViolations('x.tsx', "const s = { 'fontFamily': FONTS.sans };").map((h) => h.rule)).toEqual(['inline font']);
    expect(findViolations('x.tsx', 'const s = { "fontFamily": "Menlo", fontSize: 9 };').map((h) => h.rule)).toEqual(['inline font', 'inline font']);
  });

  it('catches a TextInput without the shared input style, and only a JSX tag', () => {
    expect(findViolations('x.tsx', '<TextInput value={v} className="flex-1" />').map((h) => h.rule)).toEqual(['input']);
    expect(findViolations('x.tsx', '<TextInput /* inputTextStyle */ value={v} />').map((h) => h.rule)).toEqual(['input']);
    expect(findViolations('x.tsx', '<TextInput value={v} style={[inputTextStyle, { height: 40 }]} />')).toEqual([]);
    expect(findViolations('x.tsx', '<TextInput\n  value={v}\n  style={inputNumberStyle}\n/>')).toEqual([]);
    expect(findViolations('x.tsx', 'const input = useRef<TextInput>(null); type P = React.RefObject<TextInput | null>;')).toEqual([]);
  });

  it('catches an Animated.TextInput without the shared input style', () => {
    expect(findViolations('x.tsx', '<Animated.TextInput value={v} style={animatedStyle} />').map((h) => h.rule)).toEqual(['input']);
    expect(findViolations('x.tsx', '<Animated.TextInput value={v} style={[inputTextStyle, animatedStyle]} />')).toEqual([]);
    expect(findViolations('x.tsx', 'const r = useRef<Animated.TextInput>(null);')).toEqual([]);
  });

  it('flags a stale entry', () => {
    expect(violations([], [{ file: 'x.tsx', count: 1, reason: 'gone' }])).toEqual(['src/x.tsx: expected 1, found 0']);
  });
});
