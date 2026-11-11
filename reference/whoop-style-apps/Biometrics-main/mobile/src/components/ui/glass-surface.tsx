import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { withAlpha } from '../../lib/utils';

export type SurfaceMaterial = 'glass' | 'blur' | 'solid';

/**
 * Which material chrome is drawn with. Real Liquid Glass needs iOS 26 built
 * with the iOS 26 SDK (isLiquidGlassAvailable) *and* the runtime API
 * (isGlassEffectAPIAvailable -- some iOS 26 betas lack it and crash without
 * this check). Older iOS gets the system blur. Reduce Transparency, and any
 * other platform, gets a plain opaque surface.
 */
export function pickMaterial(opts: {
  platform: string;
  liquidGlass: boolean;
  glassApi: boolean;
  reduceTransparency: boolean;
}): SurfaceMaterial {
  if (opts.reduceTransparency || opts.platform !== 'ios') return 'solid';
  if (opts.liquidGlass && opts.glassApi) return 'glass';
  return 'blur';
}

function safely(check: () => boolean): boolean {
  try {
    return check();
  } catch {
    return false;
  }
}

export function useSurfaceMaterial(): SurfaceMaterial {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((on) => active && setReduceTransparency(on))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduceTransparency);
    return () => {
      active = false;
      sub?.remove();
    };
  }, []);
  return pickMaterial({
    platform: Platform.OS,
    liquidGlass: safely(isLiquidGlassAvailable),
    glassApi: safely(isGlassEffectAPIAvailable),
    reduceTransparency,
  });
}

interface GlassSurfaceProps {
  scheme: 'light' | 'dark';
  // The opaque colour used when there is no glass (and under the blur, faintly).
  fallbackColor: string;
  borderRadius: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  testID?: string;
}

// Chrome that floats over content -- the tab bar, sheets. Content surfaces
// (cards, charts) stay opaque: glass is for the navigation layer only.
export function GlassSurface({ scheme, fallbackColor, borderRadius, style, children, testID }: GlassSurfaceProps) {
  const material = useSurfaceMaterial();
  const shape: ViewStyle = { borderRadius, overflow: 'hidden' };

  if (material === 'glass') {
    return (
      <GlassView testID={testID} glassEffectStyle="regular" colorScheme={scheme} style={[shape, style]}>
        {children}
      </GlassView>
    );
  }

  if (material === 'blur') {
    return (
      <BlurView
        testID={testID}
        tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        intensity={90}
        style={[shape, { backgroundColor: withAlpha(fallbackColor, 0.35) }, style]}
      >
        {children}
      </BlurView>
    );
  }

  return (
    <View testID={testID} style={[shape, { backgroundColor: fallbackColor }, style]}>
      {children}
    </View>
  );
}

