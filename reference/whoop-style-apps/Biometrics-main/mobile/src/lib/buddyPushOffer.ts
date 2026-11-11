import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { enablePush, getPushState } from './pushRegistration';

// After the first pairing on this device (a redeemed code or an accepted request), offer buddy
// notifications once if this device isn't registered for push yet. "Turn on" runs the existing
// enablePush flow (the only place that may show the system prompt); a denied or unavailable state
// is never asked about. The offer is remembered in SecureStore, like the push token, so it is never
// shown again; if that can't be read or written, nothing is shown (never ask twice). Fire and
// forget: callers navigate first and never wait on this. Nothing here is logged.

const OFFERED_KEY = 'buddyPushOffered';

export const PUSH_OFFER_TITLE = 'Get buddy notifications?';
export const PUSH_OFFER_BODY = 'Know when a buddy sends you a sticker or asks to be your buddy. You can change this in Profile.';

// Calls that overlap share one run, so two pairings at once can't show the offer twice.
let running: Promise<void> | null = null;

export function offerPushAfterPairing(): Promise<void> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<void> {
  try {
    if (await SecureStore.getItemAsync(OFFERED_KEY)) return;
    const state = await getPushState();
    await SecureStore.setItemAsync(OFFERED_KEY, '1');
    if (state.status !== 'off') return;
  } catch {
    return;
  }
  Alert.alert(PUSH_OFFER_TITLE, PUSH_OFFER_BODY, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Turn on', onPress: () => void enablePush().catch(() => undefined) },
  ]);
}
