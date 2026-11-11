import React, { useEffect, useState } from 'react';
import { Linking, PixelRatio, ScrollView, Switch, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { fetchRecap, type Recap } from '../api/recaps';
import { useCharacter } from '../characters/CharacterContext';
import { RecapCardView } from '../components/recap/RecapCardView';
import { STORY_FRAME_COUNT, WeeklyStoryFrame, type StoryFrameIndex } from '../components/recap/WeeklyStoryView';
import { YearPixelsView } from '../components/recap/YearPixelsView';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { SegmentedControl } from '../components/ui/segmented-control';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { todayCivil } from '../lib/heatmap';
import { readIncludePrefs, writeIncludePrefs } from '../lib/recapPrefs';
import {
  FORMAT_LABELS, INCLUDE_LABELS, availableIncludes, exportLayout, previewScale, recapCoachId, resolveIncludes,
  type IncludeKey, type Includes, type ShareFormat,
} from '../lib/recapShare';
import { useEarnedBadges } from '../lib/useEarnedBadges';
import { EXPORT_NOTICES, useRecapExport } from '../lib/useRecapExport';
import { loadYearInPixels, type YearInPixels } from '../lib/yearPixels';

// Build your recap (spec 2026-10-04 §3, 1c; recap restyle): pick a format (Card / Story / Year),
// for the story one of its three frames, switch parts on and off, see a live preview (scaled,
// never captured), then Save image or Share. The export is a separate, fixed-size, off-screen view
// captured at 1080 / PixelRatio.get() points wide: the card 1080×1350, a story frame 1080×1920.
const FRAME_OPTIONS = Array.from({ length: STORY_FRAME_COUNT }, (_, i) => ({ value: String(i), label: String(i + 1) }));

export function RecapBuilderScreen() {
  const { params } = useRoute<any>() as { params: { id?: string; format: ShareFormat } };
  const { characterId } = useCharacter();
  const { width } = useWindowDimensions();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [year, setYear] = useState<YearInPixels | null>(null);
  const [format, setFormat] = useState<ShareFormat>(params.format);
  // The story frame previewed, saved and shared.
  const [frame, setFrame] = useState<StoryFrameIndex>(0);
  const [prefs, setPrefs] = useState<Partial<Includes>>({});
  // The format whose stored choices have loaded: until then an export could miss a switched-off part.
  const [prefsFormat, setPrefsFormat] = useState<ShareFormat | null>(null);
  const [recapFailed, setRecapFailed] = useState(false);
  const [yearFailed, setYearFailed] = useState(false);
  const { exportRef, busy, notice, save, share } = useRecapExport();
  // The week's badge levels for story frame 3 (an empty range until the recap loads).
  const weekBadges = useEarnedBadges(recap?.periodStart ?? '', recap?.periodEnd ?? '');

  useEffect(() => {
    if (!params.id) return;
    fetchRecap(params.id).then(setRecap, () => setRecapFailed(true));
  }, [params.id]);

  useEffect(() => {
    if (format !== 'year' || year || yearFailed) return;
    loadYearInPixels(todayCivil()).then(setYear, () => setYearFailed(true));
  }, [format, year, yearFailed]);

  useEffect(() => {
    let cancelled = false;
    setPrefs({});
    setPrefsFormat(null);
    // A switch flipped while the stored choices load wins over them.
    void readIncludePrefs(format).then((stored) => {
      if (cancelled) return;
      setPrefs((current) => ({ ...stored, ...current }));
      setPrefsFormat(format);
    });
    return () => {
      cancelled = true;
    };
  }, [format]);

  const formats: ShareFormat[] = recap ? [recap.kind === 'MONTH' ? 'card' : 'story', 'year'] : [params.format];
  const stats = format === 'year' ? null : recap?.stats ?? null;
  const includes = resolveIncludes(format, prefs, stats);
  // "Badges this week" only when the week has a level to show (none, unavailable or failed: no switch).
  const available = availableIncludes(format, stats).filter((key) => key !== 'badges' || weekBadges.length > 0);
  const ready = format === 'year' ? year !== null : recap !== null;
  const layout = exportLayout(format, PixelRatio.get());
  const canExport = ready && prefsFormat === format && !busy;
  const loadError = format === 'year' ? (yearFailed ? "Your year couldn't be loaded." : null) : recapFailed ? 'Your recap could not be loaded.' : null;

  function toggle(key: IncludeKey, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    void writeIncludePrefs(format, next);
  }

  function renderView(scale: number, testID: string) {
    if (format === 'year') {
      return year ? <YearPixelsView testID={testID} year={year.year} pixels={year.pixels} goalMinutes={year.goalMinutes} coachId={characterId} includes={includes} scale={scale} /> : null;
    }
    if (!recap) return null;
    // The card and story show the recap's own coach, whose voice wrote the line (ruling S6).
    const coachId = recapCoachId(recap, characterId);
    return format === 'card' ? (
      <RecapCardView testID={testID} recap={recap} coachId={coachId} includes={includes} scale={scale} />
    ) : (
      <WeeklyStoryFrame testID={testID} recap={recap} coachId={coachId} includes={includes} scale={scale} index={frame} badges={weekBadges} />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 16, padding: 20 }}>
        {formats.length > 1 ? (
          <SegmentedControl testID="builder-format" options={formats.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))} value={format} onChange={setFormat} />
        ) : null}
        {format === 'story' && ready ? (
          <SegmentedControl
            testID="builder-frame"
            options={FRAME_OPTIONS}
            value={String(frame)}
            onChange={(v) => setFrame(Number(v) as StoryFrameIndex)}
          />
        ) : null}
        <View testID="builder-preview" className="items-center">
          {ready ? renderView(previewScale(format, width - 40, 460), 'preview') : <Skeleton className="h-72 w-full rounded-card" />}
        </View>
        <Text testID="builder-privacy" className="text-center text-caption text-muted-foreground">
          Only you see this until you share
        </Text>
        {available.length > 0 ? (
          <View className="gap-2">
            <Text testID="builder-include-label" className="text-body font-semibold">
              Include
            </Text>
            <Card className="gap-1">
              {available.map((key) => (
                <View key={key} className="flex-row items-center justify-between py-2">
                  <Text className="text-body">{INCLUDE_LABELS[key]}</Text>
                  <Switch testID={`builder-include-${key}`} accessibilityLabel={INCLUDE_LABELS[key]} value={includes[key]} onValueChange={(v) => toggle(key, v)} />
                </View>
              ))}
            </Card>
          </View>
        ) : null}
        {notice ? (
          <Text testID="builder-notice" className={notice === 'saved' ? 'text-caption text-muted-foreground' : 'text-caption text-destructive'}>
            {EXPORT_NOTICES[notice]}
          </Text>
        ) : null}
        {notice === 'denied' ? (
          <Button testID="builder-open-settings" variant="link" size="sm" accessibilityRole="link" className="self-start" onPress={() => void Linking.openSettings()}>
            Open Settings
          </Button>
        ) : null}
        {loadError ? (
          <View className="gap-2">
            <Text testID="builder-load-error" className="text-caption text-destructive">
              {loadError}
            </Text>
            {format === 'year' ? (
              <Button testID="builder-retry" variant="secondary" size="sm" className="self-start" onPress={() => setYearFailed(false)}>
                Try again
              </Button>
            ) : null}
          </View>
        ) : null}
        <View className="flex-row gap-3">
          <Button testID="builder-save" className="flex-1" variant="outline" size="lg" disabled={!canExport} onPress={() => void save()}>
            Save image
          </Button>
          <Button testID="builder-share" className="flex-1" size="lg" disabled={!canExport} onPress={() => void share()}>
            Share
          </Button>
        </View>
      </ScrollView>
      {/* The export view: fixed size, off screen, the only thing captured (spec §3). */}
      {ready ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0 }}>
          <View ref={exportRef} collapsable={false} testID="builder-export" style={{ width: layout.width, height: layout.height }}>
            {renderView(layout.scale, 'export')}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
