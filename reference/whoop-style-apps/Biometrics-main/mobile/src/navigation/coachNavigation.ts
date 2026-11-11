import type { CoachEntryRoute } from '../lib/useCoachStatus';

interface Navigator {
  navigate: (...args: any[]) => void;
}

// The coach chat is a tab; consent is a stack screen pushed over the tabs. This
// is the one place that knows that, so entry points do not hardcode route names.
// `prefill` is only added to the params when defined, so callers that have none
// navigate with the plainest possible arguments.
//
// `{ pop: true }` matters: in React Navigation v7 a NAVIGATE reuses an existing
// route only when it is the current one or `pop` is set. Without it, opening the
// Coach tab from a pushed screen (consent, score detail) would push a second
// `Tabs` on top instead of returning to the first one.
export function navigateToCoachEntry(navigation: Navigator, route: CoachEntryRoute, prefill?: string): void {
  if (route === 'Coach') {
    navigation.navigate('Tabs', prefill === undefined ? { screen: 'Coach' } : { screen: 'Coach', params: { prefill } }, { pop: true });
    return;
  }
  if (prefill === undefined) navigation.navigate('CoachConsent');
  else navigation.navigate('CoachConsent', { prefill });
}
