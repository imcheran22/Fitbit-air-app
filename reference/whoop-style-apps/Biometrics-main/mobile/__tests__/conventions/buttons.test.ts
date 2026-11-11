import fs from 'fs';
import path from 'path';
import { openingTag, sourceFiles } from '../../jest-mocks/sourceScan';

// The button standard (src/components/ui/README.md): every button and text
// link is components/ui/button. This guard reads every file under src as text
// and fails on a hand-rolled one: a raw Pressable / PressableScale / Touchable*
// / Text that says it is a button or a link (accessibilityRole="button" |
// "link", or role=), or whose role is computed (accessibilityRole={x}), which
// could be either.
//
// The only raw pressables allowed are the ones that are not buttons in the
// design sense (rows, navigating cards, tabs, toggle chips, story rings, tap
// zones, an inline span in a sentence) plus one documented custom CTA. Each is
// listed below by file and key, with how many times it occurs and why. The key
// is the element's testID; a testID passed in from props (testID={testID}) is
// keyed by its enclosing component instead (`RecapRow:testID`), so it is
// unique. The count makes a second raw button that reuses a key fail too. A
// new entry needs the same: if it is a button or a link, use <Button>.

const SRC = path.join(__dirname, '../../src');
const BUTTON_FILE = 'components/ui/button.tsx';

const RAW_TAGS = [
  'Pressable',
  'PressableScale',
  'AnimatedPressable',
  'Animated.Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'Text',
  'Animated.Text',
];
const TAG_START = new RegExp(`<(${RAW_TAGS.map((t) => t.replace('.', '\\.')).join('|')})(?=[\\s/>])`, 'g');
// accessibilityRole="button", role='link', accessibilityRole={'button'}, role={"link"}.
const BUTTON_ROLE = /\b(?:accessibilityRole|role)\s*=\s*(?:\{\s*)?(['"`])(?:button|link)\1/;
// accessibilityRole={role}, role={a ? 'button' : undefined}: anything in braces but a lone string literal.
const COMPUTED_ROLE = /\b(?:accessibilityRole|role)\s*=\s*\{(?!\s*(['"`])[^'"`]*\1\s*\})/;
const TEST_ID = /\btestID\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\}|\{\s*([^}]*?)\s*\})/;

type Exception = { file: string; key: string; count: number; reason: string };

// prettier-ignore
const ALLOWED: Exception[] = [
  // List and settings rows
  { file: 'components/ui/settings-list.tsx', key: 'SettingsRow:testID', count: 1, reason: 'the settings row primitive (its caller sets a button, link or radio role)' },
  { file: 'components/buddies/BuddyListRow.tsx', key: 'buddy-row-${row.id}', count: 1, reason: 'a buddy list row that opens the buddy' },
  { file: 'components/chats/ChatRow.tsx', key: 'chat-row-${row.buddy.id}', count: 1, reason: 'a conversation row that opens the thread' },
  { file: 'components/chats/NewChatSheet.tsx', key: 'new-chat-${row.id}', count: 1, reason: 'a buddy row in the new-message picker' },
  { file: 'screens/BadgesScreen.tsx', key: 'badges-row-${family}', count: 1, reason: 'a badge family row that opens its detail' },
  { file: 'screens/CoachScreen.tsx', key: 'coach-suggestion-${index}', count: 1, reason: 'a suggested-question row in the empty chat' },
  { file: 'components/coach/PromptBar.tsx', key: 'coach-command-${command.key}', count: 1, reason: 'a row of the slash-command menu' },
  { file: 'components/sleep/BedtimeGoalRow.tsx', key: 'sleep-goal-row', count: 1, reason: 'the bedtime goal row on the Sleep page (a card that navigates)' },
  // Cards and tiles that navigate
  { file: 'screens/RecapsScreen.tsx', key: 'RecapRow:testID', count: 1, reason: 'RecapRow, a recap card that opens the recap' },
  { file: 'screens/RecapsScreen.tsx', key: 'recaps-year', count: 1, reason: 'the Year in Pixels card' },
  { file: 'screens/RecapScreen.tsx', key: 'recap-story-preview', count: 1, reason: 'the story preview card that opens the story viewer' },
  { file: 'screens/MetricsScreen.tsx', key: 'trend-card-${type}', count: 1, reason: 'a metric trend card that opens its detail' },
  { file: 'screens/MetricsScreen.tsx', key: 'patterns-button', count: 1, reason: 'the Patterns card' },
  { file: 'screens/MeetYourCoachScreen.tsx', key: 'meet-tile-${id}', count: 1, reason: 'a coach tile in the picker grid' },
  { file: 'components/coach-digest-card.tsx', key: 'coach-digest-card', count: 1, reason: 'the digest card that opens the coach' },
  { file: 'components/home/HomeScene.tsx', key: 'HotTag:testID', count: 1, reason: 'a hot tag on the Home scene (SLEEP, TMRW, RECOVERY, RECAPS) that opens its page' },
  { file: 'components/home/HomeScene.tsx', key: 'home-buddy-${b.id}', count: 1, reason: "a buddy's name tag on the Home scene that opens their week" },
  { file: 'components/home/HomeScene.tsx', key: 'home-scene-all', count: 1, reason: 'the scene\'s "ALL n →" tag that opens Social' },
  { file: 'components/home/TodayTiles.tsx', key: 'TodayTile:testID', count: 1, reason: 'a Home Today tile (Recovery, Sleep, Tomorrow) that opens its page' },
  { file: 'components/home/metric-tile.tsx', key: 'metric-card-${type}', count: 1, reason: 'a home metric tile' },
  { file: 'components/sleep/SleepMonthCard.tsx', key: 'sleep-month-day-${d}', count: 1, reason: 'a past day in the Sleep month that selects that night' },
  { file: 'components/recap/RecapShelf.tsx', key: 'recap-shelf-item-${item.id}', count: 1, reason: 'a recap card on the shelf' },
  { file: 'components/achievements/BadgesCard.tsx', key: 'badges-card-${family}', count: 1, reason: 'a badge tile on the home card' },
  { file: 'components/activity/UsualTiles.tsx', key: 'usual-tile-${tile.type}', count: 1, reason: 'a usual-range row that opens the metric' },
  { file: 'components/activity/ThisWeek.tsx', key: 'week-row-${row.date}', count: 1, reason: "a This week row that opens the day's Recovery page" },
  { file: 'components/activity-heatmap.tsx', key: 'activity-cal-${c.date}', count: 1, reason: 'a calendar day that opens its steps sheet, its night on the Sleep page or its Recovery page' },
  { file: 'components/activity-sheets.tsx', key: 'LinkTile:testID', count: 1, reason: 'LinkTile, a tile that opens that night on the Sleep page' },
  { file: 'components/sleep/WindowChart.tsx', key: 'sleep-window-bar-${bar.date}', count: 1, reason: 'a chart bar that selects its night' },
  { file: 'components/coach/TodayBar.tsx', key: 'today-bar-${bar.metric}', count: 1, reason: 'a metric bar that asks the coach about it' },
  { file: 'components/social/CampBanner.tsx', key: 'camp-banner', count: 1, reason: 'the camp banner strip that opens the Campfire' },
  { file: 'components/recovery/LastSevenDays.tsx', key: 'recovery-day-${day.date}', count: 1, reason: 'a day column in the Last 7 days strip that opens that day' },
  { file: 'components/recovery/LastNightTile.tsx', key: 'recovery-last-night', count: 1, reason: 'the Last night tile that opens the night' },
  { file: 'components/recovery/RecoveryCalendar.tsx', key: 'recovery-cal-${cell.date}', count: 1, reason: 'a calendar day that opens that day' },
  // Tabs
  { file: 'navigation/FloatingTabBar.tsx', key: 'tab-${route.name}', count: 1, reason: 'a tab bar item' },
  // Story rings, avatars and scene characters
  { file: 'components/social/StoriesRow.tsx', key: 'story-me', count: 1, reason: 'my story ring' },
  { file: 'components/social/StoriesRow.tsx', key: 'story-${r.author.id}', count: 1, reason: "a buddy's story ring" },
  { file: 'components/chats/NotesRow.tsx', key: 'note-mine', count: 1, reason: 'my avatar with my note bubble in the Chats notes row' },
  { file: 'components/chats/NotesRow.tsx', key: 'note-${n.person.id}', count: 1, reason: "a buddy's avatar with their note bubble" },
  { file: 'components/home/HomeHeader.tsx', key: 'settings-button', count: 1, reason: 'the profile avatar (with its story ring) over the Home sky' },
  { file: 'components/profile/Passport.tsx', key: 'passport-recap', count: 1, reason: "the passport's KIP photo wearing a recap ring" },
  { file: 'components/profile/Passport.tsx', key: 'passport-stamp-${s.family}', count: 1, reason: 'a badge stamp on the passport' },
  { file: 'components/profile/CategoryGrid.tsx', key: 'profile-category-${category}', count: 1, reason: 'a Profile category card that opens its section' },
  { file: 'components/social/CampScene.tsx', key: 'camp-coach-${id}', count: 1, reason: 'a coach seat in the Campfire scene' },
  // Toggle and selection chips
  { file: 'components/habit-log-card.tsx', key: 'checkin-day-${day.habitDay}', count: 1, reason: 'a check-in day toggle cell' },
  // Inline spans inside a sentence
  { file: 'components/coach/CoachToday.tsx', key: 'today-span-${metric}', count: 1, reason: 'a metric word inside the coach sentence that asks about it' },
  // Backdrops and tap zones
  { file: 'components/ui/sheet.tsx', key: '${testID}-backdrop', count: 1, reason: 'the sheet backdrop (tap to dismiss)' },
  { file: 'screens/SocialStoryScreen.tsx', key: 'social-story-prev', count: 1, reason: 'the left story tap zone' },
  { file: 'screens/SocialStoryScreen.tsx', key: 'social-story-next', count: 1, reason: 'the right story tap zone' },
  // The documented custom exception
  { file: 'components/coach/AskCoachBar.tsx', key: 'ask-coach-button', count: 1, reason: 'Ask {coach}, a GlassSurface CTA with the character (the one documented custom CTA)' },
];

type Found = { file: string; line: number; tag: string; key: string };

/** The function component around `at`: the last `function X(` or `const X = (` before it. */
function enclosingComponent(source: string, at: number): string {
  const names = [...source.slice(0, at).matchAll(/(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*=\s*(?:React\.memo\()?\()/g)];
  const last = names[names.length - 1];
  return last ? (last[1] ?? last[2]) : '?';
}

/** Every raw pressable / Text in `source` that claims the button or link role, or computes its role. */
function findHandRolledButtons(file: string, source: string): Found[] {
  const found: Found[] = [];
  for (const match of source.matchAll(TAG_START)) {
    const tag = openingTag(source, match.index!);
    if (!BUTTON_ROLE.test(tag) && !COMPUTED_ROLE.test(tag)) continue;
    const id = tag.match(TEST_ID);
    // A literal or template testID names the element; a passed-in one (testID={testID}) does not, so its component does.
    const literal = id ? (id[1] ?? id[2] ?? id[3]) : undefined;
    const key = literal ?? `${enclosingComponent(source, match.index!)}:${id?.[4] ?? ''}`;
    found.push({ file, line: source.slice(0, match.index).split('\n').length, tag: match[1], key });
  }
  return found;
}

/**
 * Every way `found` breaks the allowlist: a site with no entry, and an entry
 * that matches a different number of sites than its count (more: a new raw
 * button reusing its key; fewer: stale).
 */
function violations(found: Found[], allowed: Exception[]): string[] {
  const out: string[] = [];
  for (const f of found) {
    if (!allowed.some((a) => a.file === f.file && a.key === f.key)) {
      out.push(`src/${f.file}:${f.line} <${f.tag} ${f.key}> is a hand-rolled button or link`);
    }
  }
  for (const a of allowed) {
    const n = found.filter((f) => f.file === a.file && f.key === a.key).length;
    if (n !== a.count) out.push(`src/${a.file} ${a.key}: expected ${a.count}, found ${n}`);
  }
  return out;
}

function scan(): Found[] {
  return sourceFiles(SRC)
    .map((full) => path.relative(SRC, full).split(path.sep).join('/'))
    .filter((file) => file !== BUTTON_FILE)
    .flatMap((file) => findHandRolledButtons(file, fs.readFileSync(path.join(SRC, file), 'utf8')));
}

// The button shape: every button and selectable option has Button's 8-px
// corners (rounded-lg), never a pill. This second scan fails on a <Button>, or
// a raw pressable (a Text only when it has onPress), whose own tag draws a pill:
// rounded-full, an arbitrary rounded-[20px] or more, or a literal borderRadius
// of 20 or more. Round things that are not controls (avatars, dots, badges,
// tracks) are not pressables, so they are not scanned. An exception needs a
// testID key, a count and a reason, as above.
const PILL_TAG_START = new RegExp(`<(${['Button', ...RAW_TAGS].map((t) => t.replace('.', '\\.')).join('|')})(?=[\\s/>])`, 'g');
const TEXT_TAGS = new Set(['Text', 'Animated.Text']);
const PILL = /\brounded-(?:full|\[(?:[2-9]\d|\d{3,})(?:px)?\])(?![\w-])|\bborderRadius\s*(?::|=)\s*\{?\s*(?:[2-9]\d|\d{3,})\b/;
const PRESS = /\bon(?:Press|LongPress|PressIn|PressOut)\s*=/;

// prettier-ignore
const ALLOWED_PILLS: Exception[] = [];

/** Every Button or raw pressable in `source` whose opening tag draws a pill. */
function findPills(file: string, source: string): Found[] {
  const found: Found[] = [];
  for (const match of source.matchAll(PILL_TAG_START)) {
    const tag = openingTag(source, match.index!);
    if (!PILL.test(tag)) continue;
    if (TEXT_TAGS.has(match[1]) && !PRESS.test(tag)) continue;
    const id = tag.match(TEST_ID);
    const literal = id ? (id[1] ?? id[2] ?? id[3]) : undefined;
    const key = literal ?? `${enclosingComponent(source, match.index!)}:${id?.[4] ?? ''}`;
    found.push({ file, line: source.slice(0, match.index).split('\n').length, tag: match[1], key });
  }
  return found;
}

/** Like violations(), worded for the pill shape. */
function pillViolations(found: Found[], allowed: Exception[]): string[] {
  return violations(found, allowed).map((v) => v.replace('is a hand-rolled button or link', 'is pill-shaped: drop the rounded-full, Button is rounded-lg'));
}

function scanPills(): Found[] {
  return sourceFiles(SRC)
    .map((full) => path.relative(SRC, full).split(path.sep).join('/'))
    .filter((file) => file !== BUTTON_FILE)
    .flatMap((file) => findPills(file, fs.readFileSync(path.join(SRC, file), 'utf8')));
}

describe('button convention', () => {
  const found = scan();

  it('has no hand-rolled buttons or links: use <Button> from components/ui/button', () => {
    expect(violations(found, ALLOWED)).toEqual([]);
  });

  it('gives every allowlist entry a unique key, a count and a reason', () => {
    const keys = ALLOWED.map((a) => `${a.file} ${a.key}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of ALLOWED) {
      expect(a.reason.trim()).not.toBe('');
      expect(a.count).toBeGreaterThan(0);
      // A bare `testID` (or one with no component found) is not a key: it would cover any raw button in the file.
      expect(a.key).not.toMatch(/^(\?:|:)?testID$/);
    }
  });

  it('catches the button role in every form, on every raw tag', () => {
    const cases = [
      '<Pressable accessibilityRole="button" onPress={go}>',
      "<PressableScale testID=\"x\" role='button'>",
      '<TouchableOpacity accessibilityRole={"button"} />',
      '<TouchableHighlight onPress={() => go(a > b)} accessibilityRole="button">',
      '<Text onPress={go} accessibilityRole={`button`}>Go</Text>',
    ];
    for (const snippet of cases) expect(findHandRolledButtons('x.tsx', snippet)).toHaveLength(1);
    // Other literal roles, other tags and the role on a prop name that only contains it are fine.
    expect(findHandRolledButtons('x.tsx', '<Pressable accessibilityRole="radio" onPress={go}>')).toHaveLength(0);
    expect(findHandRolledButtons('x.tsx', "<Pressable accessibilityRole={'tab'} onPress={go}>")).toHaveLength(0);
    expect(findHandRolledButtons('x.tsx', '<Button accessibilityRole="button" />')).toHaveLength(0);
    expect(findHandRolledButtons('x.tsx', '<TextInput accessibilityRole="button" />')).toHaveLength(0);
    expect(findHandRolledButtons('x.tsx', '<View role="group" />')).toHaveLength(0);
  });

  it('fails on a hand-rolled link', () => {
    const cases = [
      '<Pressable accessibilityRole="link" onPress={go}>',
      "<Text onPress={go} role='link'>Terms</Text>",
      '<TouchableOpacity accessibilityRole={"link"} />',
    ];
    for (const snippet of cases) {
      const hits = findHandRolledButtons('x.tsx', snippet);
      expect(hits).toHaveLength(1);
      expect(violations(hits, [])).toHaveLength(1);
    }
    // The standard link is fine.
    expect(findHandRolledButtons('x.tsx', '<Button variant="link" accessibilityRole="link" />')).toHaveLength(0);
  });

  it('fails on a computed role', () => {
    const cases = [
      '<Pressable accessibilityRole={role} onPress={go}>',
      '<Text onPress={go} role={linky ? "link" : "button"}>Go</Text>',
      '<TouchableOpacity accessibilityRole={ROLES.cta} />',
    ];
    for (const snippet of cases) {
      const hits = findHandRolledButtons('x.tsx', snippet);
      expect(hits).toHaveLength(1);
      expect(violations(hits, [])).toHaveLength(1);
    }
  });

  it('fails when a new raw button reuses an allowlisted key', () => {
    const entry: Exception = { file: 'x.tsx', key: 'row-${id}', count: 1, reason: 'a row' };
    const one = 'function List() {\n  return <Pressable testID={`row-${id}`} accessibilityRole="button" />;\n}\n';
    expect(violations(findHandRolledButtons('x.tsx', one), [entry])).toEqual([]);
    // The same key again: a second raw button slipping in under the first one's entry.
    const two = one + 'function Other() {\n  return <Pressable testID={`row-${id}`} accessibilityRole="button" />;\n}\n';
    expect(violations(findHandRolledButtons('x.tsx', two), [entry])).toEqual(['src/x.tsx row-${id}: expected 1, found 2']);
    // A passed-in testID is keyed by its component, so another component's raw button is not covered.
    const passed: Exception = { file: 'x.tsx', key: 'Row:testID', count: 1, reason: 'a row' };
    const rows =
      'function Row({ testID }) {\n  return <Pressable testID={testID} accessibilityRole="button" />;\n}\n' +
      'function Tile({ testID }) {\n  return <Pressable testID={testID} accessibilityRole="button" />;\n}\n';
    expect(violations(findHandRolledButtons('x.tsx', rows), [passed])).toEqual([
      'src/x.tsx:5 <Pressable Tile:testID> is a hand-rolled button or link',
    ]);
  });

  it('flags a stale entry', () => {
    const entry: Exception = { file: 'x.tsx', key: 'gone', count: 1, reason: 'removed' };
    expect(violations([], [entry])).toEqual(['src/x.tsx gone: expected 1, found 0']);
  });

  it('reads the key in each form', () => {
    expect(findHandRolledButtons('x.tsx', '<Pressable testID={`row-${id}`} accessibilityRole="button">')[0].key).toBe('row-${id}');
    expect(findHandRolledButtons('x.tsx', "<Pressable testID='a' accessibilityRole=\"button\">")[0].key).toBe('a');
    const passed = 'function RecapRow() { return <Pressable testID={testID} accessibilityRole="button">; }';
    expect(findHandRolledButtons('x.tsx', passed)[0].key).toBe('RecapRow:testID');
  });

  it('skips comments between props, so an apostrophe in one does not run the tag on', () => {
    const source = [
      '<Pressable',
      "  // another device's session",
      '  onPress={go}',
      '>',
      '  <Text>Not a button</Text>',
      '</Pressable>',
      "<Text accessibilityRole=\"button\" testID='after'>x</Text>",
    ].join('\n');
    expect(findHandRolledButtons('x.tsx', source).map((h) => [h.key, h.line])).toEqual([['after', 7]]);
    // A role only mentioned in a comment is not a role.
    expect(findHandRolledButtons('x.tsx', '<Pressable /* accessibilityRole="button" */ onPress={go}>')).toHaveLength(0);
    // A // inside a string is not a comment.
    expect(findHandRolledButtons('x.tsx', "<Pressable onPress={() => open('https://x.dev')} accessibilityRole=\"link\">")).toHaveLength(1);
  });
});

describe('button shape convention', () => {
  it('has no pill-shaped buttons or selectable options: Button and its rounded-lg corners', () => {
    expect(pillViolations(scanPills(), ALLOWED_PILLS)).toEqual([]);
  });

  it('gives every pill allowlist entry a unique key, a count and a reason', () => {
    const keys = ALLOWED_PILLS.map((a) => `${a.file} ${a.key}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const a of ALLOWED_PILLS) {
      expect(a.reason.trim()).not.toBe('');
      expect(a.count).toBeGreaterThan(0);
      expect(a.key).not.toMatch(/^(\?:|:)?testID$/);
    }
  });

  it('catches a pill on a Button and on every raw pressable', () => {
    const cases = [
      '<Button testID="b" variant="outline" className="rounded-full">',
      '<Button testID="b" className={`flex-1 rounded-full ${ON_STORY}`}>',
      "<Button testID=\"b\" className={scene ? 'self-center rounded-full' : 'rounded-full'}>",
      '<Pressable testID="p" accessibilityRole="radio" className="rounded-full border px-3">',
      '<PressableScale testID="p" className="h-10 rounded-[999px]">',
      '<TouchableOpacity testID="t" style={{ height: 40, borderRadius: 20 }}>',
      '<Text testID="x" onPress={go} className="rounded-full px-2">Go</Text>',
    ];
    for (const snippet of cases) {
      const hits = findPills('x.tsx', snippet);
      expect(hits).toHaveLength(1);
      expect(pillViolations(hits, [])).toEqual([expect.stringContaining('is pill-shaped')]);
    }
  });

  it('leaves the standard shape and round things that are not controls alone', () => {
    const fine = [
      '<Button testID="b" variant="outline" size="sm">',
      '<Button testID="b" className="rounded-lg">',
      '<Pressable testID="p" className="rounded-[8px] border">',
      '<Pressable testID="p" className="rounded-2xl border bg-card">',
      '<Pressable testID="p" style={{ borderRadius: 8 }}>',
      // A badge or a label is a Text without onPress; an avatar or a dot is a View.
      '<Text testID="count" className="min-w-5 rounded-full bg-accent">3</Text>',
      '<View testID="dot" className="h-2 w-2 rounded-full" />',
      '<Pressable testID="p" /* className="rounded-full" */ onPress={go}>',
      '<Pressable testID="p" className="rounded-full-ish">',
    ];
    for (const snippet of fine) expect(findPills('x.tsx', snippet)).toHaveLength(0);
  });

  it('fails a second pill that reuses an allowlisted key, and a stale entry', () => {
    const entry: Exception = { file: 'x.tsx', key: 'seat-${id}', count: 1, reason: 'a seat in the scene drawing' };
    const one = '<Pressable testID={`seat-${id}`} className="rounded-full" />\n';
    expect(pillViolations(findPills('x.tsx', one), [entry])).toEqual([]);
    expect(pillViolations(findPills('x.tsx', one + one), [entry])).toEqual(['src/x.tsx seat-${id}: expected 1, found 2']);
    expect(pillViolations([], [entry])).toEqual(['src/x.tsx seat-${id}: expected 1, found 0']);
  });
});
