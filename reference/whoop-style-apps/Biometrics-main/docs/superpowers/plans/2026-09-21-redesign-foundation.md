# Redesign Foundation (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the redesign's foundation: dark-first theme and tokens, a motion kit, the thinking-orb component, and a floating bottom tab bar with the AI-coach orb in the centre, with the existing screens working inside the new tab shell.

**Architecture:** Add `@shopify/react-native-skia` and `thinking-orbs`, vendor the library's React Native port, and gate everything else on a simulator spike (Task 1). Build small, individually tested primitives (`PressableScale`, `Reveal`, `SegmentedControl`, `Sheet`, `Orb`), then a custom `FloatingTabBar` rendered by a `@react-navigation/bottom-tabs` navigator nested inside the existing native stack. Existing screens are re-homed as tabs; Activity and Metrics are placeholders that plans B and later fill.

**Tech Stack:** Expo 57 / React Native 0.86 / React 19, NativeWind 4, Reanimated 4.5, react-native-svg, `@react-navigation` 7 (native-stack + new bottom-tabs), Skia, jest-expo + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-21-app-redesign-design.md` (sections 1, 2, 3). This plan does **not** cover sections 4–6 (heat map, device card, coach screen) or the backend work — those are plans B, C and D, written after this one lands.

## Global Constraints

- Orbs exist at exactly two sizes, `64` and `20`, and are strictly monochrome; ink follows the app theme, never metric colours (spec §3.1, §1.1).
- The orb spike (Task 1) blocks the rest of this plan. If Skia cannot render the orbs, use the SVG fallback (Task 1B); if that also fails, stop and ask the user.
- Default theme becomes **dark**; a stored user choice is still respected (spec §1.1).
- `global.css` (CSS variables) and `theme.ts` (`COLORS`) must stay numerically in sync; a test enforces it for every new token.
- Every animated component renders a correct static state under the OS "reduce motion" setting (spec §1.2). Use Reanimated's `useReducedMotion`.
- Floating bar: about 80 dp tall (`FLOATING_BAR_HEIGHT = 80`), five slots in this order — Home, Activity, **Coach (centre orb)**, Metrics, Profile; the active icon sits in a white circle that slides between slots; the bar hides while the keyboard is open; every item has an accessibility label and role; the orb is labelled "AI coach" (spec §2.3).
- Coach hub when the coach is disabled or its status is unknown: dim, `shaping`, **paused**; tapping still opens the Coach tab (spec §2.4). Other coach entry points keep the existing "hidden unless `coachEntryRoute(status)` is non-null" rule.
- Navigation: the native stack stays the outer navigator; tabs live in one `Tabs` route; detail screens push over the tabs and hide the bar (spec §2.1).
- No new native dependency other than `@shopify/react-native-skia` (installed with `npx expo install`); a dev-client rebuild (`npx expo run:ios`) is required afterwards.
- Vendored third-party code keeps its MIT licence text next to it.
- Tests run with `cd mobile && npx jest`. Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## File Structure

New (all under `mobile/`):

| File | Responsibility |
|---|---|
| `src/components/orb/ThinkingOrb.tsx`, `theme.ts`, `types.ts`, `LICENSE.thinking-orbs`, `README.md` | Vendored RN port of `thinking-orbs` (pinned commit) + provenance |
| `src/components/orb/Orb.tsx` | App wrapper: theme from NativeWind, optional dimming |
| `src/lib/hubOrb.ts` | Pure: coach status → hub orb state/paused/dimmed |
| `src/lib/useKeyboardVisible.ts` | Hook: is the software keyboard open |
| `src/components/ui/pressable-scale.tsx` | Press-scale primitive (+ pure `pressTargets`) |
| `src/components/ui/reveal.tsx` | Staggered entrance (+ pure `revealDelay`) |
| `src/components/ui/segmented-control.tsx` | Sliding-indicator segmented control (+ pure `indicatorOffset`) |
| `src/components/ui/sheet.tsx` | Bottom sheet, drag/tap to dismiss (+ pure `shouldDismiss`) |
| `src/components/themed-status-bar.tsx` | Status bar that follows the app theme |
| `src/navigation/tabBarLayout.ts` | Pure layout helpers, tab order, `useTabBarClearance` |
| `src/navigation/FloatingTabBar.tsx` | The floating pill |
| `src/navigation/TabsNavigator.tsx` | Bottom-tabs navigator using the pill |
| `src/navigation/coachNavigation.ts` | `navigateToCoachEntry` helper |
| `src/screens/TabPlaceholderScreen.tsx` | Interim Activity/Metrics content |
| `src/screens/dev/OrbGalleryScreen.tsx` | Dev-only gallery of all orb states (spike + manual QA) |

Modified: `App.tsx`, `app.json`, `jest-setup.js`, `global.css`, `tailwind.config.js`, `.env.example`, `src/theme.ts`, `src/theme/preference.ts`, `src/theme/ThemeProvider.tsx`, `src/components/ui/button.tsx`, `src/navigation/RootNavigator.tsx`, `src/screens/{DashboardScreen,SettingsScreen,CoachScreen,CoachConsentScreen,ScoreDetailScreen,ConnectHealthScreen}.tsx`, plus the test files named in each task.

One deviation from the spec: it says to vendor four port files; `index.ts` only re-exports the engine and is unused here, so **three** source files are vendored.

---

## Pre-flight

- [ ] **Step 1: Create the implementation branch**

If the spec/plan PR (`app-redesign-spec`) is not merged yet, branch from it so the docs are present:

```bash
git fetch origin
git switch -c redesign-foundation app-redesign-spec   # or: origin/main once merged
```

- [ ] **Step 2: Install and record the baseline**

```bash
cd mobile && npm install
npx jest 2>&1 | tail -8
npx tsc --noEmit 2>&1 | tail -5
```

Expected: note the pass/fail counts and any pre-existing `tsc` errors. "No new failures" later means relative to this baseline.

---

### Task 1: Orb dependencies, vendored port, gallery, and the device spike

**Files:**
- Modify: `mobile/package.json` (via npm), `mobile/App.tsx`, `mobile/jest-setup.js`, `mobile/.env.example`
- Create: `mobile/src/components/orb/{ThinkingOrb.tsx,theme.ts,types.ts,LICENSE.thinking-orbs,README.md}`, `mobile/src/screens/dev/OrbGalleryScreen.tsx`
- Test: `mobile/__tests__/screens/OrbGalleryScreen.test.tsx`

**Interfaces:**
- Produces: `ThinkingOrb` (props `state?: OrbState`, `size?: 64|20`, `theme?: 'auto'|'dark'|'light'`, `speed?`, `paused?`, `accessibilityLabel?`, `style?`) from `src/components/orb/ThinkingOrb`; types `OrbState`, `OrbSize`, `OrbTheme`, `ThinkingOrbProps` from `src/components/orb/types`; `OrbGalleryScreen`; `ORB_STATES: OrbState[]`; a global jest stub for `ThinkingOrb` whose host element has `testID="thinking-orb"` and `accessibilityLabel` `"<state>:<size>:<paused|playing>:<theme>"`.

- [ ] **Step 1: Install the dependencies**

```bash
cd mobile
npx expo install @shopify/react-native-skia
npm install thinking-orbs@0.3.1
```

Expected: `package.json` gains both entries. (Skia's peers — React ≥19, RN ≥0.78, Reanimated ≥4, worklets ≥0.7 — are already met.)

- [ ] **Step 2: Vendor the port at the pinned commit**

```bash
mkdir -p src/components/orb
SHA=de85557ca220332586d070d8788c0e1d6e877a0d
BASE=https://raw.githubusercontent.com/Jakubantalik/thinking-orbs/$SHA
PORT=ports/react-native/thinking-orbs-native/src
curl -fsSL "$BASE/$PORT/ThinkingOrb.tsx" -o src/components/orb/ThinkingOrb.tsx
curl -fsSL "$BASE/$PORT/theme.ts"        -o src/components/orb/theme.ts
curl -fsSL "$BASE/$PORT/types.ts"        -o src/components/orb/types.ts
curl -fsSL "$BASE/LICENSE"               -o src/components/orb/LICENSE.thinking-orbs
wc -c src/components/orb/*
```

Expected sizes: `ThinkingOrb.tsx` 5001, `theme.ts` 2128, `types.ts` 1086, `LICENSE.thinking-orbs` 1070 bytes.

- [ ] **Step 3: Write the provenance README**

Create `mobile/src/components/orb/README.md`:

```markdown
# Orb (vendored)

`ThinkingOrb.tsx`, `theme.ts` and `types.ts` are copied unmodified from
`thinking-orbs-native` (the React Native port inside the `thinking-orbs`
repository, https://github.com/Jakubantalik/thinking-orbs) at commit
`de85557ca220332586d070d8788c0e1d6e877a0d`, MIT licensed
(see `LICENSE.thinking-orbs`). The port is not published to npm, and its
own README says it had not been runtime-verified on a device when copied.
Geometry comes from the npm package `thinking-orbs/engine`.

Use `Orb.tsx` (the app wrapper), not `ThinkingOrb` directly.

## Local changes

None yet.

## Device verification

Not yet verified — see Task 1 of
`docs/superpowers/plans/2026-09-21-redesign-foundation.md`.
```

- [ ] **Step 4: Write the failing gallery test**

Create `mobile/__tests__/screens/OrbGalleryScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { OrbGalleryScreen, ORB_STATES } from '../../src/screens/dev/OrbGalleryScreen';

describe('OrbGalleryScreen', () => {
  it('lists the nine states, each at both sizes', () => {
    const { getAllByTestId, getByText } = render(<OrbGalleryScreen />);

    expect(ORB_STATES).toHaveLength(9);
    // 9 states x (64 + 20)
    expect(getAllByTestId('thinking-orb')).toHaveLength(18);
    for (const state of ORB_STATES) expect(getByText(state)).toBeTruthy();
  });

  it('starts dark and toggles the theme passed to every orb', () => {
    const { getAllByTestId, getByTestId } = render(<OrbGalleryScreen />);
    expect(getAllByTestId('thinking-orb')[0]!.props.accessibilityLabel).toMatch(/:dark$/);

    fireEvent.press(getByTestId('gallery-theme'));

    expect(getAllByTestId('thinking-orb')[0]!.props.accessibilityLabel).toMatch(/:light$/);
  });

  it('pauses every orb', () => {
    const { getAllByTestId, getByTestId } = render(<OrbGalleryScreen />);

    fireEvent.press(getByTestId('gallery-pause'));

    for (const orb of getAllByTestId('thinking-orb')) expect(orb.props.accessibilityLabel).toContain(':paused:');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd mobile && npx jest __tests__/screens/OrbGalleryScreen.test.tsx`
Expected: FAIL — cannot find module `../../src/screens/dev/OrbGalleryScreen`.

- [ ] **Step 6: Add the global jest stub**

Append to `mobile/jest-setup.js`:

```js

// The real ThinkingOrb draws with Skia (native). Every test sees this stub;
// animation is verified manually on a simulator (see the redesign spec, Testing).
jest.mock('./src/components/orb/ThinkingOrb', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ThinkingOrb: ({ state = 'working', size = 64, paused = false, theme = 'auto' }) =>
      React.createElement(View, {
        testID: 'thinking-orb',
        accessibilityLabel: `${state}:${size}:${paused ? 'paused' : 'playing'}:${theme}`,
      }),
  };
});
```

- [ ] **Step 7: Write the gallery screen**

Create `mobile/src/screens/dev/OrbGalleryScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ThinkingOrb } from '../../components/orb/ThinkingOrb';
import type { OrbState, OrbTheme } from '../../components/orb/types';

export const ORB_STATES: OrbState[] = [
  'working',
  'searching',
  'solving',
  'listening',
  'connecting',
  'weaving',
  'composing',
  'breathing',
  'shaping',
];

// Dev-only: every orb state at both sizes, with a theme and a pause toggle.
// Plain React Native styles on purpose, so it works independently of the app's
// theming. Shown by launching with EXPO_PUBLIC_ORB_GALLERY=1 (see App.tsx).
export function OrbGalleryScreen() {
  const [theme, setTheme] = useState<Exclude<OrbTheme, 'auto'>>('dark');
  const [paused, setPaused] = useState(false);
  const dark = theme === 'dark';
  const background = dark ? '#0c0c0d' : '#fafaf9';
  const foreground = dark ? '#f5f5f4' : '#1c1917';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: background }} contentContainerStyle={{ padding: 24, paddingTop: 72, gap: 20 }}>
      <Text style={{ color: foreground, fontSize: 20, fontWeight: '700' }}>Orb gallery</Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Pressable testID="gallery-theme" onPress={() => setTheme(dark ? 'light' : 'dark')}>
          <Text style={{ color: foreground }}>Theme: {theme}</Text>
        </Pressable>
        <Pressable testID="gallery-pause" onPress={() => setPaused(!paused)}>
          <Text style={{ color: foreground }}>{paused ? 'Resume' : 'Pause'}</Text>
        </Pressable>
      </View>
      {ORB_STATES.map((state) => (
        <View key={state} style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <ThinkingOrb state={state} size={64} theme={theme} paused={paused} />
          <ThinkingOrb state={state} size={20} theme={theme} paused={paused} />
          <Text style={{ color: foreground }}>{state}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 8: Show the gallery from `App.tsx` behind a dev flag**

Replace `mobile/App.tsx` with:

```tsx
import './global.css';
import React from 'react';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { OrbGalleryScreen } from './src/screens/dev/OrbGalleryScreen';
import { setBaseUrl } from './src/api/client';

setBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000');

export default function App() {
  // Dev-only escape hatch for looking at every orb state: EXPO_PUBLIC_ORB_GALLERY=1
  if (__DEV__ && process.env.EXPO_PUBLIC_ORB_GALLERY === '1') {
    return <OrbGalleryScreen />;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
```

Append to `mobile/.env.example`:

```
# Dev only: set to 1 to launch straight into the orb gallery instead of the app.
# EXPO_PUBLIC_ORB_GALLERY=1
```

- [ ] **Step 9: Run tests and typecheck**

```bash
cd mobile && npx jest __tests__/screens/OrbGalleryScreen.test.tsx && npx jest 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | tail -10
```

Expected: gallery tests PASS; full suite has no new failures vs baseline; `tsc` has no **new** errors. If `tsc` reports errors inside `src/components/orb/*`, make the smallest fix in the vendored copy and record it under "Local changes" in `orb/README.md`.

- [ ] **Step 10: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/App.tsx mobile/jest-setup.js mobile/.env.example mobile/src/components/orb mobile/src/screens/dev mobile/__tests__/screens/OrbGalleryScreen.test.tsx
git commit -m "Vendor the thinking-orbs RN port and add a dev orb gallery

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 11: SPIKE — verify the orbs on an iOS simulator (blocks Tasks 2–11)**

Requires macOS with Xcode. If a simulator is not available in your environment, stop here and hand this step to the user (`! cd mobile && EXPO_PUBLIC_ORB_GALLERY=1 npx expo run:ios`).

```bash
cd mobile && EXPO_PUBLIC_ORB_GALLERY=1 npx expo run:ios
```

Check every item and write the outcome (date, iOS/simulator version, pass/fail per item) into the "Device verification" section of `orb/README.md`:

1. The app builds and launches on the current simulator SDK (the project ships `plugins/with-ios-scene-delegate.js` for new SDKs).
2. All 18 orbs (9 states × sizes 64 and 20) render, none blank.
3. Each animates smoothly and the nine states look distinct from each other.
4. "Theme: dark/light" flips the ink correctly (light dots on dark, dark dots on light).
5. "Pause" freezes every orb; "Resume" continues.
6. With iOS Settings → Accessibility → Motion → Reduce Motion **on**, orbs show a static frame.
7. Backgrounding the app and returning resumes animation without a crash.

- **All pass:** commit the README update (`docs: record orb device verification`) and continue to Task 2.
- **Skia fails to build or render:** do Task 1B, then repeat this step against the fallback.
- **Both fail:** stop and ask the user.

---

### Task 1B (only if the Skia spike fails): SVG fallback renderer

**Files:**
- Modify: `mobile/src/components/orb/ThinkingOrb.tsx` (replace contents), `mobile/src/components/orb/README.md`

**Interfaces:**
- Produces: the same `ThinkingOrb` props as Task 1 (`state`, `size`, `theme`, `speed`, `paused`, `accessibilityLabel`, `style`), drawn with `react-native-svg` instead of Skia. The jest stub is unaffected.

- [ ] **Step 1: Replace the renderer**

Overwrite `mobile/src/components/orb/ThinkingOrb.tsx`:

```tsx
// SVG fallback for the vendored thinking-orbs port, used because the Skia
// renderer did not work on our stack (see README.md). Geometry still comes
// from `thinking-orbs/engine`; this only turns a frame's dots and lines into
// react-native-svg nodes. Slower than Skia (a React render per frame), so it
// is a fallback, not the intended renderer.
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { MODE_FRAMES, resolvePreset } from 'thinking-orbs/engine';
import { nowSeconds, useAppActive, useReducedMotion, useResolvedDark } from './theme';
import type { ThinkingOrbProps } from './types';

const LABELS: Record<string, string> = {
  working: 'Working…',
  searching: 'Searching…',
  solving: 'Solving…',
  listening: 'Listening…',
  connecting: 'Connecting…',
  weaving: 'Weaving…',
  composing: 'Composing…',
  breathing: 'Thinking…',
  shaping: 'Shaping…',
};

// Same static instant the web and Skia versions show for reduced motion.
const REDUCED_MOTION_T = 0.6;

export function ThinkingOrb({
  state = 'working',
  size = 64,
  theme = 'auto',
  speed = 1,
  paused = false,
  accessibilityLabel,
  style,
}: ThinkingOrbProps) {
  const dark = useResolvedDark(theme);
  const reduced = useReducedMotion();
  const appActive = useAppActive();
  const { mode, speed: baseSpeed, opts } = useMemo(() => resolvePreset(state, size), [state, size]);
  const effectiveSpeed = baseSpeed * speed;
  const build = MODE_FRAMES[mode];

  const [t, setT] = useState(() => (reduced ? REDUCED_MOTION_T : nowSeconds() * effectiveSpeed));

  useEffect(() => {
    if (reduced) {
      setT(REDUCED_MOTION_T);
      return;
    }
    setT(nowSeconds() * effectiveSpeed);
    if (paused || !appActive) return;
    let raf = 0;
    let running = true;
    const loop = () => {
      setT(nowSeconds() * effectiveSpeed);
      if (running) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [effectiveSpeed, paused, reduced, appActive]);

  const frame = build(size, t, opts);
  const ink = (white: number) => {
    const w = Math.min(1, Math.max(0, white));
    const g = Math.round((dark ? 1 - w : w) * 255);
    return `rgb(${g},${g},${g})`;
  };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? LABELS[state]}
      style={[{ width: size, height: size }, style]}
    >
      <Svg width={size} height={size}>
        {frame.lines.map((l, i) => (
          <Line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={ink(l.white)} strokeWidth={l.w} strokeOpacity={l.a ?? 1} />
        ))}
        {frame.dots.map((d, i) => (
          <Circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} fill={ink(d.white)} fillOpacity={d.a ?? 1} />
        ))}
      </Svg>
    </View>
  );
}
```

- [ ] **Step 2: Verify, record, commit**

```bash
cd mobile && npx tsc --noEmit 2>&1 | tail -5 && npx jest __tests__/screens/OrbGalleryScreen.test.tsx
```

Repeat Task 1 Step 11's checklist. Under "Local changes" in `orb/README.md` write "ThinkingOrb.tsx replaced with an SVG renderer because Skia failed: <reason>". Remove the `@shopify/react-native-skia` dependency if it is no longer used (`npm uninstall @shopify/react-native-skia`).

```bash
git add mobile/src/components/orb mobile/package.json mobile/package-lock.json
git commit -m "Render orbs with react-native-svg because the Skia port failed on device

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Dark by default, with a status bar that follows the theme

**Files:**
- Modify: `mobile/src/theme/preference.ts`, `mobile/src/theme/ThemeProvider.tsx`, `mobile/App.tsx`, `mobile/app.json`
- Create: `mobile/src/components/themed-status-bar.tsx`
- Test: `mobile/__tests__/theme/preference.test.ts` (new), `mobile/__tests__/theme/ThemeToggle.test.tsx` (modify), `mobile/__tests__/components/ThemedStatusBar.test.tsx` (new)

**Interfaces:**
- Consumes: `restoreThemePreference`, `setThemePreference`, `nextThemePreference`, `ThemePreference` (existing).
- Produces: `restoreThemePreference()` resolves `'dark'` when nothing valid is stored; `useThemePreference()` defaults to `{ preference: 'dark' }`; `ThemedStatusBar` component.

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/theme/preference.test.ts`:

```ts
import * as SecureStore from 'expo-secure-store';
import { colorScheme } from 'nativewind';
import { restoreThemePreference } from '../../src/theme/preference';

jest.mock('expo-secure-store');
jest.mock('nativewind', () => ({ colorScheme: { set: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('restoreThemePreference', () => {
  it('defaults to dark when nothing is stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await expect(restoreThemePreference()).resolves.toBe('dark');
    expect(colorScheme.set).toHaveBeenCalledWith('dark');
  });

  it('defaults to dark when the stored value is not a known preference', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('sepia');

    await expect(restoreThemePreference()).resolves.toBe('dark');
  });

  it.each(['light', 'dark', 'system'] as const)('respects a stored "%s" choice', async (stored) => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(stored);

    await expect(restoreThemePreference()).resolves.toBe(stored);
    expect(colorScheme.set).toHaveBeenCalledWith(stored);
  });
});
```

In `mobile/__tests__/theme/ThemeToggle.test.tsx`, replace the first test (`'cycles system -> light -> dark and persists each choice'`) with:

```tsx
  it('starts dark, then cycles dark -> system -> light and persists each choice', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const { getByTestId } = render(
      <ThemeProvider>
        <ThemeToggle color="#000" />
      </ThemeProvider>,
    );

    await waitFor(() => expect(colorScheme.set).toHaveBeenCalledWith('dark'));

    fireEvent.press(getByTestId('theme-toggle-button'));
    await waitFor(() => expect(colorScheme.set).toHaveBeenCalledWith('system'));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('themePreference', 'system');

    fireEvent.press(getByTestId('theme-toggle-button'));
    await waitFor(() => expect(colorScheme.set).toHaveBeenCalledWith('light'));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('themePreference', 'light');
  });
```

Create `mobile/__tests__/components/ThemedStatusBar.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemedStatusBar } from '../../src/components/themed-status-bar';

let mockScheme: 'light' | 'dark' = 'dark';
jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: mockScheme }) }));
jest.mock('expo-status-bar', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  return { StatusBar: ({ style }: { style: string }) => ReactLib.createElement(Text, { testID: 'status-bar' }, style) };
});

describe('ThemedStatusBar', () => {
  it('uses light content on the dark theme', () => {
    mockScheme = 'dark';
    expect(render(<ThemedStatusBar />).getByTestId('status-bar')).toHaveTextContent('light');
  });

  it('uses dark content on the light theme', () => {
    mockScheme = 'light';
    expect(render(<ThemedStatusBar />).getByTestId('status-bar')).toHaveTextContent('dark');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest __tests__/theme __tests__/components/ThemedStatusBar.test.tsx`
Expected: FAIL — `restoreThemePreference` resolves `'system'`; the ThemeToggle test never sees `'dark'` first; `themed-status-bar` module missing.

- [ ] **Step 3: Implement**

In `mobile/src/theme/preference.ts` change the fallback:

```ts
  const preference = isThemePreference(stored) ? stored : 'dark';
```

In `mobile/src/theme/ThemeProvider.tsx` change the two initial values:

```tsx
const ThemeContext = createContext<ThemeContextValue>({ preference: 'dark', cyclePreference: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('dark');
```

Create `mobile/src/components/themed-status-bar.tsx`:

```tsx
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';

// The theme is a manual toggle, not the OS setting, so "auto" would pick the
// wrong content colour: follow NativeWind's resolved scheme instead.
export function ThemedStatusBar() {
  const { colorScheme } = useColorScheme();
  return <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />;
}
```

In `mobile/App.tsx` add `import { ThemedStatusBar } from './src/components/themed-status-bar';` and render it inside `ThemeProvider`:

```tsx
    <ThemeProvider>
      <ThemedStatusBar />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
```

In `mobile/app.json` change `"userInterfaceStyle": "light"` to `"userInterfaceStyle": "automatic"` (a `"light"` lock stops iOS drawing native chrome — keyboard, alerts — dark).

- [ ] **Step 4: Run to verify they pass**

Run: `cd mobile && npx jest __tests__/theme __tests__/components/ThemedStatusBar.test.tsx && npx tsc --noEmit 2>&1 | tail -3`
Expected: PASS, no new `tsc` errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/theme mobile/src/components/themed-status-bar.tsx mobile/App.tsx mobile/app.json mobile/__tests__/theme mobile/__tests__/components/ThemedStatusBar.test.tsx
git commit -m "Make dark the default theme and theme the status bar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Semantic colour tokens

**Files:**
- Modify: `mobile/global.css`, `mobile/tailwind.config.js`, `mobile/src/theme.ts`
- Test: `mobile/__tests__/theme/tokens.test.ts`

**Interfaces:**
- Produces: CSS variables `--color-{surface-raised,hairline,bar,bar-icon,bar-active,bar-icon-active,heat-empty,heat-0..heat-4}`; Tailwind colours of the same names (`bg-bar`, `border-hairline`, `bg-surface-raised`, `bg-bar-active`, `bg-heat-3`, …); `COLORS.light/dark` keys `surfaceRaised, hairline, bar, barIcon, barActive, barIconActive, heatEmpty, heat0, heat1, heat2, heat3, heat4` as `'rgb(r, g, b)'` strings. The existing `card` token already serves as the spec's `surface`; no new token for it.

- [ ] **Step 1: Write the failing sync test**

Create `mobile/__tests__/theme/tokens.test.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { COLORS } from '../../src/theme';

const css = fs.readFileSync(path.join(__dirname, '../../global.css'), 'utf8');
const tailwind = fs.readFileSync(path.join(__dirname, '../../tailwind.config.js'), 'utf8');
const [lightBlock, darkBlock] = css.split('@media (prefers-color-scheme: dark)') as [string, string];

function readVar(block: string, name: string): string {
  const match = block.match(new RegExp(`--color-${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`));
  if (!match) throw new Error(`--color-${name} not found`);
  return `rgb(${match[1]}, ${match[2]}, ${match[3]})`;
}

// CSS variable name -> COLORS key. Only the tokens added by the redesign.
const NEW_TOKENS: Array<[string, string]> = [
  ['surface-raised', 'surfaceRaised'],
  ['hairline', 'hairline'],
  ['bar', 'bar'],
  ['bar-icon', 'barIcon'],
  ['bar-active', 'barActive'],
  ['bar-icon-active', 'barIconActive'],
  ['heat-empty', 'heatEmpty'],
  ['heat-0', 'heat0'],
  ['heat-1', 'heat1'],
  ['heat-2', 'heat2'],
  ['heat-3', 'heat3'],
  ['heat-4', 'heat4'],
];

describe('design tokens', () => {
  it.each(NEW_TOKENS)('--color-%s is identical in global.css and COLORS.%s (light and dark)', (cssName, key) => {
    expect((COLORS.light as Record<string, string>)[key]).toBe(readVar(lightBlock, cssName));
    expect((COLORS.dark as Record<string, string>)[key]).toBe(readVar(darkBlock, cssName));
  });

  it.each(NEW_TOKENS)('--color-%s is registered with Tailwind', (cssName) => {
    expect(tailwind).toContain(`var(--color-${cssName})`);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx jest __tests__/theme/tokens.test.ts`
Expected: FAIL — `--color-surface-raised not found`.

- [ ] **Step 3: Add the CSS variables**

In `mobile/global.css`, insert after `--color-score-poor: 220 38 38;` (end of the light `:root` block):

```css
  --color-surface-raised: 255 255 255;
  --color-hairline: 231 229 228;
  --color-bar: 24 24 27;
  --color-bar-icon: 212 212 216;
  --color-bar-active: 250 250 249;
  --color-bar-icon-active: 24 24 27;
  --color-heat-empty: 245 245 244;
  --color-heat-0: 231 229 228;
  --color-heat-1: 254 215 170;
  --color-heat-2: 253 186 116;
  --color-heat-3: 251 146 60;
  --color-heat-4: 234 88 12;
```

and after `--color-score-poor: 248 113 113;` (end of the dark block):

```css
    --color-surface-raised: 32 32 36;
    --color-hairline: 58 58 64;
    --color-bar: 28 28 31;
    --color-bar-icon: 212 212 216;
    --color-bar-active: 250 250 249;
    --color-bar-icon-active: 12 12 13;
    --color-heat-empty: 20 20 23;
    --color-heat-0: 39 39 42;
    --color-heat-1: 124 45 18;
    --color-heat-2: 194 65 12;
    --color-heat-3: 234 88 12;
    --color-heat-4: 251 146 60;
```

- [ ] **Step 4: Register them with Tailwind**

In `mobile/tailwind.config.js`, after the `'score-poor'` line add:

```js
        'surface-raised': 'rgb(var(--color-surface-raised) / <alpha-value>)',
        hairline: 'rgb(var(--color-hairline) / <alpha-value>)',
        bar: 'rgb(var(--color-bar) / <alpha-value>)',
        'bar-icon': 'rgb(var(--color-bar-icon) / <alpha-value>)',
        'bar-active': 'rgb(var(--color-bar-active) / <alpha-value>)',
        'bar-icon-active': 'rgb(var(--color-bar-icon-active) / <alpha-value>)',
        'heat-empty': 'rgb(var(--color-heat-empty) / <alpha-value>)',
        'heat-0': 'rgb(var(--color-heat-0) / <alpha-value>)',
        'heat-1': 'rgb(var(--color-heat-1) / <alpha-value>)',
        'heat-2': 'rgb(var(--color-heat-2) / <alpha-value>)',
        'heat-3': 'rgb(var(--color-heat-3) / <alpha-value>)',
        'heat-4': 'rgb(var(--color-heat-4) / <alpha-value>)',
```

- [ ] **Step 5: Mirror them in `COLORS`**

In `mobile/src/theme.ts`, inside `COLORS.light` after `scorePoor`:

```ts
    surfaceRaised: 'rgb(255, 255, 255)',
    hairline: 'rgb(231, 229, 228)',
    bar: 'rgb(24, 24, 27)',
    barIcon: 'rgb(212, 212, 216)',
    barActive: 'rgb(250, 250, 249)',
    barIconActive: 'rgb(24, 24, 27)',
    heatEmpty: 'rgb(245, 245, 244)',
    heat0: 'rgb(231, 229, 228)',
    heat1: 'rgb(254, 215, 170)',
    heat2: 'rgb(253, 186, 116)',
    heat3: 'rgb(251, 146, 60)',
    heat4: 'rgb(234, 88, 12)',
```

and inside `COLORS.dark` after `scorePoor`:

```ts
    surfaceRaised: 'rgb(32, 32, 36)',
    hairline: 'rgb(58, 58, 64)',
    bar: 'rgb(28, 28, 31)',
    barIcon: 'rgb(212, 212, 216)',
    barActive: 'rgb(250, 250, 249)',
    barIconActive: 'rgb(12, 12, 13)',
    heatEmpty: 'rgb(20, 20, 23)',
    heat0: 'rgb(39, 39, 42)',
    heat1: 'rgb(124, 45, 18)',
    heat2: 'rgb(194, 65, 12)',
    heat3: 'rgb(234, 88, 12)',
    heat4: 'rgb(251, 146, 60)',
```

- [ ] **Step 6: Run to verify it passes, then the full suite**

Run: `cd mobile && npx jest __tests__/theme/tokens.test.ts && npx jest 2>&1 | tail -6`
Expected: 24 token assertions PASS; no new failures.

- [ ] **Step 7: Commit**

```bash
git add mobile/global.css mobile/tailwind.config.js mobile/src/theme.ts mobile/__tests__/theme/tokens.test.ts
git commit -m "Add floating-bar, raised-surface and heat-map colour tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Motion tokens and `PressableScale`

**Files:**
- Modify: `mobile/src/theme.ts` (`MOTION`), `mobile/src/components/ui/button.tsx`
- Create: `mobile/src/components/ui/pressable-scale.tsx`
- Test: `mobile/__tests__/components/PressableScale.test.tsx`

**Interfaces:**
- Produces: `MOTION.spring.press`/`.settle` (`{ damping, stiffness }`), `MOTION.press` (`{ scale: 0.96, reducedOpacity: 0.7 }`), `MOTION.stagger` (`70`), `MOTION.duration.reveal` (`400`); `pressTargets(reduced: boolean, pressed: boolean): { scale: number; opacity: number }`; `PressableScale` and type `PressableScaleProps` (`Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; className?: string }`).

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/components/PressableScale.test.tsx`:

```tsx
import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { PressableScale, pressTargets } from '../../src/components/ui/pressable-scale';
import { MOTION } from '../../src/theme';

describe('pressTargets', () => {
  it('rests at full size and opacity', () => {
    expect(pressTargets(false, false)).toEqual({ scale: 1, opacity: 1 });
    expect(pressTargets(true, false)).toEqual({ scale: 1, opacity: 1 });
  });

  it('shrinks when pressed', () => {
    expect(pressTargets(false, true)).toEqual({ scale: MOTION.press.scale, opacity: 1 });
  });

  it('only dims, without changing size, when pressed with reduced motion', () => {
    expect(pressTargets(true, true)).toEqual({ scale: 1, opacity: MOTION.press.reducedOpacity });
  });
});

describe('PressableScale', () => {
  it('calls onPress and forwards testID and accessibility props', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <PressableScale testID="p" accessibilityRole="button" accessibilityLabel="Go" onPress={onPress}>
        <Text>Go</Text>
      </PressableScale>,
    );

    fireEvent.press(getByTestId('p'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(getByTestId('p').props.accessibilityLabel).toBe('Go');
  });

  it('still forwards onPressIn and onPressOut', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const { getByTestId } = render(
      <PressableScale testID="p" onPressIn={onPressIn} onPressOut={onPressOut}>
        <Text>Go</Text>
      </PressableScale>,
    );

    fireEvent(getByTestId('p'), 'pressIn');
    fireEvent(getByTestId('p'), 'pressOut');

    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <PressableScale testID="p" disabled onPress={onPress}>
        <Text>Go</Text>
      </PressableScale>,
    );

    fireEvent.press(getByTestId('p'));

    expect(onPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx jest __tests__/components/PressableScale.test.tsx`
Expected: FAIL — module `pressable-scale` not found.

- [ ] **Step 3: Extend `MOTION`**

In `mobile/src/theme.ts` replace the `MOTION` object with:

```ts
export const MOTION = {
  duration: {
    fast: 150,
    normal: 300,
    slow: 600,
    reveal: 400,
  },
  easing: {
    standard: [0.4, 0, 0.2, 1] as const,
    decelerate: [0, 0, 0.2, 1] as const,
  },
  // Spring configs shared by every pressable and sliding indicator, so no
  // component inlines its own numbers.
  spring: {
    press: { damping: 15, stiffness: 300 },
    settle: { damping: 20, stiffness: 200 },
  },
  // A pressed control settles at `scale`; with reduced motion it only dims to
  // `reducedOpacity` instead of changing size.
  press: { scale: 0.96, reducedOpacity: 0.7 },
  // Delay between consecutive staggered entrances, in ms.
  stagger: 70,
};
```

- [ ] **Step 4: Write `PressableScale`**

Create `mobile/src/components/ui/pressable-scale.tsx`:

```tsx
import React from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { MOTION } from '../../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  className?: string;
};

// Where a control settles while pressed. Pure so the reduced-motion rule is
// unit-testable: with reduced motion it dims instead of scaling.
export function pressTargets(reduced: boolean, pressed: boolean): { scale: number; opacity: number } {
  if (!pressed) return { scale: 1, opacity: 1 };
  return reduced ? { scale: 1, opacity: MOTION.press.reducedOpacity } : { scale: MOTION.press.scale, opacity: 1 };
}

export function PressableScale({ onPressIn, onPressOut, style, ...props }: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  function animateTo(pressed: boolean) {
    const target = pressTargets(reduced, pressed);
    scale.value = withSpring(target.scale, MOTION.spring.press);
    opacity.value = withSpring(target.opacity, MOTION.spring.press);
  }

  return (
    <AnimatedPressable
      style={[style, animatedStyle]}
      onPressIn={(e: GestureResponderEvent) => {
        animateTo(true);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        animateTo(false);
        onPressOut?.(e);
      }}
      {...props}
    />
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd mobile && npx jest __tests__/components/PressableScale.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Make `Button` use it**

Replace the body of `mobile/src/components/ui/button.tsx` below the `textVariants` definition (keep `buttonVariants` and `textVariants` exactly as they are) so the imports and component read:

```tsx
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Text } from './text';
import { PressableScale, type PressableScaleProps } from './pressable-scale';
```

(remove the now-unused `Pressable`, `PressableProps`, `GestureResponderEvent`, `Animated…` imports and the `AnimatedPressable` constant), then:

```tsx
interface ButtonProps extends PressableScaleProps, VariantProps<typeof buttonVariants> {
  children: React.ReactNode;
}

export function Button({ className, variant, size, children, ...props }: ButtonProps) {
  return (
    <PressableScale className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {typeof children === 'string' ? <Text className={textVariants({ variant })}>{children}</Text> : children}
    </PressableScale>
  );
}
```

- [ ] **Step 7: Full suite and typecheck**

Run: `cd mobile && npx jest 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | tail -5`
Expected: no new failures or type errors (every screen that presses a `Button` exercises the refactor).

- [ ] **Step 8: Commit**

```bash
git add mobile/src/theme.ts mobile/src/components/ui/pressable-scale.tsx mobile/src/components/ui/button.tsx mobile/__tests__/components/PressableScale.test.tsx
git commit -m "Add motion tokens and PressableScale; build Button on it

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `Reveal` and `SegmentedControl`

**Files:**
- Create: `mobile/src/components/ui/reveal.tsx`, `mobile/src/components/ui/segmented-control.tsx`
- Test: `mobile/__tests__/components/Reveal.test.tsx`, `mobile/__tests__/components/SegmentedControl.test.tsx`

**Interfaces:**
- Consumes: `MOTION` (Task 4), `cn` from `src/lib/utils`, `Text` from `ui/text`.
- Produces: `revealDelay(index: number): number`; `Reveal` (props `index?: number` + `ViewProps` + `className?`); `indicatorOffset(index: number, innerWidth: number, count: number): number`; `SegmentedControl<T extends string>` (props `options: Array<{ value: T; label: string }>`, `value: T`, `onChange: (value: T) => void`, `testID?: string`); segment testIDs are `${testID}-${value}` (default `testID` `"segmented"`).

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/components/Reveal.test.tsx`:

```tsx
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Reveal, revealDelay } from '../../src/components/ui/reveal';
import { MOTION } from '../../src/theme';

describe('revealDelay', () => {
  it('starts the first item immediately and steps each later one', () => {
    expect(revealDelay(0)).toBe(0);
    expect(revealDelay(3)).toBe(3 * MOTION.stagger);
  });

  it('never returns a negative delay', () => {
    expect(revealDelay(-2)).toBe(0);
  });
});

describe('Reveal', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <Reveal index={2}>
        <Text>hello</Text>
      </Reveal>,
    );
    expect(getByText('hello')).toBeTruthy();
  });
});
```

Create `mobile/__tests__/components/SegmentedControl.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SegmentedControl, indicatorOffset } from '../../src/components/ui/segmented-control';

describe('indicatorOffset', () => {
  it('places segment i at i * (width / count)', () => {
    expect(indicatorOffset(0, 300, 3)).toBe(0);
    expect(indicatorOffset(1, 300, 3)).toBe(100);
    expect(indicatorOffset(2, 300, 3)).toBe(200);
  });

  it('is 0 before layout or with no options', () => {
    expect(indicatorOffset(2, 0, 3)).toBe(0);
    expect(indicatorOffset(0, 300, 0)).toBe(0);
  });
});

const OPTIONS = [
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'ytd', label: 'YTD' },
] as const;

describe('SegmentedControl', () => {
  it('renders every label and marks the current value selected', () => {
    const { getByText, getByTestId } = render(
      <SegmentedControl options={[...OPTIONS]} value="year" onChange={() => {}} testID="seg" />,
    );

    expect(getByText('Month')).toBeTruthy();
    expect(getByText('YTD')).toBeTruthy();
    expect(getByTestId('seg-year').props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId('seg-month').props.accessibilityState).toEqual({ selected: false });
  });

  it('reports the tapped value', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<SegmentedControl options={[...OPTIONS]} value="month" onChange={onChange} testID="seg" />);

    fireEvent.press(getByTestId('seg-ytd'));

    expect(onChange).toHaveBeenCalledWith('ytd');
  });

  it('survives a layout event', () => {
    const { getByTestId } = render(<SegmentedControl options={[...OPTIONS]} value="month" onChange={() => {}} testID="seg" />);

    fireEvent(getByTestId('seg-inner'), 'layout', { nativeEvent: { layout: { width: 300, height: 40, x: 0, y: 0 } } });

    expect(getByTestId('seg-month')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest __tests__/components/Reveal.test.tsx __tests__/components/SegmentedControl.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `Reveal`**

Create `mobile/src/components/ui/reveal.tsx`:

```tsx
import React from 'react';
import type { ViewProps } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { MOTION } from '../../theme';

export function revealDelay(index: number): number {
  return Math.max(0, index) * MOTION.stagger;
}

// Staggered fade-up entrance. With reduced motion the content simply appears.
export function Reveal({ index = 0, children, ...props }: ViewProps & { index?: number; className?: string; children?: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.delay(revealDelay(index)).duration(MOTION.duration.reveal)} {...props}>
      {children}
    </Animated.View>
  );
}
```

- [ ] **Step 4: Implement `SegmentedControl`**

Create `mobile/src/components/ui/segmented-control.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { cn } from '../../lib/utils';
import { MOTION } from '../../theme';
import { Text } from './text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function indicatorOffset(index: number, innerWidth: number, count: number): number {
  if (count <= 0 || innerWidth <= 0) return 0;
  return index * (innerWidth / count);
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, testID = 'segmented' }: SegmentedControlProps<T>) {
  const reduced = useReducedMotion();
  const [innerWidth, setInnerWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segmentWidth = options.length > 0 ? innerWidth / options.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = indicatorOffset(index, innerWidth, options.length);
    x.value = reduced ? target : withSpring(target, MOTION.spring.settle);
  }, [index, innerWidth, options.length, reduced, x]);

  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View testID={testID} accessibilityRole="tablist" className="rounded-xl bg-muted p-1">
      <View testID={`${testID}-inner`} className="flex-row" onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}>
        {innerWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            className="absolute bottom-0 left-0 top-0 rounded-lg bg-card"
            style={[{ width: segmentWidth }, indicatorStyle]}
          />
        ) : null}
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              testID={`${testID}-${option.value}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              className="flex-1 items-center py-2"
            >
              <Text className={cn('text-sm font-medium', selected ? 'text-foreground' : 'text-muted-foreground')}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd mobile && npx jest __tests__/components/Reveal.test.tsx __tests__/components/SegmentedControl.test.tsx && npx tsc --noEmit 2>&1 | tail -3`
Expected: PASS (8 tests); no new type errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/ui/reveal.tsx mobile/src/components/ui/segmented-control.tsx mobile/__tests__/components/Reveal.test.tsx mobile/__tests__/components/SegmentedControl.test.tsx
git commit -m "Add Reveal and SegmentedControl motion primitives

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `Sheet`

**Files:**
- Create: `mobile/src/components/ui/sheet.tsx`
- Test: `mobile/__tests__/components/Sheet.test.tsx`

**Interfaces:**
- Consumes: `MOTION`, tokens `bg-surface-raised` / `border-hairline` / `bg-border` (Task 3).
- Produces: `shouldDismiss(dy: number, vy: number): boolean` (`dy > 80 || vy > 0.8`), `DISMISS_DISTANCE`, `DISMISS_VELOCITY`; `Sheet` (props `visible: boolean`, `onClose: () => void`, `children`, `testID?: string`, default `"sheet"`). Renders nothing when not `visible`; testIDs `${testID}`, `${testID}-backdrop`, `${testID}-handle`. Dismissing (backdrop tap, back button, or a downward drag past the threshold) animates out and then calls `onClose` once.

- [ ] **Step 1: Write the failing test**

Create `mobile/__tests__/components/Sheet.test.tsx`:

```tsx
import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Sheet, shouldDismiss, DISMISS_DISTANCE, DISMISS_VELOCITY } from '../../src/components/ui/sheet';
import { MOTION } from '../../src/theme';

describe('shouldDismiss', () => {
  it('dismisses on a long downward drag', () => {
    expect(shouldDismiss(DISMISS_DISTANCE + 1, 0)).toBe(true);
  });

  it('dismisses on a fast downward flick', () => {
    expect(shouldDismiss(10, DISMISS_VELOCITY + 0.1)).toBe(true);
  });

  it('snaps back on a short, slow drag or an upward drag', () => {
    expect(shouldDismiss(DISMISS_DISTANCE - 1, DISMISS_VELOCITY - 0.1)).toBe(false);
    expect(shouldDismiss(-50, -2)).toBe(false);
  });
});

describe('Sheet', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renders its children only while visible', () => {
    const { queryByText, rerender } = render(
      <Sheet visible={false} onClose={() => {}}>
        <Text>details</Text>
      </Sheet>,
    );
    expect(queryByText('details')).toBeNull();

    rerender(
      <Sheet visible onClose={() => {}}>
        <Text>details</Text>
      </Sheet>,
    );
    expect(queryByText('details')).toBeTruthy();
  });

  it('closes once after the exit animation when the backdrop is tapped', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <Sheet visible onClose={onClose}>
        <Text>details</Text>
      </Sheet>,
    );

    fireEvent.press(getByTestId('sheet-backdrop'));
    fireEvent.press(getByTestId('sheet-backdrop'));
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(MOTION.duration.normal + 10);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx jest __tests__/components/Sheet.test.tsx`
Expected: FAIL — module `sheet` not found.

- [ ] **Step 3: Implement**

Create `mobile/src/components/ui/sheet.tsx`:

```tsx
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Modal, PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { MOTION } from '../../theme';

export const DISMISS_DISTANCE = 80;
export const DISMISS_VELOCITY = 0.8;

export function shouldDismiss(dy: number, vy: number): boolean {
  return dy > DISMISS_DISTANCE || vy > DISMISS_VELOCITY;
}

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
}

// Bottom detail sheet. Slides in on show; a backdrop tap, the Android back
// button, or a downward drag on the handle slides it out and then calls
// `onClose` exactly once. (A parent that flips `visible` off directly just
// makes it disappear, without the exit animation.)
export function Sheet({ visible, onClose, children, testID = 'sheet' }: SheetProps) {
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const translateY = useSharedValue(height);
  const closing = useRef(false);

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    translateY.value = height;
    translateY.value = reduced ? 0 : withSpring(0, MOTION.spring.settle);
  }, [visible, height, reduced, translateY]);

  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reduced) {
      onClose();
      return;
    }
    translateY.value = withTiming(height, { duration: MOTION.duration.normal });
    setTimeout(onClose, MOTION.duration.normal);
  }, [height, onClose, reduced, translateY]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_e, g) => {
          translateY.value = Math.max(0, g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          if (shouldDismiss(g.dy, g.vy)) dismiss();
          else translateY.value = withSpring(0, MOTION.spring.settle);
        },
      }),
    [dismiss, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent onRequestClose={dismiss}>
      <View testID={testID} className="flex-1 justify-end">
        <Pressable
          testID={`${testID}-backdrop`}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={dismiss}
          className="absolute inset-0 bg-black/50"
        />
        <Animated.View style={sheetStyle} className="rounded-t-3xl border border-hairline bg-surface-raised px-4 pb-8 pt-2">
          <View testID={`${testID}-handle`} className="items-center py-2" {...pan.panHandlers}>
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && npx jest __tests__/components/Sheet.test.tsx && npx tsc --noEmit 2>&1 | tail -3`
Expected: PASS (5 tests); no new type errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui/sheet.tsx mobile/__tests__/components/Sheet.test.tsx
git commit -m "Add a drag-to-dismiss bottom Sheet

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: `Orb` wrapper and hub-orb mapping

**Files:**
- Create: `mobile/src/components/orb/Orb.tsx`, `mobile/src/lib/hubOrb.ts`
- Test: `mobile/__tests__/components/Orb.test.tsx`, `mobile/__tests__/lib/hubOrb.test.ts`

**Interfaces:**
- Consumes: `ThinkingOrb` (Task 1, stubbed in jest), `OrbState`/`OrbSize` types, `CoachStatusDTO` from `src/api/coach`.
- Produces: `Orb` (props `state: OrbState`, `size: OrbSize`, `paused?: boolean`, `dimmed?: boolean`, `label?: string`, `testID?: string`; wrapper `View` carries `testID` and `opacity` `DIMMED_OPACITY` (0.45) when dimmed); `hubOrbAppearance(status: CoachStatusDTO | null, coachTabActive: boolean): { state: OrbState; paused: boolean; dimmed: boolean }`.

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/lib/hubOrb.test.ts`:

```ts
import { hubOrbAppearance } from '../../src/lib/hubOrb';
import type { CoachStatusDTO } from '../../src/api/coach';

const enabled: CoachStatusDTO = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: [] },
  personaId: 'encouraging',
  personas: [],
};

describe('hubOrbAppearance', () => {
  it('is dim, paused and shaping when the status is unknown', () => {
    expect(hubOrbAppearance(null, false)).toEqual({ state: 'shaping', paused: true, dimmed: true });
  });

  it('is dim, paused and shaping when the coach is disabled, even on the Coach tab', () => {
    expect(hubOrbAppearance({ ...enabled, enabled: false }, true)).toEqual({ state: 'shaping', paused: true, dimmed: true });
  });

  it('breathes dimmed while the coach is enabled and another tab is active', () => {
    expect(hubOrbAppearance(enabled, false)).toEqual({ state: 'breathing', paused: false, dimmed: true });
  });

  it('breathes at full brightness on the Coach tab', () => {
    expect(hubOrbAppearance(enabled, true)).toEqual({ state: 'breathing', paused: false, dimmed: false });
  });

  it('treats an enabled-but-not-consented coach like an enabled one', () => {
    expect(hubOrbAppearance({ ...enabled, consented: false }, false)).toEqual({ state: 'breathing', paused: false, dimmed: true });
  });
});
```

Create `mobile/__tests__/components/Orb.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { Orb, DIMMED_OPACITY } from '../../src/components/orb/Orb';

let mockScheme: 'light' | 'dark' | undefined = 'dark';
jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: mockScheme }) }));

describe('Orb', () => {
  it('passes state, size and pause to the orb and pins its theme to the app theme', () => {
    mockScheme = 'light';
    const { getByTestId } = render(<Orb state="breathing" size={64} paused testID="o" />);

    expect(getByTestId('thinking-orb').props.accessibilityLabel).toBe('breathing:64:paused:light');
  });

  it('defaults to the dark ink when the scheme is not known', () => {
    mockScheme = undefined;
    const { getByTestId } = render(<Orb state="working" size={20} />);

    expect(getByTestId('thinking-orb').props.accessibilityLabel).toBe('working:20:playing:dark');
  });

  it('is full opacity normally and dimmed when asked', () => {
    mockScheme = 'dark';
    const { getByTestId, rerender } = render(<Orb state="breathing" size={64} testID="o" />);
    expect(getByTestId('o')).toHaveStyle({ opacity: 1 });

    rerender(<Orb state="breathing" size={64} dimmed testID="o" />);
    expect(getByTestId('o')).toHaveStyle({ opacity: DIMMED_OPACITY });
  });

  it('is exactly its size square', () => {
    mockScheme = 'dark';
    const { getByTestId } = render(<Orb state="breathing" size={64} testID="o" />);
    expect(getByTestId('o')).toHaveStyle({ width: 64, height: 64 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest __tests__/lib/hubOrb.test.ts __tests__/components/Orb.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

Create `mobile/src/lib/hubOrb.ts`:

```ts
import type { CoachStatusDTO } from '../api/coach';
import type { OrbState } from '../components/orb/types';

export interface HubOrbAppearance {
  state: OrbState;
  paused: boolean;
  dimmed: boolean;
}

// The centre orb of the floating bar. It is always drawn (spec 2.4); what it
// shows depends on the coach. An unknown status is treated exactly like a
// disabled coach so the hub never looks alive when the coach is not.
export function hubOrbAppearance(status: CoachStatusDTO | null, coachTabActive: boolean): HubOrbAppearance {
  if (!status || !status.enabled) return { state: 'shaping', paused: true, dimmed: true };
  return { state: 'breathing', paused: false, dimmed: !coachTabActive };
}
```

Create `mobile/src/components/orb/Orb.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { ThinkingOrb } from './ThinkingOrb';
import type { OrbSize, OrbState } from './types';

export const DIMMED_OPACITY = 0.45;

export interface OrbProps {
  state: OrbState;
  size: OrbSize;
  paused?: boolean;
  dimmed?: boolean;
  label?: string;
  testID?: string;
}

// The app's orb. The theme is passed explicitly because this app's theme is a
// manual toggle, and the vendored component's "auto" only follows the OS.
export function Orb({ state, size, paused = false, dimmed = false, label, testID }: OrbProps) {
  const { colorScheme } = useColorScheme();
  return (
    <View testID={testID} style={{ width: size, height: size, opacity: dimmed ? DIMMED_OPACITY : 1 }}>
      <ThinkingOrb
        state={state}
        size={size}
        paused={paused}
        theme={colorScheme === 'light' ? 'light' : 'dark'}
        accessibilityLabel={label}
      />
    </View>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd mobile && npx jest __tests__/lib/hubOrb.test.ts __tests__/components/Orb.test.tsx && npx tsc --noEmit 2>&1 | tail -3`
Expected: PASS (9 tests); no new type errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/orb/Orb.tsx mobile/src/lib/hubOrb.ts mobile/__tests__/components/Orb.test.tsx mobile/__tests__/lib/hubOrb.test.ts
git commit -m "Add the app Orb wrapper and the hub-orb state mapping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Keyboard hook, tab-bar layout helpers, and `FloatingTabBar`

**Files:**
- Create: `mobile/src/lib/useKeyboardVisible.ts`, `mobile/src/navigation/tabBarLayout.ts`, `mobile/src/navigation/FloatingTabBar.tsx`
- Modify: `mobile/package.json` (`@react-navigation/bottom-tabs`)
- Test: `mobile/__tests__/lib/useKeyboardVisible.test.tsx`, `mobile/__tests__/navigation/tabBarLayout.test.tsx`, `mobile/__tests__/navigation/FloatingTabBar.test.tsx`

**Interfaces:**
- Consumes: `Orb` and `hubOrbAppearance` (Task 7), `useCoachStatus()` returning `{ status, setStatus, refresh }`, tokens from Task 3, `MOTION`, `COLORS`.
- Produces:
  - `useKeyboardVisible(): boolean`.
  - From `tabBarLayout.ts`: `TAB_ORDER = ['Home','Activity','Coach','Metrics','Profile'] as const`, `type TabName`, `HUB_TAB: TabName` (`'Coach'`), `TAB_LABELS: Record<string, string>` (Coach → `'AI coach'`), `FLOATING_BAR_HEIGHT = 80`, `FLOATING_BAR_MARGIN = 12`, `slotCenterX(index, innerWidth, count): number`, `activeCircleTarget(activeRouteName: string): { index: number; visible: boolean }` (`visible` is false for the hub and unknown names), `useTabBarClearance(): number` (= `80 + max(bottomInset, 12) + 16`, using 0 for the inset when there is no `SafeAreaProvider`).
  - `FloatingTabBar(props: BottomTabBarProps)` — root `testID="floating-tab-bar"`; each item `testID="tab-<RouteName>"`, `accessibilityRole="button"`, `accessibilityLabel` from `TAB_LABELS`; hub orb wrapper `testID="hub-orb"`. On press it emits `tabPress` and navigates unless focused or `defaultPrevented`. When the focused tab changes it calls `refresh()` from `useCoachStatus`.

- [ ] **Step 1: Add the navigator package**

```bash
cd mobile && npm install @react-navigation/bottom-tabs@^7
```

Expected: `package.json` gains `@react-navigation/bottom-tabs`. (Type imports are erased in jest; the runtime import happens in Task 9.)

- [ ] **Step 2: Write the failing tests**

Create `mobile/__tests__/lib/useKeyboardVisible.test.tsx`:

```tsx
import { Keyboard } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useKeyboardVisible } from '../../src/lib/useKeyboardVisible';

describe('useKeyboardVisible', () => {
  it('follows the keyboard show and hide events', () => {
    const handlers: Record<string, () => void> = {};
    const remove = jest.fn();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      handlers[event] = cb;
      return { remove };
    }) as never);

    const { result, unmount } = renderHook(() => useKeyboardVisible());
    expect(result.current).toBe(false);

    act(() => handlers.keyboardWillShow!());
    expect(result.current).toBe(true);

    act(() => handlers.keyboardWillHide!());
    expect(result.current).toBe(false);

    unmount();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
```

Create `mobile/__tests__/navigation/tabBarLayout.test.tsx`:

```tsx
import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  TAB_ORDER,
  HUB_TAB,
  FLOATING_BAR_HEIGHT,
  FLOATING_BAR_MARGIN,
  activeCircleTarget,
  slotCenterX,
  useTabBarClearance,
} from '../../src/navigation/tabBarLayout';

describe('tab order', () => {
  it('puts the coach in the centre of five slots', () => {
    expect(TAB_ORDER).toEqual(['Home', 'Activity', 'Coach', 'Metrics', 'Profile']);
    expect(TAB_ORDER.indexOf(HUB_TAB)).toBe(2);
  });
});

describe('slotCenterX', () => {
  it('returns the centre of each equal-width slot', () => {
    expect(slotCenterX(0, 500, 5)).toBe(50);
    expect(slotCenterX(2, 500, 5)).toBe(250);
    expect(slotCenterX(4, 500, 5)).toBe(450);
  });

  it('is 0 with no slots', () => {
    expect(slotCenterX(0, 500, 0)).toBe(0);
  });
});

describe('activeCircleTarget', () => {
  it('shows the circle on an icon tab', () => {
    expect(activeCircleTarget('Metrics')).toEqual({ index: 3, visible: true });
  });

  it('hides the circle on the coach tab, which has the orb instead', () => {
    expect(activeCircleTarget('Coach')).toEqual({ index: 2, visible: false });
  });

  it('hides the circle for an unknown route', () => {
    expect(activeCircleTarget('Nope')).toEqual({ index: 0, visible: false });
  });
});

describe('useTabBarClearance', () => {
  it('adds the bottom safe-area inset', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        {children}
      </SafeAreaProvider>
    );
    const { result } = renderHook(() => useTabBarClearance(), { wrapper });
    expect(result.current).toBe(FLOATING_BAR_HEIGHT + 34 + 16);
  });

  it('falls back to the bar margin when there is no provider', () => {
    const { result } = renderHook(() => useTabBarClearance());
    expect(result.current).toBe(FLOATING_BAR_HEIGHT + FLOATING_BAR_MARGIN + 16);
  });
});
```

Create `mobile/__tests__/navigation/FloatingTabBar.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FloatingTabBar } from '../../src/navigation/FloatingTabBar';
import { TAB_ORDER } from '../../src/navigation/tabBarLayout';
import { DIMMED_OPACITY } from '../../src/components/orb/Orb';
import { useCoachStatus } from '../../src/lib/useCoachStatus';
import { useKeyboardVisible } from '../../src/lib/useKeyboardVisible';

jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: 'dark' }) }));
jest.mock('../../src/lib/useCoachStatus', () => ({ useCoachStatus: jest.fn() }));
jest.mock('../../src/lib/useKeyboardVisible', () => ({ useKeyboardVisible: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const enabledStatus = { enabled: true, consented: true, consent: { version: 'v1', summary: 's', dataItems: [] }, personaId: 'p', personas: [] };
const refresh = jest.fn();

function setCoach(status: unknown) {
  (useCoachStatus as jest.Mock).mockReturnValue({ status, setStatus: jest.fn(), refresh });
}

function makeProps(index = 0, preventDefault = false) {
  const routes = TAB_ORDER.map((name) => ({ key: `${name}-key`, name, params: undefined }));
  const navigation = { emit: jest.fn(() => ({ defaultPrevented: preventDefault })), navigate: jest.fn() };
  return { state: { index, routes }, navigation, descriptors: {}, insets: METRICS.insets } as never;
}

function bar(props: ReturnType<typeof makeProps>) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <FloatingTabBar {...(props as object as React.ComponentProps<typeof FloatingTabBar>)} />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useKeyboardVisible as jest.Mock).mockReturnValue(false);
  setCoach(enabledStatus);
});

describe('FloatingTabBar', () => {
  it('renders five labelled tabs, with the coach orb in the middle', () => {
    const { getByLabelText, getByTestId } = render(bar(makeProps()));

    for (const label of ['Home', 'Activity', 'AI coach', 'Metrics', 'Profile']) expect(getByLabelText(label)).toBeTruthy();
    expect(getByTestId('tab-Coach')).toContainElement(getByTestId('hub-orb'));
  });

  it('marks only the focused tab selected', () => {
    const { getByTestId } = render(bar(makeProps(3)));

    expect(getByTestId('tab-Metrics').props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId('tab-Home').props.accessibilityState).toEqual({ selected: false });
  });

  it('emits tabPress and navigates when an unfocused tab is pressed', () => {
    const props = makeProps(0);
    const { getByTestId } = render(bar(props));

    fireEvent.press(getByTestId('tab-Activity'));

    const navigation = (props as unknown as { navigation: { emit: jest.Mock; navigate: jest.Mock } }).navigation;
    expect(navigation.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'Activity-key', canPreventDefault: true });
    expect(navigation.navigate).toHaveBeenCalledWith('Activity', undefined);
  });

  it('does not navigate when the focused tab is pressed again', () => {
    const props = makeProps(1);
    const { getByTestId } = render(bar(props));

    fireEvent.press(getByTestId('tab-Activity'));

    expect((props as unknown as { navigation: { navigate: jest.Mock } }).navigation.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when a listener prevents the default', () => {
    const props = makeProps(0, true);
    const { getByTestId } = render(bar(props));

    fireEvent.press(getByTestId('tab-Metrics'));

    expect((props as unknown as { navigation: { navigate: jest.Mock } }).navigation.navigate).not.toHaveBeenCalled();
  });

  it('opens the Coach tab from the hub even when the coach is disabled', () => {
    setCoach({ ...enabledStatus, enabled: false });
    const props = makeProps(0);
    const { getByTestId } = render(bar(props));

    fireEvent.press(getByTestId('tab-Coach'));

    expect((props as unknown as { navigation: { navigate: jest.Mock } }).navigation.navigate).toHaveBeenCalledWith('Coach', undefined);
  });

  describe('hub orb', () => {
    it('is dim, paused and shaping when the status is unknown', () => {
      setCoach(null);
      const { getByTestId } = render(bar(makeProps(0)));

      expect(getByTestId('thinking-orb').props.accessibilityLabel).toBe('shaping:64:paused:dark');
      expect(getByTestId('hub-orb')).toHaveStyle({ opacity: DIMMED_OPACITY });
    });

    it('is dim, paused and shaping when the coach is disabled', () => {
      setCoach({ ...enabledStatus, enabled: false });
      const { getByTestId } = render(bar(makeProps(2)));

      expect(getByTestId('thinking-orb').props.accessibilityLabel).toBe('shaping:64:paused:dark');
    });

    it('breathes, dimmed, while another tab is active', () => {
      const { getByTestId } = render(bar(makeProps(0)));

      expect(getByTestId('thinking-orb').props.accessibilityLabel).toBe('breathing:64:playing:dark');
      expect(getByTestId('hub-orb')).toHaveStyle({ opacity: DIMMED_OPACITY });
    });

    it('breathes at full brightness on the Coach tab', () => {
      const { getByTestId } = render(bar(makeProps(2)));

      expect(getByTestId('hub-orb')).toHaveStyle({ opacity: 1 });
    });
  });

  it('refreshes the coach status when the focused tab changes, not on first render', () => {
    const { rerender } = render(bar(makeProps(0)));
    expect(refresh).not.toHaveBeenCalled();

    rerender(bar(makeProps(1)));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('stops taking touches while the keyboard is open', () => {
    (useKeyboardVisible as jest.Mock).mockReturnValue(true);
    const { getByTestId } = render(bar(makeProps(0)));

    expect(getByTestId('floating-tab-bar').props.pointerEvents).toBe('none');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd mobile && npx jest __tests__/lib/useKeyboardVisible.test.tsx __tests__/navigation/tabBarLayout.test.tsx __tests__/navigation/FloatingTabBar.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the keyboard hook**

Create `mobile/src/lib/useKeyboardVisible.ts`:

```ts
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// iOS announces the keyboard *before* it animates ("will"), which is what a
// bar that slides away in step with it needs; Android only has the "did" events.
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
```

- [ ] **Step 5: Implement the layout helpers**

Create `mobile/src/navigation/tabBarLayout.ts`:

```ts
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

export const TAB_ORDER = ['Home', 'Activity', 'Coach', 'Metrics', 'Profile'] as const;
export type TabName = (typeof TAB_ORDER)[number];

// The centre slot holds the coach orb instead of an icon.
export const HUB_TAB: TabName = 'Coach';

export const TAB_LABELS: Record<string, string> = {
  Home: 'Home',
  Activity: 'Activity',
  Coach: 'AI coach',
  Metrics: 'Metrics',
  Profile: 'Profile',
};

// About 80 dp so the 64 dp orb fits inside the pill (spec 2.3).
export const FLOATING_BAR_HEIGHT = 80;
export const FLOATING_BAR_MARGIN = 12;

export function slotCenterX(index: number, innerWidth: number, count: number): number {
  return count > 0 ? (index + 0.5) * (innerWidth / count) : 0;
}

// The white circle sits behind the active icon. The hub has the orb instead,
// so the circle hides there (and for any route we do not know).
export function activeCircleTarget(activeRouteName: string): { index: number; visible: boolean } {
  const index = (TAB_ORDER as readonly string[]).indexOf(activeRouteName);
  return { index: Math.max(0, index), visible: index >= 0 && activeRouteName !== HUB_TAB };
}

// How far screen content must be inset from the bottom so the floating bar does
// not cover it. Uses the context directly (not useSafeAreaInsets) so screens
// still render in tests, and anywhere else, without a SafeAreaProvider.
export function useTabBarClearance(): number {
  const insets = useContext(SafeAreaInsetsContext);
  return FLOATING_BAR_HEIGHT + Math.max(insets?.bottom ?? 0, FLOATING_BAR_MARGIN) + 16;
}
```

- [ ] **Step 6: Implement `FloatingTabBar`**

Create `mobile/src/navigation/FloatingTabBar.tsx`:

```tsx
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { Orb } from '../components/orb/Orb';
import { hubOrbAppearance } from '../lib/hubOrb';
import { useCoachStatus } from '../lib/useCoachStatus';
import { useKeyboardVisible } from '../lib/useKeyboardVisible';
import { COLORS, MOTION } from '../theme';
import { FLOATING_BAR_HEIGHT, FLOATING_BAR_MARGIN, HUB_TAB, TAB_LABELS, activeCircleTarget, slotCenterX } from './tabBarLayout';

const CIRCLE_SIZE = 48;
// The pill has a 1 dp border, so its content area is 2 dp shorter.
const CIRCLE_TOP = (FLOATING_BAR_HEIGHT - 2 - CIRCLE_SIZE) / 2;

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Activity: 'calendar-outline',
  Metrics: 'stats-chart-outline',
  Profile: 'person-outline',
};

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useContext(SafeAreaInsetsContext);
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const reduced = useReducedMotion();
  const keyboardVisible = useKeyboardVisible();
  const { status, refresh } = useCoachStatus();
  const [innerWidth, setInnerWidth] = useState(0);

  const activeName = state.routes[state.index]?.name ?? 'Home';
  const hub = hubOrbAppearance(status, activeName === HUB_TAB);
  const target = activeCircleTarget(activeName);

  // Consent can change while another tab is open (accept, revoke), so re-read
  // the coach status whenever the user moves between tabs -- but not on first
  // render, where useCoachStatus has already fetched.
  const previousIndex = useRef(state.index);
  useEffect(() => {
    if (previousIndex.current === state.index) return;
    previousIndex.current = state.index;
    void refresh();
  }, [state.index, refresh]);

  const circleX = useSharedValue(0);
  const circleScale = useSharedValue(target.visible ? 1 : 0);
  useEffect(() => {
    const x = slotCenterX(target.index, innerWidth, state.routes.length) - CIRCLE_SIZE / 2;
    const scale = target.visible ? 1 : 0;
    circleX.value = reduced ? x : withSpring(x, MOTION.spring.settle);
    circleScale.value = reduced ? scale : withSpring(scale, MOTION.spring.settle);
  }, [target.index, target.visible, innerWidth, state.routes.length, reduced, circleX, circleScale]);
  const circleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: circleX.value }, { scale: circleScale.value }] }));

  const hidden = useSharedValue(0);
  useEffect(() => {
    hidden.value = withTiming(keyboardVisible ? 1 : 0, { duration: MOTION.duration.fast });
  }, [keyboardVisible, hidden]);
  const barStyle = useAnimatedStyle(() => ({
    opacity: 1 - hidden.value,
    transform: [{ translateY: hidden.value * (FLOATING_BAR_HEIGHT + 40) }],
  }));

  function press(route: (typeof state.routes)[number], focused: boolean) {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      (navigation.navigate as unknown as (name: string, params?: object) => void)(route.name, route.params);
    }
  }

  return (
    <Animated.View
      testID="floating-tab-bar"
      pointerEvents={keyboardVisible ? 'none' : 'box-none'}
      style={[{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets?.bottom ?? 0, FLOATING_BAR_MARGIN) }, barStyle]}
    >
      <View
        className="border border-hairline bg-bar"
        style={{
          height: FLOATING_BAR_HEIGHT,
          borderRadius: FLOATING_BAR_HEIGHT / 2,
          paddingHorizontal: 8,
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}
      >
        <View className="flex-1 flex-row items-center" onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}>
          <Animated.View
            pointerEvents="none"
            className="absolute left-0 rounded-full bg-bar-active"
            style={[{ width: CIRCLE_SIZE, height: CIRCLE_SIZE, top: CIRCLE_TOP }, circleStyle]}
          />
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const isHub = route.name === HUB_TAB;
            return (
              <Pressable
                key={route.key}
                testID={`tab-${route.name}`}
                accessibilityRole="button"
                accessibilityLabel={TAB_LABELS[route.name] ?? route.name}
                accessibilityState={{ selected: focused }}
                onPress={() => press(route, focused)}
                hitSlop={4}
                className="flex-1 items-center justify-center"
                style={{ height: FLOATING_BAR_HEIGHT - 2 }}
              >
                {isHub ? (
                  <Orb testID="hub-orb" size={64} state={hub.state} paused={hub.paused} dimmed={hub.dimmed} />
                ) : (
                  <Ionicons
                    name={ICONS[route.name] ?? 'ellipse-outline'}
                    size={22}
                    color={focused ? colors.barIconActive : colors.barIcon}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}
```

- [ ] **Step 7: Run to verify they pass**

Run: `cd mobile && npx jest __tests__/lib/useKeyboardVisible.test.tsx __tests__/navigation/tabBarLayout.test.tsx __tests__/navigation/FloatingTabBar.test.tsx && npx tsc --noEmit 2>&1 | tail -5`
Expected: PASS (21 tests); no new type errors. If `tsc` complains about the `navigation.emit` return type, keep the runtime shape and cast at that call site only.

- [ ] **Step 8: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/lib/useKeyboardVisible.ts mobile/src/navigation/tabBarLayout.ts mobile/src/navigation/FloatingTabBar.tsx mobile/__tests__/lib/useKeyboardVisible.test.tsx mobile/__tests__/navigation/tabBarLayout.test.tsx mobile/__tests__/navigation/FloatingTabBar.test.tsx
git commit -m "Add the floating tab bar with the coach orb hub

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Tabs navigator inside the stack, with bottom clearance on existing screens

Existing stack routes (`Dashboard`, `Settings`, `Coach`) stay registered in this task, so the app keeps working; Task 10 re-routes callers and removes them.

**Files:**
- Create: `mobile/src/navigation/TabsNavigator.tsx`, `mobile/src/screens/TabPlaceholderScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/screens/DashboardScreen.tsx`, `mobile/src/screens/SettingsScreen.tsx`, `mobile/src/screens/CoachScreen.tsx`
- Test: `mobile/__tests__/navigation/TabsNavigator.test.tsx` (new); modify `mobile/__tests__/navigation/{RootNavigator,RootNavigatorCoach,RootNavigatorCoachMemory}.test.tsx`

**Interfaces:**
- Consumes: `FloatingTabBar`, `TAB_ORDER`, `useTabBarClearance`, `useKeyboardVisible`, `COLORS`.
- Produces: `type TabParamList = { Home: undefined; Activity: undefined; Coach: { prefill?: string } | undefined; Metrics: undefined; Profile: undefined }` and `TabsNavigator` from `src/navigation/TabsNavigator`; `RootStackParamList` gains `Tabs: NavigatorScreenParams<TabParamList> | undefined`; a connected user's initial route is `'Tabs'`; `TabPlaceholderScreen({ title, note })`.

- [ ] **Step 1: Write the failing tests**

Create `mobile/__tests__/navigation/TabsNavigator.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { TabsNavigator } from '../../src/navigation/TabsNavigator';
import { FloatingTabBar } from '../../src/navigation/FloatingTabBar';
import { TAB_ORDER } from '../../src/navigation/tabBarLayout';

const mockScreens: string[] = [];
let mockInitialRoute: string | undefined;
let mockTabBar: ((props: object) => React.ReactElement) | undefined;
jest.mock('@react-navigation/bottom-tabs', () => {
  const ReactLib = require('react');
  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children, tabBar, initialRouteName }: any) => {
        mockScreens.splice(0, mockScreens.length, ...ReactLib.Children.toArray(children).map((c: any) => c.props.name));
        mockTabBar = tabBar;
        mockInitialRoute = initialRouteName;
        return null;
      },
      Screen: () => null,
    }),
  };
});

describe('TabsNavigator', () => {
  it('registers the five tabs in bar order, opening on Home', () => {
    render(<TabsNavigator />);

    expect(mockScreens).toEqual([...TAB_ORDER]);
    expect(mockInitialRoute).toBe('Home');
  });

  it('renders the floating bar instead of the default tab bar', () => {
    render(<TabsNavigator />);

    const element = mockTabBar!({});
    expect(element.type).toBe(FloatingTabBar);
  });
});
```

In each of `mobile/__tests__/navigation/RootNavigator.test.tsx`, `RootNavigatorCoach.test.tsx` and `RootNavigatorCoachMemory.test.tsx`:

1. Replace the `jest.mock('../../src/screens/DashboardScreen', …)` block with:

```tsx
jest.mock('../../src/navigation/TabsNavigator', () => {
  const { Text } = require('react-native');
  const ReactLib = require('react');
  return { TabsNavigator: () => ReactLib.createElement(Text, null, 'TABS_SCREEN') };
});
```

2. Replace every `'DASHBOARD_SCREEN'` with `'TABS_SCREEN'`.

In `RootNavigator.test.tsx` also rename the test `'lands a connected user on the Dashboard'` to `'lands a connected user on the tabs'` and add, after the `'registers the Patterns route'` test:

```tsx
  it('registers the Tabs route', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    expect(mockRegisteredScreens).toContain('Tabs');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest __tests__/navigation`
Expected: FAIL — `TabsNavigator` module missing; Root tests still route to `Dashboard`.

- [ ] **Step 3: Write the placeholder screen**

Create `mobile/src/screens/TabPlaceholderScreen.tsx`:

```tsx
import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components/ui/text';
import { useTabBarClearance } from '../navigation/tabBarLayout';

// Interim content for tabs whose real screens land in later plans (Activity heat
// map, Metrics trends). Honest about that, and still clear of the floating bar.
export function TabPlaceholderScreen({ title, note }: { title: string; note: string }) {
  const clearance = useTabBarClearance();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View testID="tab-placeholder" className="flex-1 items-center justify-center gap-2 p-6" style={{ paddingBottom: clearance }}>
        <Text className="text-xl font-semibold">{title}</Text>
        <Text className="text-center text-muted-foreground">{note}</Text>
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Write the tabs navigator**

Create `mobile/src/navigation/TabsNavigator.tsx`:

```tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useColorScheme } from 'nativewind';
import { DashboardScreen } from '../screens/DashboardScreen';
import { CoachScreen } from '../screens/CoachScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TabPlaceholderScreen } from '../screens/TabPlaceholderScreen';
import { COLORS } from '../theme';
import { FloatingTabBar } from './FloatingTabBar';

export type TabParamList = {
  Home: undefined;
  Activity: undefined;
  // `prefill` seeds the chat input (never sent automatically).
  Coach: { prefill?: string } | undefined;
  Metrics: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const ActivityTab = () => <TabPlaceholderScreen title="Activity" note="Your activity heat map is coming soon." />;
const MetricsTab = () => <TabPlaceholderScreen title="Metrics" note="Trends for each metric are coming soon." />;

export function TabsNavigator() {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'light' ? COLORS.light : COLORS.dark;

  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.foreground, fontWeight: '600' },
        headerTintColor: colors.foreground,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Activity" component={ActivityTab} options={{ headerShown: false }} />
      <Tab.Screen name="Coach" component={CoachScreen} options={{ title: 'AI Coach' }} />
      <Tab.Screen name="Metrics" component={MetricsTab} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={SettingsScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
```

- [ ] **Step 5: Add `Tabs` to the root stack**

In `mobile/src/navigation/RootNavigator.tsx`:

1. Change the native import line to
   `import { NavigationContainer, DefaultTheme, DarkTheme, type NavigatorScreenParams, type Theme } from '@react-navigation/native';`
2. Add `import { TabsNavigator, type TabParamList } from './TabsNavigator';` after the `CoachMemoryScreen` import.
3. In `RootStackParamList` add, as the first member:
   ```ts
     // The five-tab shell (Home, Activity, Coach, Metrics, Profile).
     Tabs: NavigatorScreenParams<TabParamList> | undefined;
   ```
4. Change `setInitialRoute(res.status === 'CONNECTED' ? 'Dashboard' : 'ConnectHealth');` to `setInitialRoute(res.status === 'CONNECTED' ? 'Tabs' : 'ConnectHealth');`
5. Register it first inside `<Stack.Navigator>`:
   ```tsx
        <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
   ```

- [ ] **Step 6: Keep existing screens clear of the bar**

`mobile/src/screens/DashboardScreen.tsx`: add `import { useTabBarClearance } from '../navigation/tabBarLayout';` with the other imports; call `const clearance = useTabBarClearance();` at the top of the component body (next to the other hooks); and change
`<ScrollView contentContainerStyle={{ gap: 16, padding: 16 }}>` to
`<ScrollView contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: clearance }}>`.

`mobile/src/screens/SettingsScreen.tsx`: add the same import and `const clearance = useTabBarClearance();` in the component body, then change
```tsx
      <View className="gap-3 p-4">
        <Card className="gap-1">
```
to
```tsx
      <View className="gap-3 p-4" style={{ paddingBottom: clearance }}>
        <Card className="gap-1">
```

`mobile/src/screens/CoachScreen.tsx`: add `import { useTabBarClearance } from '../navigation/tabBarLayout';` and `import { useKeyboardVisible } from '../lib/useKeyboardVisible';`; in the component body add
```tsx
  const clearance = useTabBarClearance();
  const keyboardVisible = useKeyboardVisible();
```
and change the `KeyboardAvoidingView` opening tag to
```tsx
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
        style={{ paddingBottom: keyboardVisible ? 0 : clearance }}
      >
```
(the bar hides while the keyboard is open, so the input needs the extra room only when it is showing).

- [ ] **Step 7: Run to verify everything passes**

Run: `cd mobile && npx jest __tests__/navigation && npx jest 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | tail -5`
Expected: navigation tests PASS; no new failures elsewhere (the screens' tests render without a provider, which `useTabBarClearance` tolerates); no new type errors.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/navigation mobile/src/screens mobile/__tests__/navigation
git commit -m "Nest the five-tab floating-bar shell inside the root stack

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Route callers through the tabs and fix the coach consent flow

The coach chat is now a tab and consent is pushed over the tabs, so `navigate('Dashboard' | 'Coach' | 'Settings')` and stack `replace(...)` calls must change, and the Coach tab must cope with a user backing out of consent.

**Files:**
- Create: `mobile/src/navigation/coachNavigation.ts`
- Modify: `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/screens/{DashboardScreen,ScoreDetailScreen,CoachScreen,CoachConsentScreen,ConnectHealthScreen}.tsx`
- Test: `mobile/__tests__/navigation/coachNavigation.test.ts` (new); modify `mobile/__tests__/navigation/RootNavigatorCoach.test.tsx`, `mobile/__tests__/screens/{DashboardScreen,DashboardCoachEntry,ScoreDetailCoachEntry,CoachScreen,CoachConsentScreen,ConnectHealthScreen}.test.tsx`

**Interfaces:**
- Consumes: `CoachEntryRoute = 'Coach' | 'CoachConsent'` and `coachEntryRoute` from `src/lib/useCoachStatus`; `TabParamList` (Task 9).
- Produces: `navigateToCoachEntry(navigation: { navigate: (...args: any[]) => void }, route: CoachEntryRoute, prefill?: string): void` — `'Coach'` → `navigate('Tabs', { screen: 'Coach' })` or `{ screen: 'Coach', params: { prefill } }` when `prefill` is defined; `'CoachConsent'` → `navigate('CoachConsent')` or `navigate('CoachConsent', { prefill })`. `CoachScreen` gains a `'needs-consent'` phase (`testID="coach-needs-consent"`, button `testID="coach-review-consent-button"`), redirects to consent at most once per mount, reloads when its tab regains focus, and syncs a changed `prefill` route param into the input.

- [ ] **Step 1: Write the failing helper test**

Create `mobile/__tests__/navigation/coachNavigation.test.ts`:

```ts
import { navigateToCoachEntry } from '../../src/navigation/coachNavigation';

describe('navigateToCoachEntry', () => {
  it('opens the Coach tab', () => {
    const navigation = { navigate: jest.fn() };
    navigateToCoachEntry(navigation, 'Coach');
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Coach' });
  });

  it('opens the Coach tab with a prefill', () => {
    const navigation = { navigate: jest.fn() };
    navigateToCoachEntry(navigation, 'Coach', 'Why did my score change today?');
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Coach', params: { prefill: 'Why did my score change today?' } });
  });

  it('opens the consent screen, which is pushed over the tabs', () => {
    const navigation = { navigate: jest.fn() };
    navigateToCoachEntry(navigation, 'CoachConsent');
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('CoachConsent');
  });

  it('opens the consent screen carrying a prefill', () => {
    const navigation = { navigate: jest.fn() };
    navigateToCoachEntry(navigation, 'CoachConsent', 'Hi');
    expect(navigation.navigate).toHaveBeenCalledWith('CoachConsent', { prefill: 'Hi' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx jest __tests__/navigation/coachNavigation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `mobile/src/navigation/coachNavigation.ts`:

```ts
import type { CoachEntryRoute } from '../lib/useCoachStatus';

interface Navigator {
  navigate: (...args: any[]) => void;
}

// The coach chat is a tab; consent is a stack screen pushed over the tabs. This
// is the one place that knows that, so entry points do not hardcode route names.
// `prefill` is only added to the params when defined, so callers that have none
// navigate with the plainest possible arguments.
export function navigateToCoachEntry(navigation: Navigator, route: CoachEntryRoute, prefill?: string): void {
  if (route === 'Coach') {
    navigation.navigate('Tabs', prefill === undefined ? { screen: 'Coach' } : { screen: 'Coach', params: { prefill } });
    return;
  }
  if (prefill === undefined) navigation.navigate('CoachConsent');
  else navigation.navigate('CoachConsent', { prefill });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && npx jest __tests__/navigation/coachNavigation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Update the entry-point tests first (they should now fail)**

`mobile/__tests__/screens/DashboardCoachEntry.test.tsx`: change `expect(mockNavigate).toHaveBeenCalledWith('Coach');` to
`expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Coach' });` (the `'CoachConsent'` assertion stays).

`mobile/__tests__/screens/DashboardScreen.test.tsx`: in `'opens Settings from the header'` change the assertion to
`expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Profile' });` and rename the test `'opens Profile from the header'`.

`mobile/__tests__/screens/ScoreDetailCoachEntry.test.tsx`: replace the first two tests with:

```tsx
  it('opens the chat with a prefilled question that contains no numbers', async () => {
    const { findByTestId } = render(<ScoreDetailScreen />);

    fireEvent.press(await findByTestId('ask-coach-button'));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    const [route, args] = mockNavigate.mock.calls[0];
    expect(route).toBe('Tabs');
    expect(args.screen).toBe('Coach');
    expect(args.params.prefill).toMatch(/why did my score change today/i);
    expect(args.params.prefill).not.toMatch(/\d/);
    // Neither the score (78) nor the date leaks into the prompt.
    expect(args.params.prefill).not.toContain('78');
    expect(args.params.prefill).not.toContain('2026');
  });

  it('asks about sleep on the Sleep Score, still without numbers', async () => {
    mockParams = { date: '2026-09-19', type: 'SLEEP' };
    (fetchScoreDetail as jest.Mock).mockResolvedValue({ ...detail, score: { ...detail.score, type: 'SLEEP' } });
    const { findByTestId } = render(<ScoreDetailScreen />);

    fireEvent.press(await findByTestId('ask-coach-button'));

    const [, args] = mockNavigate.mock.calls[0];
    expect(args.params.prefill).toMatch(/sleep/i);
    expect(args.params.prefill).not.toMatch(/\d/);
  });
```

`mobile/__tests__/screens/ConnectHealthScreen.test.tsx`: change all three `toHaveBeenCalledWith('Dashboard')` to `toHaveBeenCalledWith('Tabs')` and the test title `'…navigates to Dashboard on success'` to `'…navigates to the tabs on success'`.

`mobile/__tests__/screens/CoachConsentScreen.test.tsx`:
- Replace `const mockReplace = jest.fn();` with `const mockNavigate = jest.fn();` and the mock with
  `useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),`.
- Replace every `mockReplace` with `mockNavigate`.
- Update the four positive expectations:
  - `('Coach', { prefill: 'Why did my score change today?' })` → `('Tabs', { screen: 'Coach', params: { prefill: 'Why did my score change today?' } })`
  - both `('Coach', { prefill: undefined })` → `('Tabs', { screen: 'Coach' })`
  - `('Coach', { prefill: 'Hi' })` → `('Tabs', { screen: 'Coach', params: { prefill: 'Hi' } })`

`mobile/__tests__/navigation/RootNavigatorCoach.test.tsx`: change the assertion to
`expect(mockRegisteredScreens).toEqual(expect.arrayContaining(['Tabs', 'CoachConsent']));`
and add below it
`expect(mockRegisteredScreens).not.toContain('Coach');`.

`mobile/__tests__/screens/CoachScreen.test.tsx`:
- Replace `const mockReplace = jest.fn();` with:
  ```tsx
  const mockNavigate = jest.fn();
  let mockFocusListener: (() => void) | undefined;
  ```
  and the navigation mock with:
  ```tsx
  jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: jest.fn(),
      addListener: (_event: string, cb: () => void) => {
        mockFocusListener = cb;
        return () => {
          mockFocusListener = undefined;
        };
      },
    }),
    useRoute: () => ({ params: mockParams }),
  }));
  ```
- In `beforeEach` add `mockFocusListener = undefined;`.
- Replace both `mockReplace` expectations with `mockNavigate` (`('CoachConsent', { prefill: 'Why did my score change today?' })` and `('CoachConsent', { prefill: undefined })`).
- Add these tests inside `describe('CoachScreen: gating', …)`:

```tsx
  it('shows a review card, instead of bouncing back to consent, when the user returns without agreeing', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, consented: false });
    const { findByTestId, queryByTestId } = render(<CoachScreen />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockFocusListener?.();
    });

    expect(await findByTestId('coach-needs-consent')).toBeTruthy();
    expect(queryByTestId('coach-input')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledTimes(1);

    fireEvent.press(await findByTestId('coach-review-consent-button'));
    expect(mockNavigate).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenLastCalledWith('CoachConsent', { prefill: undefined });
  });

  it('reloads when the tab regains focus after the user agreed', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, consented: false });
    const { findByTestId } = render(<CoachScreen />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));

    (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
    await act(async () => {
      mockFocusListener?.();
    });

    expect(await findByTestId('coach-input')).toBeTruthy();
  });

  it('puts a prefill that arrives after mount into the input', async () => {
    const utils = await openChat();
    expect(utils.getByTestId('coach-input').props.value).toBe('');

    mockParams = { prefill: 'Why did my score change today?' };
    utils.rerender(<CoachScreen />);

    expect(utils.getByTestId('coach-input').props.value).toBe('Why did my score change today?');
  });
```

- [ ] **Step 6: Run to verify the updated tests fail**

Run: `cd mobile && npx jest __tests__/screens __tests__/navigation 2>&1 | tail -25`
Expected: FAIL in the files edited above (callers still use the old routes; `coach-needs-consent` does not exist).

- [ ] **Step 7: Re-route the callers**

`mobile/src/screens/DashboardScreen.tsx`: add `import { navigateToCoachEntry } from '../navigation/coachNavigation';`; change `onPress={() => navigation.navigate('Settings')}` to
`onPress={() => navigation.navigate('Tabs', { screen: 'Profile' })}`; change `onPress={() => navigation.navigate(coachRoute)}` to
`onPress={() => navigateToCoachEntry(navigation, coachRoute)}`.

`mobile/src/screens/ScoreDetailScreen.tsx`: add the same import; change
`onPress={() => navigation.navigate(coachRoute, { prefill: scoreQuestion(score.type) })}` to
`onPress={() => navigateToCoachEntry(navigation, coachRoute, scoreQuestion(score.type))}`.

`mobile/src/screens/ConnectHealthScreen.tsx`: change `navigation.navigate('Dashboard');` to `navigation.navigate('Tabs');`.

`mobile/src/screens/CoachConsentScreen.tsx`: add `import { navigateToCoachEntry } from '../navigation/coachNavigation';` and change both `navigation.replace('Coach', { prefill });` calls to `navigateToCoachEntry(navigation, 'Coach', prefill);`.

- [ ] **Step 8: Fix `CoachScreen`**

In `mobile/src/screens/CoachScreen.tsx`:

1. Replace `import type { RootStackParamList } from '../navigation/RootNavigator';` with `import type { TabParamList } from '../navigation/TabsNavigator';`, and `type CoachRoute = RouteProp<RootStackParamList, 'Coach'>;` with `type CoachRoute = RouteProp<TabParamList, 'Coach'>;`.
2. Change `type Phase = 'loading' | 'unavailable' | 'ready';` to `type Phase = 'loading' | 'unavailable' | 'needs-consent' | 'ready';`.
3. Add a ref beside the other refs: `const redirectedToConsent = useRef(false);` and `const loadInFlight = useRef(false);`, and a prefill sync effect after the `mounted` effect:

```tsx
  // A prefill can arrive after this tab is already mounted (the tab is reused
  // by every entry point), so a changed param must reach the input.
  useEffect(() => {
    if (prefill) setInput(prefill);
  }, [prefill]);
```

4. Replace the whole status/history effect (`useEffect(() => { let cancelled = false; (async () => { try { const status = await fetchCoachStatus(); … })(); return () => { cancelled = true; }; // eslint-disable-next-line react-hooks/exhaustive-deps }, []);`) with:

```tsx
  const load = useCallback(async () => {
    // Mount and tab focus can both trigger a load; one at a time is enough.
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      const status = await fetchCoachStatus();
      if (!mounted.current) return;
      if (!status.enabled) {
        setPhase('unavailable');
        return;
      }
      if (!status.consented) {
        // The server decides: a changed consent version lands here too. Send
        // the user to consent once; if they come back without agreeing, stay on
        // a card rather than bouncing them straight back there.
        if (redirectedToConsent.current) {
          setPhase('needs-consent');
          return;
        }
        redirectedToConsent.current = true;
        navigation.navigate('CoachConsent', { prefill });
        return;
      }
      redirectedToConsent.current = false;
      const conversation = await fetchLatestConversation();
      if (!mounted.current) return;
      setConversationId(conversation.conversationId);
      setMessages(
        conversation.messages.map((m) => ({
          id: m.id,
          role: m.role === 'USER' ? 'user' : 'assistant',
          text: m.text,
          source: m.source,
        })),
      );
      setPhase('ready');
    } catch {
      // History is a convenience: a failure to load it must not lock the user
      // out of asking a question. Status failures already fail closed above
      // only when the server says so.
      if (mounted.current) setPhase('ready');
    } finally {
      loadInFlight.current = false;
    }
  }, [navigation, prefill]);

  useEffect(() => {
    void load();
    // Load once on mount; later loads come from tab focus below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Coach tab stays mounted while the user visits consent and comes back,
  // so re-read status whenever it regains focus. Optional so a screen rendered
  // without a real navigator (as in tests) still works.
  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', () => {
      void load();
    });
    return unsubscribe;
  }, [navigation, load]);
```

5. Change the send-time consent redirect `navigation.replace('CoachConsent', { prefill: undefined });` to `navigation.navigate('CoachConsent', { prefill: undefined });`.
6. Add the review card, immediately before the existing `if (phase === 'unavailable') {` return:

```tsx
  if (phase === 'needs-consent') {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View testID="coach-needs-consent" className="flex-1 items-center justify-center gap-3 p-6">
          <Text className="text-center text-muted-foreground">The coach needs your OK before it can look at your scores.</Text>
          <Button testID="coach-review-consent-button" onPress={() => navigation.navigate('CoachConsent', { prefill })}>
            Review what is shared
          </Button>
        </View>
      </SafeAreaView>
    );
  }
```

- [ ] **Step 9: Remove the now-dead stack routes**

In `mobile/src/navigation/RootNavigator.tsx` delete the `Dashboard`, `Settings` and `Coach` members from `RootStackParamList` (and the comment above `Coach`), delete their three `<Stack.Screen …/>` lines, and delete the now-unused imports of `DashboardScreen`, `SettingsScreen` and `CoachScreen`. Keep `CoachConsent` and `CoachMemory`, whose comment should read: `// Pushed over the tabs. \`prefill\` is carried through the consent screen.`

- [ ] **Step 10: Run everything**

Run: `cd mobile && npx jest 2>&1 | tail -8 && npx tsc --noEmit 2>&1 | tail -10`
Expected: all PASS relative to baseline (the three new CoachScreen tests included); no new type errors. If a test names a removed route, update it to the new shape rather than restoring the route.

- [ ] **Step 11: Commit**

```bash
git add mobile/src mobile/__tests__
git commit -m "Route entry points through the tab shell and harden the coach consent flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Final verification, manual QA on a simulator, and spec bookkeeping

**Files:**
- Modify: `docs/superpowers/specs/2026-09-20-ai-coach-design.md` (Implementation Status), `docs/superpowers/specs/2026-09-21-app-redesign-design.md` (vendored-file note)

- [ ] **Step 1: Full automated check**

```bash
cd mobile && npx jest 2>&1 | tail -8 && npx tsc --noEmit 2>&1 | tail -10
```

Expected: no failures beyond the pre-flight baseline; no new type errors.

- [ ] **Step 2: Manual QA on the iOS simulator**

Run `cd mobile && npx expo run:ios` against a backend with a connected test account, and check:

1. A fresh install (or after deleting the app) opens **dark**; the theme toggle still cycles dark → system → light and the choice persists across relaunch; the status-bar text is legible in both themes.
2. The floating pill sits above the home indicator, ≈80 dp tall, five slots with the orb in the middle; in light mode the pill is black with light icons.
3. Tapping Home / Activity / Metrics / Profile slides the white circle between slots with a spring; tapping the orb shows no circle and opens the Coach tab.
4. With `COACH_ENABLED=false` the hub orb is dim, paused, and `shaping`; tapping it opens the "not available" state. With the coach enabled it breathes (dimmed off the Coach tab, bright on it).
5. Opening the keyboard on the Coach tab slides the bar away; dismissing it brings it back; the chat input is never covered by the bar.
6. Home, Profile and both placeholders scroll/lay out clear of the bar.
7. Pushed screens (a metric, a score, Patterns, Coach memory) show **no** bar; back returns to the tabs.
8. Coach consent: from a not-yet-consented account tap the hub → consent opens; agree → lands on the Coach chat; repeat but press "Not now"/back → the Coach tab shows the "needs your OK" card and does not bounce back to consent.
9. "Ask about this" on a score opens the Coach tab with the question prefilled.
10. iOS Reduce Motion **on**: bar circle and orbs are static; nothing is broken.

Record anything that fails as a follow-up issue; fix blockers before continuing.

- [ ] **Step 3: Update the coach spec's implementation status**

In `docs/superpowers/specs/2026-09-20-ai-coach-design.md`, under "Implementation Status", append a bullet:

```markdown
- **Mobile entry (redesign, `2026-09-21-app-redesign-design.md`):** the coach is now
  the centre tab of the floating bar. The hub orb is **always drawn**, dim and
  paused when the coach is disabled or its status is unknown, and opens the Coach
  tab's existing "unavailable" state. Every other entry point (digest card, "Ask
  about this") is still hidden unless `coachEntryRoute(status)` is non-null.
```

- [ ] **Step 4: Note the vendoring deviation in the redesign spec**

In `docs/superpowers/specs/2026-09-21-app-redesign-design.md` §3.2, change "Vendor the port's four source files (`ThinkingOrb.tsx`, `theme.ts`, `types.ts`, `index.ts`, ≈8 KB)" to "Vendor the port's three source files (`ThinkingOrb.tsx`, `theme.ts`, `types.ts`, ≈8 KB; its `index.ts` only re-exports the engine and is not needed)".

- [ ] **Step 5: Commit and push**

```bash
git add docs
git commit -m "docs: record the coach hub deviation and orb vendoring

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push -u origin redesign-foundation
```

Open a **draft** PR titled "Redesign foundation: dark-first tokens, motion kit, orbs, floating tab bar" whose description lists the manual QA results from Step 2 and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Hand-off to the next plans

After this merges: **Plan D** (backend: `/me/activity`, steps history job, connection/device data) and **Plan C** (coach screen: orb state machine, prompt bar, chat restyle) can proceed in parallel; **Plan B** (Home redesign with the device card, Activity heat map, Metrics and Profile tabs) follows D. Plan C may want the bar's hub orb to reflect live coach state (thinking/answering) — `hubOrbAppearance` and `FloatingTabBar` are the seam to extend; decide there whether to lift that state into a small context.

## Self-review notes (spec coverage)

- §1.1 tokens → Task 3; default dark → Task 2; §1.2 motion kit → Tasks 4–6 (`PressableScale`, `Reveal`, `SegmentedControl`, `Sheet`); restyle-existing-components is limited to `Button` adopting `PressableScale` (the rest already use the token classes).
- §2.1–2.3 navigation and bar → Tasks 8–10; §2.4 hub-when-disabled → Tasks 7–8 (`hubOrbAppearance`) and Task 11 (spec note).
- §3 orbs and the spike gate → Tasks 1, 1B, 7.
- Not in this plan by design: §2.2 tab *contents* (Home restyle, Activity, Metrics, Profile) → plan B; §4 heat map, §5 device card → plan B/D; §6 coach screen redesign → plan C; backend → plan D.
