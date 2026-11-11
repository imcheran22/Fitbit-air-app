import React from 'react';
import { Text, View } from 'react-native';
import type { Recap } from '../../api/recaps';
import { cardStats, monthName } from '../../lib/recapCopy';
import { APP_NAME, DESIGN_WIDTH, fitQuote, QUOTE_LINE_HEIGHT, QUOTE_MIN_FONT_SCALE, type Includes } from '../../lib/recapShare';
import { recapTint } from '../../lib/recapTheme';
import { FONTS } from '../../theme';
import { Character } from '../characters/Character';
import { characterInfo } from '../characters/registry';
import type { CharacterId } from '../characters/types';
import { pixelFont } from '../coach/thinking/shared';
import { ShareCanvas } from './ShareCanvas';

// Laid out in the design's own units (a 540×675 artboard); a(n) maps them onto the 360-wide
// design grid × scale, so the export is 1080×1350 on any device.
const ART_W = 540;
const ART_H = 675;
const PAD_X = 40;
const PAD_TOP = 40;
const PAD_BOTTOM = 32;
const INNER_W = ART_W - 2 * PAD_X;
const GAP = 20;
const EYEBROW_LINE = 20;
const SPRITE = 168;
const HERO_GAP = 24;
const TITLE_SIZE = 40;
const TITLE_LINE = 42;
const TITLE_GAP = 8;
const QUOTE_BASE = 17;
const TILE_GAP = 12;
const TILE_W = (INNER_W - TILE_GAP) / 2;
const LABEL_LINE = 16;
const VALUE_LINE = 36;
const TILE_H = 2 + 16 + LABEL_LINE + 4 + VALUE_LINE + 16;
const FOOTER = 1 + 16 + 20;

export interface RecapCardViewProps {
  recap: Recap;
  coachId: CharacterId;
  includes: Includes;
  scale: number;
  testID?: string;
}

/**
 * The monthly card (recap restyle, 1): 4:5, tinted by the coach, a big sprite beside the
 * Silkscreen "<Coach>'s month" title and the quote, up to four stat tiles and the footer.
 */
export function RecapCardView({ recap, coachId, includes, scale, testID = 'recap-card' }: RecapCardViewProps) {
  const a = (n: number) => (n * scale * DESIGN_WIDTH) / ART_W;
  const t = recapTint(coachId);
  const pixel = pixelFont();
  const stats = cardStats(recap.stats).filter((s) => includes[s.key]).slice(0, 4);
  const quote = `“${recap.line}”`;
  // The quote gets what the column leaves: the content height less the eyebrow, the tiles, the
  // footer, the gaps between them, the two-line title and an 8pt margin (design units).
  const rows = Math.ceil(stats.length / 2);
  const tiles = rows > 0 ? rows * TILE_H + (rows - 1) * TILE_GAP : 0;
  const gaps = (rows > 0 ? 3 : 2) * GAP;
  const hero = ART_H - PAD_TOP - PAD_BOTTOM - EYEBROW_LINE - tiles - FOOTER - gaps - 8;
  const quoteWidth = includes.coach ? INNER_W - SPRITE - HERO_GAP : INNER_W;
  const fit = fitQuote(quote, quoteWidth, hero - 2 * TITLE_LINE - TITLE_GAP, QUOTE_BASE);
  return (
    <ShareCanvas
      testID={testID}
      tint={t}
      width={a(ART_W)}
      height={a(ART_H)}
      dotSpacing={a(16)}
      dotRadius={a(1.3)}
      style={{ paddingHorizontal: a(PAD_X), paddingTop: a(PAD_TOP), paddingBottom: a(PAD_BOTTOM), gap: a(GAP) }}
    >
      <Text testID={`${testID}-month`} style={{ fontFamily: pixel, fontSize: a(14), lineHeight: a(EYEBROW_LINE), letterSpacing: a(1.12), color: t.accentText }}>
        {`MY ${monthName(recap.periodStart).toUpperCase()}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: a(HERO_GAP), flexShrink: 1, minHeight: 0 }}>
        {includes.coach ? (
          <View testID={`${testID}-coach`}>
            <Character characterId={coachId} mood="idle" size={Math.round(a(SPRITE))} paused />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: a(TITLE_GAP), flexShrink: 1, minHeight: 0 }}>
          <Text
            testID={`${testID}-title`}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            style={{ fontFamily: pixel, fontSize: a(TITLE_SIZE), lineHeight: a(TITLE_LINE), color: t.accentText }}
          >
            {`${characterInfo(coachId).name}'s\nmonth`}
          </Text>
          {includes.quote ? (
            <Text
              testID={`${testID}-quote`}
              numberOfLines={fit.lines + 1}
              adjustsFontSizeToFit
              minimumFontScale={QUOTE_MIN_FONT_SCALE}
              style={{ flexShrink: 1, fontFamily: FONTS.sans, fontSize: a(fit.fontSize), lineHeight: a(fit.fontSize * QUOTE_LINE_HEIGHT), color: t.soft }}
            >
              {quote}
            </Text>
          ) : null}
        </View>
      </View>
      {stats.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: a(TILE_GAP) }}>
          {stats.map((s) => (
            <View
              key={s.key}
              testID={`${testID}-stat-${s.key}`}
              style={{ width: a(TILE_W), backgroundColor: t.surface, borderWidth: a(1), borderColor: t.border, borderRadius: a(18), paddingVertical: a(16), paddingHorizontal: a(18) }}
            >
              <Text style={{ fontFamily: FONTS.sansMedium, fontSize: a(12), lineHeight: a(LABEL_LINE), letterSpacing: a(0.72), color: t.muted }}>{s.label.toUpperCase()}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: a(4), fontFamily: FONTS.sansBold, fontSize: a(30), lineHeight: a(VALUE_LINE), color: t.text }}>
                {s.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View
        style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: a(1), borderTopColor: t.hairline, paddingTop: a(16) }}
      >
        <Text style={{ fontFamily: FONTS.sans, fontSize: a(14), lineHeight: a(20), color: t.soft }}>Find your coach</Text>
        <Text testID={`${testID}-app`} style={{ fontFamily: pixel, fontSize: a(13), lineHeight: a(20), color: t.accentText }}>
          {APP_NAME}
        </Text>
      </View>
    </ShareCanvas>
  );
}
