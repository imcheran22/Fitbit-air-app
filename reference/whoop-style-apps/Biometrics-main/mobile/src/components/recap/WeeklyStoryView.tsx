import React from 'react';
import { Text, View } from 'react-native';
import type { Recap } from '../../api/recaps';
import { weekdayName, weekRange } from '../../lib/recapCopy';
import { APP_NAME, fitQuote, PIXEL_ADVANCE_EM, QUOTE_LINE_HEIGHT, QUOTE_MIN_FONT_SCALE, quoteLines, type Includes } from '../../lib/recapShare';
import { coachFrameStats, coachFrameText, headlineStats, STORY_FRAME_COUNT, storyEyebrow, stripDays, type StoryFrameIndex } from '../../lib/recapStory';
import { highestPerFamilyFirst, shortLevelTitle, type BadgeRef } from '../../lib/badges';
import { CHANGE_COLORS, recapTint, type RecapTint } from '../../lib/recapTheme';
import { formatTextDuration } from '../../lib/sleepStats';
import { FONTS } from '../../theme';
import { Character, DIMMED_OPACITY } from '../characters/Character';
import { characterInfo } from '../characters/registry';
import type { CharacterId } from '../characters/types';
import { BadgeIcon } from '../achievements/BadgeIcon';
import { pixelFont } from '../coach/thinking/shared';
import { ShareCanvas } from './ShareCanvas';

export { STORY_FRAME_COUNT } from '../../lib/recapStory';
export type { StoryFrameIndex } from '../../lib/recapStory';

// The weekly story (recap restyle, 1a): three 9:16 frames on the 360×640 design grid × scale,
// each exported on its own at 1080×1920. Every frame shares the chrome: a three-segment progress
// bar and the "MY WEEK · N OF 3" eyebrow, on the coach's tinted, dotted ground.
const W = 360;
const H = 640;
const PAD_X = 24;
const PAD_Y = 28;
const CONTENT_W = W - 2 * PAD_X;
const CONTENT_H = H - 2 * PAD_Y;
const GAP = 16;
/** Height of the progress bar's row and the eyebrow's line (design units). */
export const STORY_PROGRESS_HEIGHT = 3;
const EYEBROW_LINE = 18;
const FOOTER_LINE = 18;
const CARD_CHROME = 2 + 16 + 16 + 6 + 16; // border, padding, label line, gap, padding
const CARD_VALUE_LINE = 30;
const STRIP = 38 + 4 + 14;
const QUOTE_BASE = 16;
const STORY_BASE = 18;
/**
 * "Badges this week" on frame 3 (achievements spec §6): up to four badges, each with its short title,
 * the highest level of each family first, then a "+n" chip for the rest (ruling F4).
 */
const STORY_BADGE_ICON = 44;
const STORY_BADGE_ICON_COMPACT = 32;
const STORY_BADGE_MAX = 4;
const BADGE_TITLE_LINE = 14;
const BADGE_LINE = 18;
const NO_BADGES: readonly BadgeRef[] = [];
/** The full card's height in design units: chrome and label, the icon, a gap and up to two title lines. */
export const BADGE_CARD_HEIGHT = CARD_CHROME + STORY_BADGE_ICON + 4 + 2 * BADGE_TITLE_LINE;
/**
 * How the badges are drawn when a long story needs the room: the full card, then a compact card
 * (smaller icons, no titles), then a single "n badges this week" line. The story keeps its promise
 * of never being cut off.
 */
export type BadgeMode = 'full' | 'compact' | 'line';
const BADGE_HEIGHTS: Record<BadgeMode, number> = {
  full: BADGE_CARD_HEIGHT,
  compact: CARD_CHROME + STORY_BADGE_ICON_COMPACT,
  line: BADGE_LINE,
};
const BADGE_MODES: readonly BadgeMode[] = ['full', 'compact', 'line'];

/** The design's padding, so an overlay (the story viewer's own animated bar) can sit exactly on the frame's. */
export const STORY_FRAME_INSETS = { top: PAD_Y, left: PAD_X, right: PAD_X, bottom: PAD_Y } as const;

export interface WeeklyStoryFrameProps {
  recap: Recap;
  coachId: CharacterId;
  includes: Includes;
  scale: number;
  index: StoryFrameIndex;
  /**
   * Draw the static progress bar (frames up to this one filled). The story viewer passes false and
   * draws its own animated bar over the same spot; the room is kept either way.
   */
  showProgress?: boolean;
  /** Badge levels earned in this recap's week, shown on frame 3 (and in its shared image) when any. */
  badges?: readonly BadgeRef[];
  testID?: string;
}

export interface StoryProgressProps {
  tint: RecapTint;
  index: number;
  scale: number;
  count?: number;
  /** How far the current segment is filled, 0–1 (1 for an exported frame). */
  progress?: number;
  testID?: string;
}

/** The three-segment bar: segments before `index` full, `index` at `progress`, the rest a track. */
export function StoryProgress({ tint, index, scale, count = STORY_FRAME_COUNT, progress = 1, testID = 'story-progress' }: StoryProgressProps) {
  const u = (n: number) => n * scale;
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: u(4), height: u(STORY_PROGRESS_HEIGHT) }}>
      {Array.from({ length: count }, (_, i) => {
        const fill = i < index ? 1 : i === index ? Math.max(0, Math.min(1, progress)) : 0;
        return (
          <View key={i} testID={`${testID}-${i}`} accessibilityLabel={`${Math.round(fill * 100)}%`} style={{ flex: 1, borderRadius: u(2), backgroundColor: tint.track, overflow: 'hidden' }}>
            <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: tint.text }} />
          </View>
        );
      })}
    </View>
  );
}

/** One frame of the weekly story, renderable (and capturable) on its own by index. */
export function WeeklyStoryFrame({ recap, coachId, includes, scale, index, showProgress = true, badges = NO_BADGES, testID = 'recap-story' }: WeeklyStoryFrameProps) {
  const u = (n: number) => n * scale;
  const t = recapTint(coachId);
  const pixel = pixelFont();
  const range = weekRange(recap.periodStart, recap.periodEnd);
  return (
    <ShareCanvas
      testID={testID}
      tint={t}
      width={u(W)}
      height={u(H)}
      dotSpacing={u(14)}
      dotRadius={u(1.2)}
      style={{ paddingHorizontal: u(PAD_X), paddingVertical: u(PAD_Y), gap: u(GAP) }}
    >
      <View testID={`${testID}-progress-slot`} style={{ opacity: showProgress ? 1 : 0 }}>
        <StoryProgress tint={t} index={index} scale={scale} testID={`${testID}-progress`} />
      </View>
      <Text testID={`${testID}-eyebrow`} style={{ fontFamily: pixel, fontSize: u(13), lineHeight: u(EYEBROW_LINE), letterSpacing: u(1.04), color: t.accentText }}>
        {storyEyebrow(index)}
      </Text>
      {index === 0 ? <HeadlineBody recap={recap} coachId={coachId} includes={includes} u={u} t={t} pixel={pixel} testID={testID} /> : null}
      {index === 1 ? <CoachSawBody recap={recap} coachId={coachId} includes={includes} u={u} t={t} pixel={pixel} testID={testID} /> : null}
      {index === 2 ? <CoachStoryBody recap={recap} coachId={coachId} includes={includes} u={u} t={t} pixel={pixel} testID={testID} badges={badges} /> : null}
      {index === 2 ? (
        <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: u(1), borderTopColor: t.hairline, paddingTop: u(16) }}>
          <Text style={{ fontFamily: FONTS.sans, fontSize: u(14), lineHeight: u(FOOTER_LINE), color: t.soft }}>Find your coach</Text>
          <Text testID={`${testID}-app`} style={{ fontFamily: pixel, fontSize: u(12), lineHeight: u(FOOTER_LINE), color: t.accentText }}>{APP_NAME}</Text>
        </View>
      ) : (
        <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text testID={`${testID}-range`} style={{ fontFamily: FONTS.sans, fontSize: u(13), lineHeight: u(FOOTER_LINE), color: t.muted }}>{range}</Text>
          <Text testID={`${testID}-app`} style={{ fontFamily: pixel, fontSize: u(12), lineHeight: u(FOOTER_LINE), color: t.accentText }}>{APP_NAME}</Text>
        </View>
      )}
    </ShareCanvas>
  );
}

/** Frame 2 on its own: the in-app preview of the weekly recap shows it. */
export function WeeklyStoryView(props: Omit<WeeklyStoryFrameProps, 'index'> & { index?: StoryFrameIndex }) {
  return <WeeklyStoryFrame {...props} index={props.index ?? 1} />;
}

interface BodyProps {
  recap: Recap;
  coachId: CharacterId;
  includes: Includes;
  u: (n: number) => number;
  t: RecapTint;
  pixel: string;
  testID: string;
}

function Label({ children, u, t }: { children: string; u: BodyProps['u']; t: RecapTint }) {
  return <Text style={{ fontFamily: FONTS.sansMedium, fontSize: u(12), lineHeight: u(16), letterSpacing: u(0.72), color: t.muted }}>{children.toUpperCase()}</Text>;
}

function cardStyle(u: BodyProps['u'], t: RecapTint) {
  return { backgroundColor: t.surface, borderWidth: u(1), borderColor: t.border, borderRadius: u(18), padding: u(16), gap: u(6) } as const;
}

/** Frame 1: "My week" and its big numbers. */
function HeadlineBody({ recap, coachId, includes, u, t, pixel, testID }: BodyProps) {
  const stats = headlineStats(recap.stats);
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(16) }}>
        {includes.coach ? (
          <View testID={`${testID}-coach`}>
            <Character characterId={coachId} mood="idle" size={Math.round(u(96))} paused />
          </View>
        ) : null}
        <Text testID={`${testID}-title`} style={{ flex: 1, fontFamily: pixel, fontSize: u(40), lineHeight: u(44), color: t.text }}>My week</Text>
      </View>
      {stats.length > 0 ? (
        stats.map((s) => (
          <View key={s.key} testID={`${testID}-stat-${s.key}`} style={cardStyle(u, t)}>
            <Label u={u} t={t}>{s.label}</Label>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontFamily: FONTS.sansBold, fontSize: u(44), lineHeight: u(52), color: s.tone ? (s.tone === 'same' ? t.muted : CHANGE_COLORS[s.tone]) : t.text }}
            >
              {s.value}
            </Text>
          </View>
        ))
      ) : (
        // A week without its numbers still says something: the coach's line.
        <Text testID={`${testID}-quote`} numberOfLines={8} adjustsFontSizeToFit style={{ fontFamily: FONTS.sans, fontSize: u(20), lineHeight: u(28), color: t.soft }}>
          {`“${recap.line}”`}
        </Text>
      )}
    </>
  );
}

/** Frame 2 (the design's artboard): the week as seven coaches, the best night and the line. */
function CoachSawBody({ recap, coachId, includes, u, t, pixel, testID }: BodyProps) {
  const name = characterInfo(coachId).name;
  const title = `How ${name} saw my week`;
  const days = stripDays(recap.stats.weekStrip ?? []);
  const best = includes.bestNight ? recap.stats.bestNight : undefined;
  const quote = `“${recap.line}”`;
  // The line gets what the frame leaves after the other blocks and a 16pt gap between each.
  const titleH = quoteLines(title, 30, CONTENT_W, PIXEL_ADVANCE_EM) * 33;
  const blocks = [STORY_PROGRESS_HEIGHT, EYEBROW_LINE, titleH, STRIP, best ? CARD_CHROME + CARD_VALUE_LINE : 0, CARD_CHROME, FOOTER_LINE].filter((h) => h > 0);
  const quoteBox = CONTENT_H - blocks.reduce((x, y) => x + y, 0) - (blocks.length - 1) * GAP - 8;
  const fit = fitQuote(quote, CONTENT_W - 34, quoteBox, QUOTE_BASE);
  const state = { goal: 'on goal', short: 'short', none: 'no data' } as const;
  return (
    <>
      <Text testID={`${testID}-title`} numberOfLines={3} adjustsFontSizeToFit style={{ fontFamily: pixel, fontSize: u(30), lineHeight: u(33), color: t.text }}>
        {title}
      </Text>
      <View testID={includes.coach ? `${testID}-coach` : undefined} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {days.map((d) => (
          <View key={d.date} testID={`${testID}-day-${d.date}`} accessibilityLabel={`${d.letter}: ${state[d.state]}`} style={{ alignItems: 'center', gap: u(4) }}>
            <View testID={`${testID}-sprite-${d.date}`} style={{ width: u(38), height: u(38), alignItems: 'center', justifyContent: 'center', opacity: d.dimmed ? DIMMED_OPACITY : 1 }}>
              {includes.coach ? (
                <Character characterId={coachId} mood="idle" size={Math.round(u(38))} paused />
              ) : (
                <View style={{ width: u(30), height: u(30), borderRadius: u(6), backgroundColor: t.accent }} />
              )}
            </View>
            <Text style={{ fontFamily: FONTS.sans, fontSize: u(11), lineHeight: u(14), color: t.muted }}>{d.letter}</Text>
          </View>
        ))}
      </View>
      {best ? (
        <View testID={`${testID}-best`} style={cardStyle(u, t)}>
          <Label u={u} t={t}>Best night</Label>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: FONTS.sansBold, fontSize: u(24), lineHeight: u(CARD_VALUE_LINE), color: t.text }}>
            {`${weekdayName(best.date)} · ${formatTextDuration(best.minutesAsleep)}`}
          </Text>
        </View>
      ) : null}
      {includes.quote ? (
        <View testID={`${testID}-says`} style={[cardStyle(u, t), { flexShrink: 1, minHeight: 0 }]}>
          <Label u={u} t={t}>{`${name} says`}</Label>
          <Text
            testID={`${testID}-quote`}
            numberOfLines={fit.lines + 1}
            adjustsFontSizeToFit
            minimumFontScale={QUOTE_MIN_FONT_SCALE}
            style={{ flexShrink: 1, fontFamily: FONTS.sans, fontSize: u(fit.fontSize), lineHeight: u(fit.fontSize * QUOTE_LINE_HEIGHT), color: t.text }}
          >
            {quote}
          </Text>
        </View>
      ) : null}
    </>
  );
}

/** The smallest the weekly story is drawn (design units): only a story near the coach's 500-token cap gets there. */
const STORY_MIN = 6;

/**
 * Frame 3's text size: the weekly story (or the line) fitted into the room the frame leaves it, from
 * 18 down to STORY_MIN, so a long story shrinks instead of overflowing or being cut off. `box` is
 * that room in design units. With badges, `badges` is the largest of their forms that leaves the
 * story room at STORY_MIN or above (the line when none does); null without badges.
 */
export function coachStoryFit(
  recap: Pick<Recap, 'story' | 'line' | 'stats'>,
  includes: Includes,
  badgeCount = 0,
): { fontSize: number; lines: number; box: number; badges: BadgeMode | null } {
  const header = includes.coach ? 72 : 30;
  const footer = 1 + 16 + FOOTER_LINE;
  const text = coachFrameText(recap);
  const fitWith = (badgeHeight: number) => {
    const blocks = [
      STORY_PROGRESS_HEIGHT,
      EYEBROW_LINE,
      header,
      coachFrameStats(recap.stats).length > 0 ? CARD_CHROME + CARD_VALUE_LINE : 0,
      badgeHeight,
      footer,
    ].filter((h) => h > 0);
    // The text is one more block, so one more gap.
    const box = CONTENT_H - blocks.reduce((x, y) => x + y, 0) - blocks.length * GAP - 8;
    const fit = fitQuote(text, CONTENT_W, box, STORY_BASE, STORY_MIN);
    return { ...fit, box, fits: fit.lines * fit.fontSize * QUOTE_LINE_HEIGHT <= box };
  };
  if (badgeCount <= 0) {
    const { fontSize, lines, box } = fitWith(0);
    return { fontSize, lines, box, badges: null };
  }
  const mode = BADGE_MODES.find((m) => fitWith(BADGE_HEIGHTS[m]).fits) ?? 'line';
  const { fontSize, lines, box } = fitWith(BADGE_HEIGHTS[mode]);
  return { fontSize, lines, box, badges: mode };
}

/** Frame 3: the coach's weekly story (the line when there is none), the streak and the spread, and the week's badges. */
function CoachStoryBody({ recap, coachId, includes, u, t, pixel, testID, badges }: BodyProps & { badges: readonly BadgeRef[] }) {
  const name = characterInfo(coachId).name;
  const text = coachFrameText(recap);
  const stats = coachFrameStats(recap.stats);
  // Switched off in Build your recap ("Badges this week"): no card here, in the viewer or the image.
  const ordered = includes.badges ? highestPerFamilyFirst(badges) : NO_BADGES;
  const shown = ordered.slice(0, STORY_BADGE_MAX);
  const more = ordered.length - shown.length;
  const fit = coachStoryFit(recap, includes, ordered.length);
  const icon = fit.badges === 'full' ? STORY_BADGE_ICON : STORY_BADGE_ICON_COMPACT;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(16) }}>
        {includes.coach ? (
          <View testID={`${testID}-coach`}>
            <Character characterId={coachId} mood="idle" size={Math.round(u(72))} paused />
          </View>
        ) : null}
        <Text testID={`${testID}-title`} numberOfLines={2} adjustsFontSizeToFit style={{ flex: 1, fontFamily: pixel, fontSize: u(26), lineHeight: u(30), color: t.text }}>
          {`Notes from ${name}`}
        </Text>
      </View>
      <Text
        testID={`${testID}-story`}
        numberOfLines={fit.lines + 1}
        adjustsFontSizeToFit
        minimumFontScale={QUOTE_MIN_FONT_SCALE}
        style={{ flexShrink: 1, fontFamily: FONTS.sans, fontSize: u(fit.fontSize), lineHeight: u(fit.fontSize * QUOTE_LINE_HEIGHT), color: t.text }}
      >
        {text}
      </Text>
      {stats.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: u(12) }}>
          {stats.map((s) => (
            <View key={s.key} testID={`${testID}-stat-${s.key}`} style={[cardStyle(u, t), { flex: 1 }]}>
              <Label u={u} t={t}>{s.label}</Label>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: FONTS.sansBold, fontSize: u(24), lineHeight: u(CARD_VALUE_LINE), color: t.text }}>
                {s.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {fit.badges === 'line' ? (
        // A story near the coach's cap needs the room: the badges become one line.
        <View testID={`${testID}-badges`}>
          <Text testID={`${testID}-badges-line`} numberOfLines={1} style={{ fontFamily: FONTS.sansMedium, fontSize: u(13), lineHeight: u(BADGE_LINE), color: t.soft }}>
            {`${ordered.length} ${ordered.length === 1 ? 'badge' : 'badges'} this week`}
          </Text>
        </View>
      ) : null}
      {fit.badges === 'full' || fit.badges === 'compact' ? (
        <View testID={`${testID}-badges`} style={cardStyle(u, t)}>
          <Label u={u} t={t}>Badges this week</Label>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(10) }}>
            {shown.map((b) => (
              <View key={`${b.family}-${b.level}`} testID={`${testID}-badge-${b.family}-${b.level}`} style={{ flex: 1, alignItems: 'center', gap: u(4) }}>
                <BadgeIcon family={b.family} level={b.level} size={u(icon)} pips={false} testID={`${testID}-badge-${b.family}-${b.level}-icon`} />
                {fit.badges === 'full' ? (
                  <Text
                    testID={`${testID}-badge-${b.family}-${b.level}-title`}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                    style={{ fontFamily: FONTS.sans, fontSize: u(10), lineHeight: u(BADGE_TITLE_LINE), textAlign: 'center', color: t.soft }}
                  >
                    {shortLevelTitle(b.family, b.level)}
                  </Text>
                ) : null}
              </View>
            ))}
            {more > 0 ? (
              <View
                testID={`${testID}-badges-more`}
                accessible
                accessibilityLabel={`${more} more ${more === 1 ? 'badge' : 'badges'} this week`}
                style={{ minWidth: u(36), height: u(28), paddingHorizontal: u(8), borderRadius: u(14), borderWidth: u(1), borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: FONTS.sansBold, fontSize: u(13), lineHeight: u(16), color: t.text }}>{`+${more}`}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </>
  );
}
