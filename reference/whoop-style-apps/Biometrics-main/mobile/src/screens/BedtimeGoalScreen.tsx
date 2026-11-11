import React, { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import { fetchSleepGoal, saveSleepGoal, type SleepGoal } from '../api/sleep';
import { useCharacter } from '../characters/CharacterContext';
import { characterInfo } from '../components/characters/registry';
import { Button, buttonIconSize } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { SectionLabel } from '../components/ui/section-label';
import { SegmentedControl } from '../components/ui/segmented-control';
import { SettingsGroup, SettingsRow } from '../components/ui/settings-list';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { formatClock } from '../lib/sleepStats';
import { formatGoalDuration, goalWindowMinutes } from '../lib/sleepWindow';
import { disableWindDown, enableWindDown, readWindDown, setWindDownLead, type WindDownLead } from '../lib/windDown';
import { COLORS } from '../theme';

// Shown, not saved, until the user saves a goal of their own.
const DEFAULT_BEDTIME = '23:00';
const DEFAULT_WAKE = '07:00';
const STEP = 15;
const MIN_SLEEP = 4 * 60;
const MAX_SLEEP = 12 * 60;

const LEAD_OPTIONS: { value: `${WindDownLead}`; label: string }[] = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
];

// `timesTouched`: a time stepper was used, so unset times now hold a choice.
type Draft = { bed: string; wake: string; sleep: number; timesTouched: boolean };
type LoadState = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; saved: SleepGoal };
// 'denied' points to Settings; 'error' is a native scheduling failure.
type ReminderNote = 'denied' | 'error' | null;

const draftOf = (goal: SleepGoal): Draft => ({
  bed: goal.bedtimeGoal ?? DEFAULT_BEDTIME,
  wake: goal.wakeGoal ?? DEFAULT_WAKE,
  sleep: goal.sleepGoalMinutes,
  timesTouched: false,
});

// "23:45" + 15 -> "00:00": clock arithmetic that wraps midnight both ways.
export function shiftClock(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h! * 60 + m! + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Only the fields that differ from the saved goal. An unset time's shown
// default is never saved on its own: it counts only once a time stepper has
// been used, so a sleep-goal-only change doesn't write 23:00/07:00.
function changedFields(saved: SleepGoal, draft: Draft): Partial<SleepGoal> {
  const patch: Partial<SleepGoal> = {};
  const timeChanged = (shown: string, stored: string | null) => (stored === null ? draft.timesTouched : shown !== stored);
  if (timeChanged(draft.bed, saved.bedtimeGoal)) patch.bedtimeGoal = draft.bed;
  if (timeChanged(draft.wake, saved.wakeGoal)) patch.wakeGoal = draft.wake;
  if (draft.sleep !== saved.sleepGoalMinutes) patch.sleepGoalMinutes = draft.sleep;
  return patch;
}

export function BedtimeGoalScreen() {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const { characterId } = useCharacter();
  const coachName = characterInfo(characterId).name;

  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [draft, setDraft] = useState<Draft>({ bed: DEFAULT_BEDTIME, wake: DEFAULT_WAKE, sleep: 480, timesTouched: false });
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);
  const [lead, setLead] = useState<WindDownLead>(30);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderNote, setReminderNote] = useState<ReminderNote>(null);

  // The one way the reminder gets (re)scheduled from this screen: switching it
  // on, saving a goal while it is on, and refreshing a stale title or bedtime.
  // A failure leaves it off, on screen and on the device.
  const scheduleReminder = useCallback(
    async (bedtimeGoal: string, leadMinutes: WindDownLead) => {
      setReminderNote(null);
      try {
        const result = await enableWindDown({ bedtimeGoal, leadMinutes, coachName });
        setReminderOn(result === 'scheduled');
        if (result === 'denied') setReminderNote('denied');
      } catch {
        setReminderOn(false);
        setReminderNote('error');
        await disableWindDown().catch(() => undefined);
      }
    },
    [coachName],
  );

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      // readWindDown never rejects (it falls back to defaults), so only the goal can fail here.
      const [saved, reminder] = await Promise.all([fetchSleepGoal(), readWindDown()]);
      setState({ phase: 'ready', saved });
      setDraft(draftOf(saved));
      setLead(reminder.leadMinutes);
      setReminderOn(reminder.enabled);
      // The stored reminder carries the coach's name and the bedtime it was
      // set for; either may have changed since (a new coach, another device).
      if (reminder.enabled && saved.bedtimeGoal && (reminder.coachName !== coachName || reminder.bedtimeGoal !== saved.bedtimeGoal)) {
        // Busy, so the switch and Save wait for it instead of racing it.
        setReminderBusy(true);
        try {
          await scheduleReminder(saved.bedtimeGoal, reminder.leadMinutes);
        } finally {
          setReminderBusy(false);
        }
      }
    } catch {
      setState({ phase: 'error' });
    }
    // Loads once; a coach change while open is picked up on the next save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.phase === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View testID="goal-loading" className="gap-4 px-5 pt-6">
          <Skeleton className="h-40 w-full rounded-card" />
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
        </View>
      </SafeAreaView>
    );
  }

  if (state.phase === 'error') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View className="flex-1 items-center justify-center gap-3 p-6">
          <Text className="text-center text-muted-foreground">Your bedtime goal could not be loaded.</Text>
          <Button testID="goal-load-retry" variant="secondary" onPress={load}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const { saved } = state;
  const patch = changedFields(saved, draft);
  const sameTimes = draft.bed === draft.wake;
  // Save and the switch never overlap: either could otherwise schedule at a
  // stale bedtime or undo the other's result.
  const canSave = Object.keys(patch).length > 0 && !sameTimes && !saving && !reminderBusy;
  const switchDisabled = !saved.bedtimeGoal || reminderBusy || saving;
  const windowMinutes = goalWindowMinutes(draft.bed, draft.wake);
  const short = !sameTimes && windowMinutes < draft.sleep;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const next = await saveSleepGoal(patch);
      setState({ phase: 'ready', saved: next });
      setDraft(draftOf(next));
      // Moves the reminder to the new bedtime and refreshes its coach name.
      if (reminderOn && next.bedtimeGoal) await scheduleReminder(next.bedtimeGoal, lead);
    } catch {
      setDraft(draftOf(saved));
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  async function toggleReminder(next: boolean) {
    if (switchDisabled || !saved.bedtimeGoal) return;
    setReminderBusy(true);
    try {
      if (next) {
        await scheduleReminder(saved.bedtimeGoal, lead);
      } else {
        setReminderNote(null);
        setReminderOn(false);
        await disableWindDown();
      }
    } finally {
      setReminderBusy(false);
    }
  }

  function changeLead(value: `${WindDownLead}`) {
    const next = Number(value) as WindDownLead;
    setLead(next);
    setWindDownLead(next).catch(() => undefined);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 }}>
        <View className="gap-2">
          <SectionLabel className="px-1">Times</SectionLabel>
          <Card className="gap-4">
            <Stepper
              id="goal-bed"
              label="Bedtime"
              value={formatClock(draft.bed)}
              onMinus={() => setDraft((d) => ({ ...d, bed: shiftClock(d.bed, -STEP), timesTouched: true }))}
              onPlus={() => setDraft((d) => ({ ...d, bed: shiftClock(d.bed, STEP), timesTouched: true }))}
            />
            <Stepper
              id="goal-wake"
              label="Wake time"
              value={formatClock(draft.wake)}
              onMinus={() => setDraft((d) => ({ ...d, wake: shiftClock(d.wake, -STEP), timesTouched: true }))}
              onPlus={() => setDraft((d) => ({ ...d, wake: shiftClock(d.wake, STEP), timesTouched: true }))}
            />
            <Text testID="goal-window-line" className="text-caption" style={{ color: short ? colors.scoreFair : colors.muted }}>
              {sameTimes
                ? "Bedtime and wake time can't be the same."
                : `That's ${formatGoalDuration(windowMinutes)} in bed. Your goal is ${formatGoalDuration(draft.sleep)} asleep.`}
            </Text>
          </Card>
        </View>

        <View className="gap-2">
          <SectionLabel className="px-1">Sleep goal</SectionLabel>
          <Card>
            <Stepper
              id="goal-sleep"
              label="Time asleep"
              value={formatGoalDuration(draft.sleep)}
              onMinus={() => setDraft((d) => ({ ...d, sleep: Math.max(MIN_SLEEP, d.sleep - STEP) }))}
              onPlus={() => setDraft((d) => ({ ...d, sleep: Math.min(MAX_SLEEP, d.sleep + STEP) }))}
              minusDisabled={draft.sleep <= MIN_SLEEP}
              plusDisabled={draft.sleep >= MAX_SLEEP}
            />
          </Card>
        </View>

        <View className="gap-2">
          <Button testID="goal-save" size="lg" onPress={save} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {saveFailed ? (
            <Text testID="goal-error" className="px-1 text-center text-caption text-destructive">
              Your goal couldn't be saved. Check your connection and try again.
            </Text>
          ) : null}
        </View>

        <SettingsGroup label="Wind-down reminder">
          <SettingsRow
            icon="moon-outline"
            tint={colors.metricSleep}
            title="Remind me to wind down"
            subtitle={saved.bedtimeGoal ? undefined : 'Set a bedtime first'}
            trailing={
              <Switch
                testID="winddown-switch"
                accessibilityLabel="Wind-down reminder"
                value={reminderOn && !!saved.bedtimeGoal}
                disabled={switchDisabled}
                accessibilityState={{ disabled: switchDisabled, checked: reminderOn && !!saved.bedtimeGoal }}
                onValueChange={(next) => void toggleReminder(next)}
                trackColor={{ true: colors.accent }}
              />
            }
          />
          <View className="gap-3 px-4 py-3">
            <Text className="text-caption text-muted-foreground">Before bedtime</Text>
            <SegmentedControl testID="winddown-lead" options={LEAD_OPTIONS} value={`${lead}`} onChange={changeLead} />
            <View className="rounded-xl bg-muted px-3 py-2.5">
              <Text testID="winddown-preview" className="text-body">
                <Text className="text-body font-semibold">{`${coachName}: `}</Text>
                {`Wind-down time. Bed in ${lead} min.`}
              </Text>
            </View>
          </View>
        </SettingsGroup>
        {reminderNote === 'denied' ? (
          <View className="gap-1 px-4">
            <Text testID="winddown-denied" className="text-caption text-muted-foreground">Notifications are off for Biometrics. Turn them on in Settings.</Text>
            <Button testID="winddown-settings" variant="link" size="xs" accessibilityRole="link" className="self-start" onPress={() => void Linking.openSettings()}>
              Open Settings
            </Button>
          </View>
        ) : null}
        {reminderNote === 'error' ? (
          <Text testID="winddown-error" className="px-4 text-caption text-destructive">
            Couldn't set the reminder. Try again.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

interface StepperProps {
  // testID prefix: `${id}-minus`, `${id}-value`, `${id}-plus`.
  id: string;
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}

function Stepper({ id, label, value, onMinus, onPlus, minusDisabled, plusDisabled }: StepperProps) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const button = (testID: string, icon: 'remove' | 'add', onPress: () => void, disabled: boolean | undefined, a11y: string) => (
    <Button testID={testID} variant="outline" size="icon-sm" accessibilityLabel={a11y} disabled={disabled} onPress={onPress}>
      <Ionicons name={icon} size={buttonIconSize('icon-sm')} color={colors.foreground} />
    </Button>
  );
  return (
    <View className="flex-row items-center gap-3">
      <Text className="flex-1 text-body">{label}</Text>
      {button(`${id}-minus`, 'remove', onMinus, minusDisabled, `${label}, minus 15 minutes`)}
      <Text testID={`${id}-value`} className="min-w-[84px] text-center text-body font-semibold tabular-nums">
        {value}
      </Text>
      {button(`${id}-plus`, 'add', onPlus, plusDisabled, `${label}, plus 15 minutes`)}
    </View>
  );
}
