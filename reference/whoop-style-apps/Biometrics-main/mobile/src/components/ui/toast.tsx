import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeOut, SlideInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { Text } from './text';
import { COLORS } from '../../theme';

// A short confirmation that slides down from the top and goes away by itself
// ("Synced with Google Health"). A newer toast replaces the one showing.

export const TOAST_MS = 2500;

type Tone = 'success' | 'error';
interface ToastApi {
  show: (text: string, tone: Tone) => void;
}

const NOOP: ToastApi = { show: () => undefined };
const ToastContext = createContext<ToastApi | null>(null);

/** Outside a ToastProvider (a screen rendered on its own, in tests) this is a no-op. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const [toast, setToast] = useState<{ id: number; text: string; tone: Tone } | null>(null);

  const show = useCallback((text: string, tone: Tone) => {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, text, tone }));
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <SafeAreaView edges={['top']} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View
            key={toast.id}
            entering={SlideInUp.duration(250)}
            exiting={FadeOut.duration(250)}
            testID="toast"
            className="mx-4 mt-2 flex-row items-center gap-2 self-center rounded-full border border-border bg-card px-4 py-2.5"
          >
            <Ionicons
              name={toast.tone === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={toast.tone === 'success' ? colors.scoreExcellent : colors.scorePoor}
            />
            <Text className="text-body font-medium">{toast.text}</Text>
          </Animated.View>
        </SafeAreaView>
      ) : null}
    </ToastContext.Provider>
  );
}
