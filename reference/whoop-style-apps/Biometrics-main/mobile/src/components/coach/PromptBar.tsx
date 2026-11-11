import React, { useEffect, useState } from 'react';
import { TextInput, View, type NativeSyntheticEvent, type TextInputContentSizeChangeEventData } from 'react-native';
import { useColorScheme } from 'nativewind';
import Animated, { useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';
import { Text } from '../ui/text';
import { PressableScale } from '../ui/pressable-scale';
import { Button } from '../ui/button';
import { inputTextStyle } from '../ui/input-style';
import { COLORS, MOTION } from '../../theme';

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

export interface PromptCommand {
  key: string;
  label: string;
  /** What the field is replaced with when the command is picked. */
  prompt: string;
}

export interface PromptBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** A turn is in flight: the field locks and the glyph becomes a stop square. */
  busy: boolean;
  /** Given, the stop square is a real button while busy: it stops the streaming answer. */
  onStop?: () => void;
  commands?: PromptCommand[];
  placeholder?: string;
}

/** Openers worth one tap. Kept here so the screen does not carry copy. */
export const COACH_COMMANDS: PromptCommand[] = [
  { key: 'recovery', label: 'Why is my recovery down?', prompt: 'Why is my recovery score lower today?' },
  { key: 'sleep', label: 'How did I sleep?', prompt: 'How did I sleep last night, and what stood out?' },
  { key: 'patterns', label: 'What affects me most?', prompt: 'Which of my habits affect my scores the most?' },
];

// The two glyphs the send control morphs between. Same length, read pairwise as
// (x, y), so they interpolate point for point: an arrow pointing up at rest, a
// stop square while a turn runs. Taken from the reference component so the
// motion matches rather than approximates it.
export const ARROW_POINTS = [12, 4.5, 18.5, 11, 14.25, 11, 14.25, 19.5, 9.75, 19.5, 9.75, 11, 5.5, 11];
export const SQUARE_POINTS = [12, 6, 18, 6, 18, 12, 18, 18, 6, 18, 6, 12, 6, 6];

const LINE_HEIGHT = 22;
const MAX_ROWS = 5;

/**
 * The slash-command query being typed, or null when no menu should show.
 *
 * Only a slash in the very first column counts, and only until the first
 * space: after that the user is writing a message, and a menu parked over the
 * transcript would be in the way for the rest of the sentence.
 */
export function parseSlashQuery(value: string): string | null {
  if (!value.startsWith('/')) return null;
  const rest = value.slice(1);
  if (/\s/.test(rest)) return null;
  return rest.toLowerCase();
}

/** Commands whose key starts with `query`. An empty query matches everything. */
export function matchCommands(commands: PromptCommand[], query: string): PromptCommand[] {
  if (query === '') return commands;
  return commands.filter((c) => c.key.startsWith(query));
}

/** Field height for the measured content: at least one row, at most `maxRows`. */
export function clampRows(contentHeight: number, lineHeight: number, maxRows: number): number {
  const rows = Math.max(1, Math.min(maxRows, Math.ceil(contentHeight / lineHeight) || 1));
  return rows * lineHeight;
}

/** The glyph part-way between the arrow (0) and the stop square (1). */
export function glyphPoints(t: number): number[] {
  return ARROW_POINTS.map((from, i) => from + (SQUARE_POINTS[i]! - from) * t);
}

/**
 * How the send control paints. It is filled and near-white whenever it means
 * something -- a message ready to send, or a turn to watch -- and is just a
 * bare grey arrow when there is nothing to do, so the quiet bar reads as one
 * surface rather than a field plus a button.
 */
export function sendColors(
  active: boolean,
  colors: { barActive: string; background: string; muted: string },
): { background: string; glyph: string } {
  return active
    ? { background: colors.barActive, glyph: colors.background }
    : { background: 'transparent', glyph: colors.muted };
}

export function PromptBar({
  value,
  onChangeText,
  onSend,
  busy,
  onStop,
  commands = COACH_COMMANDS,
  placeholder = 'Ask anything',
}: PromptBarProps) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const reduced = useReducedMotion();

  const [height, setHeight] = useState(LINE_HEIGHT);

  const canSend = value.trim().length > 0 && !busy;
  const canStop = busy && onStop !== undefined;
  const controlLabel = canStop ? 'Stop' : busy ? 'Working' : 'Send';
  const query = parseSlashQuery(value);
  const matches = query === null ? [] : matchCommands(commands, query);
  const menuOpen = matches.length > 0;
  const send = sendColors(canSend || busy, colors);

  // 0 = arrow, 1 = stop square. Reduced motion snaps rather than morphs.
  const morph = useSharedValue(busy ? 1 : 0);
  // In an effect, not the render body: Reanimated warns (and can drop the
  // write) when a shared value is set while React is rendering.
  useEffect(() => {
    morph.value = reduced ? (busy ? 1 : 0) : withTiming(busy ? 1 : 0, { duration: MOTION.duration.fast });
  }, [busy, reduced, morph]);

  const glyphProps = useAnimatedProps(() => {
    const pts = ARROW_POINTS.map((from, i) => from + (SQUARE_POINTS[i]! - from) * morph.value);
    let out = '';
    for (let i = 0; i < pts.length; i += 2) out += `${pts[i]},${pts[i + 1]} `;
    return { points: out.trim() };
  });

  return (
    <View className="gap-2">
      {menuOpen ? (
        <View
          testID="coach-command-menu"
          style={{ backgroundColor: colors.surfaceRaised }}
          className="overflow-hidden rounded-card border border-border"
        >
          {matches.map((command) => (
            <PressableScale
              key={command.key}
              testID={`coach-command-${command.key}`}
              accessibilityRole="button"
              accessibilityLabel={command.label}
              onPress={() => onChangeText(command.prompt)}
              className="px-4 py-3 active:opacity-70"
            >
              <Text className="text-body font-semibold">/{command.key}</Text>
              <Text className="text-caption text-muted-foreground">{command.label}</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}

      {/* The quiet bar: one slim rounded rectangle, the field and the send
          control in a single row. It grows with the text up to MAX_ROWS. */}
      <View
        testID="coach-prompt-bar"
        style={{ backgroundColor: colors.card, borderRadius: 16, minHeight: 52 }}
        className="flex-row items-end border border-border py-1.5 pl-4 pr-1.5"
      >
        <TextInput
          testID="coach-input"
          value={value}
          onChangeText={onChangeText}
          onContentSizeChange={(e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) =>
            setHeight(clampRows(e.nativeEvent.contentSize.height, LINE_HEIGHT, MAX_ROWS))
          }
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          editable={!busy}
          style={[inputTextStyle, {
            flex: 1,
            color: colors.foreground,
            height,
            lineHeight: LINE_HEIGHT,
            // iOS pads a multiline field's content by default, which made one
            // line measure as two; the bar's own padding does that job.
            paddingTop: 0,
            paddingBottom: 0,
            marginVertical: 9,
            textAlignVertical: 'top',
          }]}
        />

        <Button
          testID="coach-send-button"
          size="icon"
          accessibilityLabel={controlLabel}
          disabled={!canSend && !canStop}
          onPress={() => {
            if (canStop) onStop!();
            else if (canSend) onSend();
          }}
          // The fill follows sendColors, and a running turn stays at full
          // opacity even when it cannot be stopped, so it still reads as live.
          style={{ backgroundColor: send.background, opacity: canSend || busy ? 1 : 0.5 }}
          className="ml-2"
        >
          <View testID="coach-send-glyph" accessibilityLabel={controlLabel}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <AnimatedPolygon animatedProps={glyphProps} fill={send.glyph} />
            </Svg>
          </View>
        </Button>
      </View>

      {/* The shortcuts live behind "/"; with the field empty, a quiet hint says
          so and is itself a way in. */}
      {value === '' && !busy ? (
        <Button
          testID="coach-commands-button"
          variant="ghost"
          size="xs"
          accessibilityLabel="Prompt shortcuts"
          onPress={() => onChangeText('/')}
          // The xs padding plus this margin lines the hint up with the field's text.
          className="ml-2 self-start"
          textClassName="text-muted-foreground"
        >
          Type / for shortcuts
        </Button>
      ) : null}
    </View>
  );
}
