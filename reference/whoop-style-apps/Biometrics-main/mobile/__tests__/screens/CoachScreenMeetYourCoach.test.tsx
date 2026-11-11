import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { CoachScreen } from '../../src/screens/CoachScreen';
import { fetchCoachStatus, fetchLatestConversation, fetchTodaySummary, type CoachStatusDTO } from '../../src/api/coach';
import { apiFetch } from '../../src/api/client';
import { withCharacter } from '../../jest-mocks/characterContext';
import type { CharacterContextValue } from '../../src/characters/CharacterContext';

jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  fetchCoachStatus: jest.fn(),
  fetchLatestConversation: jest.fn(),
  // Mocked so the only apiFetch calls in these tests are status reads.
  fetchTodaySummary: jest.fn(),
}));

// The network layer under fetchCoachStatus, so a test can run the real status
// normalization instead of the mocked function.
jest.mock('../../src/api/client', () => ({
  ...jest.requireActual('../../src/api/client'),
  apiFetch: jest.fn(),
}));

jest.mock('../../src/lib/useKeyboardVisible', () => ({ useKeyboardVisible: jest.fn(() => false) }));

const mockNavigate = jest.fn();
let mockFocused = true;
let mockListeners: Record<string, Set<() => void>> = {};
// One navigation object for useNavigation() and the NavigationContext the
// screen's focus hook reads, as in the app.
const mockNavigation = {
  navigate: mockNavigate,
  setParams: jest.fn(),
  goBack: jest.fn(),
  isFocused: () => mockFocused,
  addListener: (event: string, cb: () => void) => {
    (mockListeners[event] ??= new Set()).add(cb);
    return () => {
      mockListeners[event]?.delete(cb);
    };
  },
};
jest.mock('@react-navigation/native', () => ({
  NavigationContext: jest.requireActual('@react-navigation/native').NavigationContext,
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: undefined }),
}));

// The tab gains (or loses) focus, as the navigator reports it.
function emit(event: 'focus' | 'blur') {
  mockFocused = event === 'focus';
  mockListeners[event]?.forEach((cb) => cb());
}

const status: CoachStatusDTO = {
  enabled: true,
  consented: false,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'mochi',
  personaChosen: false,
  personas: [],
};

function coach(overrides: Partial<CharacterContextValue> | null) {
  return (
    <NavigationContext.Provider value={mockNavigation as never}>
      {overrides ? withCharacter(<CoachScreen />, overrides) : <CoachScreen />}
    </NavigationContext.Provider>
  );
}

function renderCoach(overrides: Partial<CharacterContextValue> | null) {
  return render(coach(overrides));
}

// Navigation calls by route name, in order.
function routes() {
  return mockNavigate.mock.calls.map((call) => call[0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockListeners = {};
  (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
  (fetchLatestConversation as jest.Mock).mockResolvedValue({ conversationId: null, messages: [] });
  (fetchTodaySummary as jest.Mock).mockResolvedValue({ date: '2026-09-30', hasData: false, sentence: null, bars: [] });
});

describe('CoachScreen: Meet your coach on the first visit', () => {
  it('opens the picker in first mode before the consent redirect', async () => {
    renderCoach({ status, statusLoaded: true, personaChosen: false });

    expect(mockNavigate).toHaveBeenCalledWith('MeetYourCoach', { mode: 'first' });
    // The picker now covers the tab; the status load settles without redirecting.
    mockFocused = false;
    await waitFor(() => expect(fetchCoachStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(routes()).toEqual(['MeetYourCoach']);

    // Back from the picker: the focus reload sends the user to consent as before.
    await act(async () => {
      emit('focus');
    });
    await waitFor(() => expect(routes()).toEqual(['MeetYourCoach', 'CoachConsent']));
  });

  it("opens from the screen's own status when it settles before the provider's", async () => {
    renderCoach({ status: null, statusLoaded: false, personaChosen: false });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('MeetYourCoach', { mode: 'first' }));
    expect(routes()).toEqual(['MeetYourCoach']);
  });

  it("waits for focus when the provider's status settles after the user left the Coach tab", async () => {
    // The screen's own status never settles here, so only the provider path is in play.
    (fetchCoachStatus as jest.Mock).mockReturnValue(new Promise(() => {}));
    const utils = renderCoach({ status: null, statusLoaded: false, personaChosen: false });
    await act(async () => {
      emit('blur');
    });

    utils.rerender(coach({ status, statusLoaded: true, personaChosen: false }));
    await act(async () => {});
    expect(mockNavigate).not.toHaveBeenCalled();

    await act(async () => {
      emit('focus');
    });
    expect(routes()).toEqual(['MeetYourCoach']);
    expect(mockNavigate).toHaveBeenCalledWith('MeetYourCoach', { mode: 'first' });
  });

  it("waits for focus when the screen's own status settles after the user left the Coach tab", async () => {
    let settle!: (s: CoachStatusDTO) => void;
    (fetchCoachStatus as jest.Mock).mockReturnValueOnce(new Promise<CoachStatusDTO>((res) => (settle = res)));
    renderCoach({ status: null, statusLoaded: false, personaChosen: false });
    await act(async () => {
      emit('blur');
    });

    await act(async () => settle(status));
    expect(mockNavigate).not.toHaveBeenCalled();

    await act(async () => {
      emit('focus');
    });
    await waitFor(() => expect(routes()).toEqual(['MeetYourCoach']));
  });

  it('still loads the chat underneath for a consented user', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, consented: true });
    const { findByTestId } = renderCoach({ status: { ...status, consented: true }, statusLoaded: true, personaChosen: false });

    expect(await findByTestId('coach-input')).toBeTruthy();
    expect(routes()).toEqual(['MeetYourCoach']);
  });

  it('opens at most once per mount, even if nothing was saved', async () => {
    renderCoach({ status, statusLoaded: true, personaChosen: false });
    await waitFor(() => expect(fetchCoachStatus).toHaveBeenCalledTimes(1));

    await act(async () => {
      emit('focus');
    });
    await act(async () => {
      emit('focus');
    });

    expect(routes().filter((r) => r === 'MeetYourCoach')).toHaveLength(1);
  });

  it('does not open once a character has been chosen', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, personaChosen: true });
    renderCoach({ status: { ...status, personaChosen: true }, statusLoaded: true, personaChosen: true });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('CoachConsent', { prefill: undefined }));
    expect(routes()).not.toContain('MeetYourCoach');
  });

  it('never opens while the coach is disabled', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, enabled: false });
    const { findByTestId } = renderCoach({ status: { ...status, enabled: false }, statusLoaded: true, personaChosen: false });

    expect(await findByTestId('coach-unavailable')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not open when the status request failed', async () => {
    (fetchCoachStatus as jest.Mock).mockRejectedValue(new Error('offline'));
    const { findByTestId } = renderCoach({ status: null, statusLoaded: true, personaChosen: false });

    expect(await findByTestId('coach-status-unverified')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not open for a server that does not report personaChosen', async () => {
    // The real fetchCoachStatus runs over a server body without the field. Its
    // result feeds both paths: the screen's own load and the provider's status.
    const realFetchCoachStatus = jest.requireActual<typeof import('../../src/api/coach')>('../../src/api/coach').fetchCoachStatus;
    const { personaChosen: _omitted, ...legacy } = status;
    (apiFetch as jest.Mock).mockImplementation(async (path: string) => {
      if (path !== '/me/coach/status') throw new Error(`unexpected request ${path}`);
      return legacy;
    });
    (fetchCoachStatus as jest.Mock).mockImplementation(realFetchCoachStatus);
    const normalized = await realFetchCoachStatus();
    expect(normalized.enabled).toBe(true);

    renderCoach({ status: normalized, statusLoaded: true, personaChosen: false });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('CoachConsent', { prefill: undefined }));
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(routes()).not.toContain('MeetYourCoach');
  });

  it("follows the status, not the provider's own flag, for a status with no character id", async () => {
    // The provider's personaChosen stays at its initial false when the status
    // has an empty personaId; the status itself says chosen, so nothing opens.
    const noId = { ...status, personaId: '', personaChosen: true };
    (fetchCoachStatus as jest.Mock).mockResolvedValue(noId);
    renderCoach({ status: noId, statusLoaded: true, personaChosen: false });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('CoachConsent', { prefill: undefined }));
    expect(routes()).not.toContain('MeetYourCoach');
  });
});
