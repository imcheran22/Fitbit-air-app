import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

// The signed-in NavigationContainer's ref, for navigating from outside a screen
// (a tapped notification). The signed-out stack has its own container and never
// gets this ref, so isReady() is only true while the signed-in app is mounted.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Routes RootNavigator presents natively as modals (presentation 'modal' / 'fullScreenModal'). An
// RN Modal presented over one of them is dropped on iOS, so the badge celebration waits them out.
export const MODAL_ROUTES: ReadonlySet<string> = new Set<keyof RootStackParamList>(['RecapStory', 'MeetYourCoach']);
