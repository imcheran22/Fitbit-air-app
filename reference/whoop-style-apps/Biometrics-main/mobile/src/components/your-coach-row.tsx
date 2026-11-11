import React, { useContext } from 'react';
import { useCharacterOptional } from '../characters/CharacterContext';
import { ScreenNavigationContext, useScreenFocused } from '../characters/useScreenFocused';
import { Character } from './characters/Character';
import { characterInfo } from './characters/registry';
import {
  DEFAULT_THINKING_ATTACHMENT,
  DEFAULT_THINKING_TEXT,
  THINKING_ATTACHMENT_NAMES,
  THINKING_TEXT_NAMES,
} from './characters/thinking';
import { SettingsGroup, SettingsRow } from './ui/settings-list';

// Profile's "Your coach" group: the current character, small and animating, and
// the way into Meet your coach to switch; under it, the two thinking settings
// (pixel coaches spec §9). It shows whether or not the coach is enabled,
// because the character is also the app's look (spec §5, §6).
export function YourCoachRow() {
  // Context rather than useNavigation(): Settings also renders outside a
  // navigator (see SettingsScreen), and under test stubs of
  // @react-navigation/native that have no NavigationContext.
  const navigation = useContext(ScreenNavigationContext);
  const current = useCharacterOptional();
  const info = characterInfo(current?.characterId);
  const attachment = current?.thinkingAttachment ?? DEFAULT_THINKING_ATTACHMENT;
  const text = current?.thinkingText ?? DEFAULT_THINKING_TEXT;
  // Profile stays mounted under the picker and other tabs; hold still there.
  const focused = useScreenFocused();

  return (
    <SettingsGroup testID="your-coach" label="Your coach" footer="How your coach looks and talks to you.">
      <SettingsRow
        testID="your-coach-row"
        leading={<Character characterId={info.id} mood="idle" size={36} paused={!focused} />}
        title={info.name}
        subtitle={info.tagline}
        accessibilityLabel={`${info.name}, your coach`}
        accessibilityHint="Opens Meet your coach to choose another"
        onPress={() => navigation?.navigate?.('MeetYourCoach', { mode: 'switch' })}
      />
      <SettingsRow
        testID="settings-thinking-style"
        icon="bulb-outline"
        title="Thinking style"
        value={THINKING_ATTACHMENT_NAMES[attachment].name}
        onPress={() => navigation?.navigate?.('ThinkingStyle')}
      />
      <SettingsRow
        testID="settings-thinking-text"
        icon="chatbubble-ellipses-outline"
        title="Thinking text"
        value={THINKING_TEXT_NAMES[text].name}
        onPress={() => navigation?.navigate?.('ThinkingText')}
      />
    </SettingsGroup>
  );
}
