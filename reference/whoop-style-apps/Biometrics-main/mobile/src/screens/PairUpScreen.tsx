import React, { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { buddyErrorCode, createCode, fetchCode, redeemCode, sendBuddyRequest, type BuddyIdentity } from '../api/buddies';
import { IdentityGate } from '../components/buddies/IdentityGate';
import { MoodNoticeSheet } from '../components/buddies/MoodNoticeSheet';
import { useMoodNoticeGate } from '../components/buddies/useMoodNoticeGate';
import { PersonKip } from '../components/kip/PersonKip';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { PageTitle } from '../components/ui/page-title';
import { Text } from '../components/ui/text';
import { TextField } from '../components/ui/text-field';
import { buddyErrorMessage, expiresIn, PAIR_UP_COPY, shareMessage } from '../lib/buddyCopy';
import { refreshBuddies } from '../lib/buddiesStore';
import { offerPushAfterPairing } from '../lib/buddyPushOffer';
import { useMyKipColour } from '../lib/kip/myKipColour';

type Nav = { replace: (name: string, params?: object) => void };
type Code = { code: string; expiresAt: string };

// Pair up (spec 2026-10-06 buddies §7, design 2b): your code (create / share / countdown), enter a
// code, or ask by exact @handle. Every pairing action waits for the one-time mood notice.
export function PairUpScreen() {
  const navigation = useNavigation() as unknown as Nav;
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <IdentityGate>{(identity) => <PairUpBody identity={identity} navigation={navigation} />}</IdentityGate>
    </SafeAreaView>
  );
}

function PairUpBody({ identity, navigation }: { identity: BuddyIdentity; navigation: Nav }) {
  const gate = useMoodNoticeGate(identity.moodNoticeSeen);
  const myColour = useMyKipColour();
  const [code, setCode] = useState<Code | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [entered, setEntered] = useState('');
  const [handle, setHandle] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // `busy` disables the buttons only after a re-render; a double tap in one frame calls the API once.
  const inFlight = useRef(false);
  // Set once a code is made here: the mount's read of the current code may answer after it.
  const created = useRef(false);
  // Work that finishes after the screen is gone touches neither its state nor the navigation.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetchCode()
      .then((c) => {
        if (mounted.current && !created.current) setCode(c);
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    // The interval doesn't run in the background: catch the countdown up on return.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  const active = code && Date.parse(code.expiresAt) > now ? code : null;

  function act(fn: () => Promise<void>) {
    gate.run(() => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setMessage(null);
      void (async () => {
        try {
          await fn();
        } catch (e) {
          // The server's code only: a refused code never says why (a block reads as code_invalid).
          if (mounted.current) setMessage({ text: buddyErrorMessage(buddyErrorCode(e)), error: true });
        } finally {
          inFlight.current = false;
          if (mounted.current) setBusy(false);
        }
      })();
    });
  }

  const shareCode = () =>
    act(async () => {
      // Reuse is decided by the clock now: `active` may be up to one tick old.
      const at = Date.now();
      let current = code && Date.parse(code.expiresAt) > at ? code : null;
      if (!current) {
        current = await createCode();
        created.current = true;
      }
      if (!mounted.current) return;
      const shown = current;
      setCode(shown);
      setNow(Date.now());
      await Share.share({ message: shareMessage(shown.code, shown.expiresAt, Date.now()) });
    });
  const pair = () =>
    act(async () => {
      const { buddyId } = await redeemCode(entered);
      void refreshBuddies();
      if (mounted.current) navigation.replace('BuddyWeek', { buddyId });
      // After the navigation, never awaited: the first pairing on this device offers notifications once.
      void offerPushAfterPairing();
    });
  const request = () =>
    act(async () => {
      await sendBuddyRequest(handle);
      // A mutual ask may pair at once; the refresh shows it in the list.
      void refreshBuddies();
      if (!mounted.current) return;
      // The same words whatever became of it: the sender is never told more (spec §4).
      setMessage({ text: `Request sent to @${handle.trim().replace(/^@/, '').toLowerCase()}.`, error: false });
      setHandle('');
    });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View className="items-center gap-2">
        <PersonKip colour={myColour} size={72} />
        <PageTitle>Pair up with a friend</PageTitle>
        <Text className="text-center text-caption text-muted-foreground">{PAIR_UP_COPY.privacy}</Text>
      </View>

      <Card className="gap-3 p-4">
        <Text className="text-caption text-muted-foreground">Your buddy code</Text>
        {active ? (
          <>
            <Text testID="pair-code" className="text-display font-semibold tracking-widest tabular-nums">{active.code}</Text>
            <Text testID="pair-code-expiry" className="text-caption text-muted-foreground">{expiresIn(active.expiresAt, now)}</Text>
          </>
        ) : null}
        <Button testID="pair-share-or-create" disabled={busy} onPress={shareCode}>Share my code</Button>
      </Card>

      <Card className="gap-3 p-4">
        <TextField label="Enter a friend's code" testID="pair-code-input" value={entered} onChangeText={setEntered} autoCapitalize="characters" />
        <Button testID="pair-redeem" variant="outline" disabled={busy || !entered.trim()} onPress={pair}>Pair up</Button>
      </Card>

      <Card className="gap-3 p-4">
        <TextField label="Or ask by @handle" testID="pair-handle-input" value={handle} onChangeText={setHandle} autoCapitalize="none" />
        <Button testID="pair-request" variant="outline" disabled={busy || !handle.trim()} onPress={request}>Send request</Button>
      </Card>

      {message ? (
        <Text testID="pair-message" className={message.error ? 'text-caption text-destructive' : 'text-caption text-muted-foreground'}>{message.text}</Text>
      ) : null}
      <MoodNoticeSheet {...gate.sheet} />
    </ScrollView>
  );
}
