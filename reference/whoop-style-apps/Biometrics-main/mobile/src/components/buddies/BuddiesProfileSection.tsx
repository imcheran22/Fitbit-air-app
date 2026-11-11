import React, { useEffect, useRef, useState } from 'react';
import { Switch } from 'react-native';
import { useColorScheme } from 'nativewind';
import {
  SHARE_KEYS, buddyErrorCode, consentToSharing, fetchIdentity, fetchSharing, saveSharing, type BuddyIdentity, type ShareKey, type SharingSettings,
} from '../../api/buddies';
import { SHARE_HINTS, SHARE_TITLES, SHARING_CONSENT_VERSION, buddyErrorMessage } from '../../lib/buddyCopy';
import { useBuddies } from '../../lib/buddiesStore';
import { useRefreshBuddiesOnFocus } from '../../lib/useRefreshBuddiesOnFocus';
import { COLORS } from '../../theme';
import { SettingsGroup, SettingsRow } from '../ui/settings-list';
import { SharingConsentSheet } from './SharingConsentSheet';

const FOOTER = 'Buddies always see your mood and coach. Each number stays off until you turn it on.';
const LOCKED = 'Update the app to change what you share.';
const LOAD_FAILED = "Couldn't load what you share. Please try again later.";

// The server wants (fresh) consent before a switch may turn on: ask again rather than show an error.
const needsConsent = (error: unknown) => {
  const code = buddyErrorCode(error);
  return code === 'consent_required' || code === 'stale_consent_version';
};

// Profile → Buddies (spec 2026-10-06 buddies §7; the Social tab is now the way into buddies): your
// handle and name, "Shared with buddies" (five global switches, all off; turning one on without
// current consent asks for it first, and the switch is saved only after the server accepts it;
// turning one off never asks), and blocked people. A switch shows what the server last confirmed,
// never a value it has not saved. Hidden on an older backend. Nothing here is logged.
export function BuddiesProfileSection({ onNavigate }: { onNavigate: (route: 'BuddyIdentity' | 'BlockedPeople') => void }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const store = useBuddies();
  const focuses = useRefreshBuddiesOnFocus();
  const [identity, setIdentity] = useState<BuddyIdentity | null>(null);
  const [sharing, setSharing] = useState<SharingSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The switch waiting on the consent sheet; the ref is what agree() trusts (a close mid-consent clears it).
  const [consentFor, setConsentFor] = useState<ShareKey | null>(null);
  const pendingKey = useRef<ShareKey | null>(null);
  // In-flight guards (refs, so a second tap before the next render is still ignored) and their
  // disabled states.
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const consenting = useRef(false);
  const [consentBusy, setConsentBusy] = useState(false);
  // Bumped by every answer from a write: a load started earlier never overwrites it.
  const writes = useRef(0);
  const mounted = useRef(true);
  const available = store.status === 'ready';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!available) return;
    let live = true;
    const at = writes.current;
    Promise.all([fetchIdentity(), fetchSharing()])
      .then(([i, s]) => {
        if (!live) return;
        setIdentity(i);
        if (writes.current === at) setSharing(s);
        setLoadFailed(false);
      })
      .catch(() => {
        if (live) setLoadFailed(true);
      });
    return () => {
      live = false;
    };
    // Re-read when buddies become available and on each return to this screen (e.g. after editing
    // the buddy name), not on every refresh of the shared list.
  }, [available, focuses]);

  if (!available) return null;
  const supported = sharing !== null && sharing.consentVersion === SHARING_CONSENT_VERSION;

  function accept(next: SharingSettings) {
    writes.current++;
    setSharing(next);
  }

  function askConsent(key: ShareKey) {
    pendingKey.current = key;
    setConsentFor(key);
  }

  function closeConsent() {
    pendingKey.current = null;
    setConsentFor(null);
  }

  // Re-reads the switches after a consent refusal: a newer server version locks them here and drops
  // the pending switch, so a later reload never reopens an ask the person did not just make.
  function reloadSharing() {
    const at = writes.current;
    fetchSharing()
      .then((s) => {
        if (!mounted.current || writes.current !== at) return;
        setSharing(s);
        if (s.consentVersion !== SHARING_CONSENT_VERSION) closeConsent();
      })
      .catch(() => {});
  }

  async function save(key: ShareKey, value: boolean) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveSharing({ [key]: value });
      if (mounted.current) accept(saved);
    } catch (e) {
      // Nothing changes: the switch still shows the server's last value.
      if (!mounted.current) return;
      if (value && needsConsent(e)) {
        reloadSharing();
        askConsent(key);
      } else {
        setError(buddyErrorMessage(buddyErrorCode(e)));
      }
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function toggle(key: ShareKey, value: boolean) {
    if (!sharing || !supported || saving.current || consenting.current) return;
    if (value && !sharing.consented) {
      askConsent(key);
      return;
    }
    void save(key, value);
  }

  async function agree() {
    const key = pendingKey.current;
    if (!key || consenting.current) return;
    consenting.current = true;
    setConsentBusy(true);
    setError(null);
    try {
      const consented = await consentToSharing(SHARING_CONSENT_VERSION);
      if (!mounted.current) return;
      accept(consented);
    } catch (e) {
      if (!mounted.current) return;
      if (needsConsent(e)) {
        // The sheet stays up; a newer server version hides it and locks the switches.
        reloadSharing();
      } else {
        closeConsent();
        setError(buddyErrorMessage(buddyErrorCode(e)));
      }
      return;
    } finally {
      consenting.current = false;
      if (mounted.current) setConsentBusy(false);
    }
    // Closed while the consent was saving: the switch stays off.
    if (pendingKey.current !== key) return;
    closeConsent();
    await save(key, true);
  }

  const footer = error ?? (sharing === null ? (loadFailed ? LOAD_FAILED : undefined) : supported ? FOOTER : LOCKED);

  return (
    <>
      <SettingsGroup testID="buddies-settings" label="Buddies">
        <SettingsRow
          testID="buddy-identity-row"
          icon="person-circle-outline"
          tint={colors.accent}
          title={identity?.displayName ?? 'Set up your buddy name'}
          subtitle={identity?.handle ? `@${identity.handle}` : 'Pick a handle so friends can find you'}
          onPress={() => onNavigate('BuddyIdentity')}
        />
        <SettingsRow testID="blocked-people-row" icon="hand-left-outline" title="Blocked people" onPress={() => onNavigate('BlockedPeople')} />
      </SettingsGroup>
      <SettingsGroup testID="buddy-sharing" label="Shared with buddies" footer={footer}>
        {sharing
          ? SHARE_KEYS.map((key) => (
              <SettingsRow
                key={key}
                testID={`share-row-${key}`}
                title={SHARE_TITLES[key]}
                subtitle={SHARE_HINTS[key]}
                trailing={
                  <Switch
                    testID={`share-toggle-${key}`}
                    accessibilityLabel={`Share ${SHARE_TITLES[key]} with buddies`}
                    value={sharing[key] === true}
                    disabled={!supported || busy || consentBusy}
                    onValueChange={(value) => toggle(key, value)}
                    trackColor={{ true: colors.accent }}
                  />
                }
              />
            ))
          : null}
      </SettingsGroup>
      <SharingConsentSheet visible={consentFor !== null && supported} busy={consentBusy} onAgree={() => void agree()} onClose={closeConsent} />
    </>
  );
}
