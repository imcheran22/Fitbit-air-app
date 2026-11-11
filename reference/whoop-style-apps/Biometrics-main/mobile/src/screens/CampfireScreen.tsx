// The Campfire page (spec 2026-10-07 social §6; redesign 2026-10-07: a full-screen pixel scene under a pull-up glass
// panel), pushed from the camp banner. The scene fills the screen: me and up to 7 buddies on logs in a ring round the
// fire (the server's order: me, then latest activity) and "+N here" for the rest; night (stars, constellations, a
// moon, a lit fire once anyone is in bed on time) or day (sun, clouds, unlit logs) by my clock; asleep KIPs bob
// with drifting "z"s; a camp note shows in a one-line bubble over its KIP (mine: "+ ADD A NOTE" when I have none).
// The panel: at Peek the fire's strength; at Half my camp note and Say goodnight (while my own window is open: from
// min(20:00, my goal − 60 min) to 05:59; otherwise "You can say goodnight from 8:00 PM"); at Full "Who's here" with
// each whole note (a buddy's with "Report note"), and Message camp. Every time here is 12-hour. A buddy's KIP opens
// their chat (their camp note staged), mine opens Half at the note; "Message camp" opens Chats — on a server without
// chats (S2), the week and Buddies instead. An older server (bare 404) says the camp isn't open
// yet. Camp notes are buddies' free text: shown here only, never logged.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { blockBuddy, buddyErrorCode } from '../api/buddies';
import { clearCampNote, fetchCamp, saveCampNote, type Camp, type CampMember, type CampNote } from '../api/social';
import { pixelFont } from '../components/coach/thinking/shared';
import { PersonKip } from '../components/kip/PersonKip';
import { CampNoteCard } from '../components/social/CampNoteCard';
import { CampPanel, panelStops, useCampPanel } from '../components/social/CampPanel';
import { CampScene } from '../components/social/CampScene';
import { ReportSheet } from '../components/chats/ReportSheet';
import { campScene, CHROME } from '../components/social/campSceneGeometry';
import { GoodnightButton } from '../components/social/GoodnightButton';
import { Button, buttonIconSize } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { SectionLabel } from '../components/ui/section-label';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { buddyErrorMessage } from '../lib/buddyCopy';
import { campNoteQuoteLabel } from '../lib/chatCopy';
import { useMyKipColour } from '../lib/kip/myKipColour';
import {
  CAMP_NOTE_MAX, campHeadline, campSceneKicker, campStatus, fireCountLabel, fireMoreLine, goodnightOpensLine, nightsLitLine,
  noteLength, personName,
} from '../lib/socialCopy';
import { refreshSocial, useChatsAvailable } from '../lib/socialStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { COLORS } from '../theme';

type State = { status: 'loading' } | { status: 'ready'; camp: Camp } | { status: 'unavailable' } | { status: 'error' };

/** Seats in the scene: mine and up to 7 buddies. */
export const SEATS = 8;
const SEGMENT_ON = '#F97316';
const SEGMENT_OFF = '#2E323B';
const PILL = { backgroundColor: 'rgba(20,22,27,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' } as const;

/** Back to Social. Over the scene it wears the dark glass of "+N here" in either scheme, at its 40-px height (lg); on the plain loading / error screen, the standard secondary button. */
function BackPill({ onPress, scene = false }: { onPress: () => void; scene?: boolean }) {
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const size = scene ? 'lg' : 'sm';
  return (
    <Button testID="camp-back" accessibilityLabel="Back to Social" onPress={onPress} variant="secondary" size={size}
      className={scene ? 'self-center' : undefined} style={scene ? PILL : undefined}
      textClassName={scene ? 'text-[#F5F5F4]' : undefined}
      iconStart={<Ionicons name="chevron-back" size={buttonIconSize(size)} color={scene ? '#F5F5F4' : colors.foreground} />}>
      Social
    </Button>
  );
}

/** A VoiceOver / TalkBack user starts at Half and can scroll the panel at every stop. */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isScreenReaderEnabled?.().then((v) => {
      if (live) setOn(v);
    }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', setOn);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return on;
}

/** Peek: the fire's strength, always in view (by day, tonight's, usually not lit yet). */
function FireMeter({ camp }: { camp: Camp }) {
  const more = fireMoreLine(camp.fire, camp.night);
  return (
    <View className="gap-2.5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Ionicons name="flame" size={16} color={camp.night ? SEGMENT_ON : '#6B6E78'} />
          <SectionLabel className="text-foreground">TONIGHT'S FIRE</SectionLabel>
        </View>
        <Text testID="camp-fire-count" className="text-[13px] font-semibold text-[#FDBA74]">{fireCountLabel(camp.fire, camp.night)}</Text>
      </View>
      <View testID="camp-fire-strength" className="flex-row gap-[5px]" accessible accessibilityRole="progressbar" accessibilityLabel="Fire strength"
        accessibilityValue={{ min: 0, max: 5, now: camp.fire.segments }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} testID={`camp-fire-segment-${i}`} style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: i < camp.fire.segments ? SEGMENT_ON : SEGMENT_OFF }} />
        ))}
      </View>
      <View className="flex-row justify-between gap-2">
        {more ? <Text testID="camp-fire-line" className="text-[13px] text-muted-foreground">{more}</Text> : <View />}
        <Text testID="camp-nights-lit" className="text-[13px] text-muted-foreground">{nightsLitLine(camp.nightsLitThisWeek)}</Text>
      </View>
    </View>
  );
}

export function CampfireScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const screenReader = useScreenReader();
  const myColour = useMyKipColour();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(true);
  const chats = useChatsAvailable();
  // The buddy whose camp note is being reported.
  const [reportMember, setReportMember] = useState<CampMember | null>(null);
  // Where the note card sits in the panel's scroll content, and its composer within the card: kept above the keyboard.
  const [cardY, setCardY] = useState(0);
  const [composer, setComposer] = useState<{ top: number; bottom: number } | null>(null);
  const input = useRef<TextInput>(null);
  // `busy` disables the buttons only after a re-render; a double tap in one frame sends once.
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // My last shared note, from the server's answer: Clear stays offered even if the re-read after sharing fails.
  const [shared, setShared] = useState<CampNote | null>(null);
  // Each load's number: only the latest one may write, so an older answer never overwrites a newer one.
  const loads = useRef(0);

  const load = useCallback(async () => {
    const n = ++loads.current;
    try {
      const camp = await fetchCamp();
      if (!mounted.current || n !== loads.current) return;
      setState(camp ? { status: 'ready', camp } : { status: 'unavailable' });
      // The camp's note carries no expiry: keep the share answer (its "Live until") while it is still my note.
      const mineNote = camp?.members.find((m) => m.mine)?.note ?? null;
      setShared((s) => (s && mineNote === s.text ? s : null));
    } catch {
      if (!mounted.current || n !== loads.current) return;
      // A failed re-read keeps the camp already on screen, but not buddies' notes: someone unpaired or blocked
      // since may still be in it. Their notes come back with the next good read.
      setState((s) => (s.status === 'ready'
        ? { status: 'ready', camp: { ...s.camp, members: s.camp.members.map((m) => (m.mine ? m : { ...m, note: null })) } }
        : { status: 'error' }));
    }
  }, []);
  // Each focus re-reads the camp; the scene only moves while the page is in front.
  useFocusEffect(useCallback(() => {
    void load();
    setFocused(true);
    return () => setFocused(false);
  }, [load]));

  // Any change re-reads this page and the Social home (the banner's counts, the timeline).
  const changed = useCallback(() => {
    void load();
    void refreshSocial();
  }, [load]);

  async function run(action: () => Promise<unknown>, after?: () => void, failed?: () => void) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (mounted.current) after?.();
      changed();
    } catch (e) {
      if (mounted.current) {
        failed?.();
        setMessage(buddyErrorMessage(buddyErrorCode(e)));
      }
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const night = state.status === 'ready' ? state.camp.night : true;
  // The scene's geometry, once per screen size (and night or day); the ring stays below the floating chrome.
  const geo = useMemo(() => campScene(width, height, night, insets.top), [width, height, night, insets.top]);
  const stops = useMemo(() => panelStops(height, insets), [height, insets]);
  const { stop, moveTo, top } = useCampPanel(stops, reduced);
  // Opening the camp with a screen reader on starts at Half.
  useEffect(() => {
    if (screenReader && stop === 'peek') moveTo('half');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenReader]);

  // As the panel rises the scene dims (22% at Half, 40% at Full) and shifts up so the fire stays above it at Half.
  const lift = Math.max(0, geo.fire.top + geo.fire.height + 16 - stops.half);
  const sceneStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(top.value, [stops.full, stops.half, stops.peek], [-lift - 24, -lift, 0], Extrapolation.CLAMP) }],
  }));
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(top.value, [stops.full, stops.half, stops.peek], [0.4, 0.22, 0], Extrapolation.CLAMP),
  }));
  const headStyle = useAnimatedStyle(() => ({
    opacity: interpolate(top.value, [stops.peek - 60, stops.peek], [0, 1], Extrapolation.CLAMP),
  }));

  const members = state.status === 'ready' ? state.camp.members : null;
  const seated = useMemo(() => (members ?? []).slice(0, SEATS), [members]);
  // Whether the composer is showing (no live note, or editing it), for my coach's tap; set on each render below.
  const drafting = useRef(true);
  const onCoachPress = useCallback((m: CampMember) => {
    if (!m.mine) {
      // Their chat, with their camp note staged (spec §6.1, §8.3); their week on a server without chats.
      if (chats === true) {
        navigation.navigate('ChatThread', m.note
          ? { buddyId: m.person.id, quote: { request: { type: 'camp_note' }, label: campNoteQuoteLabel(personName(m.person, false)) } }
          : { buddyId: m.person.id });
      } else {
        navigation.navigate('BuddyWeek', { buddyId: m.person.id });
      }
      return;
    }
    // Mine: up to Half, at the note.
    moveTo('half');
    if (drafting.current) input.current?.focus();
  }, [navigation, moveTo, chats]);

  if (state.status !== 'ready') {
    return (
      <SafeAreaView testID={`camp-${state.status}`} className="flex-1 bg-background px-5 pt-4">
        <View className="flex-row">
          <BackPill onPress={() => navigation.goBack()} />
        </View>
        {state.status === 'loading' ? <Skeleton className="mt-4 h-64 w-full rounded-card" /> : null}
        {state.status === 'unavailable' ? (
          <Card className="mt-4 gap-2">
            <Text className="font-semibold">The camp isn't open yet</Text>
            <Text className="text-sm text-muted-foreground">Your buddies are still on Social.</Text>
          </Card>
        ) : null}
        {state.status === 'error' ? (
          <Card className="mt-4 gap-3">
            <Text className="text-sm">Couldn't load the camp.</Text>
            <Button testID="camp-retry" variant="secondary" size="sm" className="self-start" onPress={() => void load()}>Try again</Button>
          </Card>
        ) : null}
      </SafeAreaView>
    );
  }

  const { camp } = state;
  const mine = camp.members.find((m) => m.mine) ?? null;
  const more = camp.members.length - seated.length;
  const length = noteLength(draft);
  const canShare = !busy && length > 0 && length <= CAMP_NOTE_MAX;
  const live = shared ? { text: shared.text, expiresAt: shared.expiresAt } : mine?.note ? { text: mine.note, expiresAt: null } : null;
  drafting.current = !live || editing;
  // The draft empties as it is sent and comes back if the server refuses it (unless I've typed again since).
  const share = () => {
    const sent = draft;
    setDraft('');
    void run(
      async () => setShared((await saveCampNote(sent)).note),
      () => setEditing(false),
      () => setDraft((d) => (d === '' ? sent : d)),
    );
  };
  const edit = () => {
    setDraft(live?.text ?? '');
    setEditing(true);
    setTimeout(() => input.current?.focus(), 0);
  };
  // Leaves the edit: the live note stays as it was, nothing is sent.
  const cancelEdit = () => {
    setEditing(false);
    setDraft('');
  };
  const clear = () => void run(clearCampNote, () => {
    setShared(null);
    setEditing(false);
  });
  // The report is filed and "Also block" was ticked: block them now (no second confirm, owner ruling T14).
  const blockReported = () => {
    const m = reportMember;
    setReportMember(null);
    if (!m) return;
    void blockBuddy(m.person.id).then(
      () => {
        void load();
        void refreshSocial();
      },
      (e: unknown) => {
        if (mounted.current) setMessage(buddyErrorMessage(buddyErrorCode(e)));
      },
    );
  };

  return (
    <View testID="campfire" style={{ flex: 1, backgroundColor: geo.sky }}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, sceneStyle]}>
        <CampScene geo={geo} members={seated} lit={camp.night && camp.fire.segments > 0} still={reduced || !focused} onCoachPress={onCoachPress} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#000' }, dimStyle]} />

      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + CHROME.pillsTop, height: CHROME.pillsHeight, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
        <BackPill scene onPress={() => navigation.goBack()} />
        {more > 0 ? (
          <View testID="camp-more" accessible accessibilityLabel={`${more} more at the camp`} className="h-10 flex-row items-center gap-1.5 rounded-full px-3.5" style={PILL}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2DD4BF' }} />
            <Text className="text-[13px] font-semibold text-[#F5F5F4]">{`+${more} here`}</Text>
          </View>
        ) : null}
      </View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: insets.top + CHROME.headlineTop, height: CHROME.headlineHeight, left: 20, right: 20, gap: 2 }, headStyle]}>
        {/* Fixed line heights and one line each, so the chrome ends where the scene's geometry expects it to. */}
        <Text numberOfLines={1} style={{ fontFamily: pixelFont(), fontSize: 12, lineHeight: 16, letterSpacing: 1, color: camp.night ? '#A5B4FC' : '#1E3A5F' }}>{campSceneKicker(new Date(), camp.night)}</Text>
        <Text testID="camp-headline" numberOfLines={1} className="text-[22px] font-bold" style={{ lineHeight: 28, color: camp.night ? '#F5F5F4' : '#0F1E33' }}>{campHeadline(camp)}</Text>
      </Animated.View>

      <CampPanel stops={stops} stop={stop} top={top} moveTo={moveTo} height={height} bottomInset={insets.bottom} screenReader={screenReader}
        reduced={reduced} reveal={composer ? { top: cardY + composer.top, bottom: cardY + composer.bottom } : null} header={<FireMeter camp={camp} />}>
        <View testID="camp-note-slot" onLayout={(e) => setCardY(e.nativeEvent.layout.y)}>
          <CampNoteCard inputRef={input} draft={draft} onDraft={setDraft} length={length} canShare={canShare} onShare={share} live={live}
            editing={editing} onEdit={edit} onCancel={cancelEdit} onClear={clear} busy={busy} message={message} buddies={camp.members.filter((m) => !m.mine).length}
            kipColour={myColour} onComposerLayout={setComposer} />
        </View>

        {/* My own window (owner ruling Q1), not the scene's night: an 18:00 goal opens it at 17:00. */}
        {camp.goodnightOpen ? (
          <GoodnightButton testID="camp-goodnight" look="camp" goodnight={camp.goodnight} onChanged={changed} />
        ) : (
          <View className="h-14 flex-row items-center justify-center gap-2 rounded-[18px] border border-dashed border-border">
            <Ionicons name="moon-outline" size={16} color="#9B9DA6" />
            <Text testID="camp-goodnight-later" className="text-sm text-muted-foreground">{goodnightOpensLine(camp.goodnightOpensAt)}</Text>
          </View>
        )}

        <View className="mt-1 h-px bg-border" />
        <SectionLabel>{`WHO'S HERE · ${camp.members.length}`}</SectionLabel>
        {camp.members.map((m) => (
          <View key={m.person.id} testID={`camp-who-${m.person.id}`} className="flex-row items-start gap-3">
            <PersonKip colour={m.mine ? myColour : m.person.kipColour} state={m.asleep ? 'asleep' : 'none'} size={32} />
            <View className="flex-1 gap-1">
              {/* No line limit: "Who's here" is where a whole note is read (the bubble is one truncated line). */}
              <Text className="text-[15px] leading-5">
                <Text className="font-semibold">{personName(m.person, m.mine)}</Text>
                {' '}
                <Text testID={`camp-who-status-${m.person.id}`} className="text-[13px] text-muted-foreground">{campStatus(m)}</Text>
              </Text>
              {chats === true && !m.mine && m.note ? (
                <Button testID={`camp-report-${m.person.id}`} variant="link" accessibilityRole="button" className="self-start"
                  textClassName="text-xs text-muted-foreground" onPress={() => setReportMember(m)}>Report note</Button>
              ) : null}
            </View>
          </View>
        ))}
        {/* Group chat is out of scope (spec §11): Message camp opens Chats; Buddies on a server without chats. */}
        <Button testID="camp-message-camp" variant="secondary" size="lg" onPress={() => (chats === true ? navigation.navigate('Chats') : navigation.navigate('Buddies'))}>Message camp</Button>
      </CampPanel>
      <ReportSheet
        target={reportMember ? { type: 'camp_note', id: reportMember.person.id } : null}
        name={reportMember ? personName(reportMember.person, false) : ''}
        onClose={() => setReportMember(null)}
        onBlock={blockReported}
      />
    </View>
  );
}
