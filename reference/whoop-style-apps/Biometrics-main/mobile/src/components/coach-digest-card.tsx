import React, { useEffect, useState } from 'react';
import { View, Pressable, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoachConsentRequiredError, CoachDisabledError, fetchLatestDigest, type CoachDigestDTO } from '../api/coach';
import { fetchRecaps } from '../api/recaps';
import { Text } from './ui/text';
import { Character } from './characters/Character';
import { useCharacterMood } from '../characters/useCharacterMood';
import { useScreenFocused } from '../characters/useScreenFocused';
import { SectionLabel } from './ui/section-label';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { TODAY_FOOTNOTE } from './coach/CoachToday';

type State = { status: 'loading' } | { status: 'hidden' } | { status: 'error' } | { status: 'ready'; digest: CoachDigestDTO };

function formatDigestDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// The latest weekly recap from the coach. The caller only mounts this when the
// coach is enabled and consented; it renders nothing at all when there is no
// digest, so a quiet week leaves no empty card. When the digest is the WEEK
// recap's story, tapping it opens that recap instead of the sheet.
export function CoachDigestCard({ onOpenRecap }: { onOpenRecap?: (recapId: string) => void } = {}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [recapId, setRecapId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const mood = useCharacterMood({ sending: false, answeredAt: null });
  const focused = useScreenFocused();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const digest = await fetchLatestDigest();
        if (digest) {
          // The digest endpoint serves the WEEK recap's story with the recap's id (spec 2026-10-04 §2).
          // Settled before the card shows, so a tap always goes where it will go.
          const [week] = await fetchRecaps({ kind: 'WEEK', limit: 1 }).catch(() => []);
          if (!cancelled && week?.id === digest.id) setRecapId(digest.id);
        }
        if (!cancelled) setState(digest ? { status: 'ready', digest } : { status: 'hidden' });
      } catch (e) {
        if (cancelled) return;
        // The server saying the coach is off is not a failure worth showing.
        setState(e instanceof CoachDisabledError || e instanceof CoachConsentRequiredError ? { status: 'hidden' } : { status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'hidden') return null;

  if (state.status === 'loading') {
    return <Skeleton testID="coach-digest-loading" className="h-24 w-full" />;
  }

  if (state.status === 'error') {
    return (
      <Card testID="coach-digest-error">
        <Text className="text-caption text-muted-foreground">Your weekly recap is unavailable right now.</Text>
      </Card>
    );
  }

  const { digest } = state;

  return (
    <>
      <Pressable
        testID="coach-digest-card"
        accessibilityRole="button"
        onPress={() => (recapId && onOpenRecap ? onOpenRecap(recapId) : setOpen(true))}
        className="active:opacity-80"
      >
        <Card className="gap-2.5 border-coach/25 bg-coach/10">
          <View className="flex-row items-center gap-2">
            <Character testID="coach-digest-character" mood={mood} size={18} paused={!focused} />
            <SectionLabel className="flex-1 text-coach">Your weekly recap</SectionLabel>
            <Text testID="coach-digest-date" className="text-caption text-muted-foreground">
              {formatDigestDate(digest.createdAt)}
            </Text>
          </View>
          <Text testID="coach-digest-preview" numberOfLines={3} className="text-heading">
            {digest.text}
          </Text>
          <Text className="text-caption font-semibold text-coach">Tap to read it all →</Text>
        </Card>
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView className="flex-1 bg-background">
          <ScrollView contentContainerStyle={{ gap: 12, padding: 16 }}>
            <View className="flex-row items-center justify-between">
              <Text className="text-heading">Your weekly recap</Text>
              <Text className="text-caption text-muted-foreground">{formatDigestDate(digest.createdAt)}</Text>
            </View>
            <Text testID="coach-digest-full" className="text-body">
              {digest.text}
            </Text>
            <Text testID="coach-digest-footnote" className="text-caption text-muted-foreground">
              {TODAY_FOOTNOTE}
            </Text>
          </ScrollView>
          <View className="items-center p-2">
            <Button testID="coach-digest-close" variant="ghost" onPress={() => setOpen(false)}>
              Close
            </Button>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
