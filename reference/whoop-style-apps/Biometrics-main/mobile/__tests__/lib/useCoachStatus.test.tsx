import { renderHook, waitFor, act } from '@testing-library/react-native';
import { coachEntryRoute, useCoachStatus } from '../../src/lib/useCoachStatus';
import { fetchCoachStatus, type CoachStatusDTO } from '../../src/api/coach';
import { fetchScoresWithBands } from '../../src/api/scores';
import { CharacterProvider, useCharacter } from '../../src/characters/CharacterProvider';
import {
  clearCachedCharacter,
  readCachedCharacter,
  readCachedThinking,
  writeCachedCharacter,
  writeCachedThinking,
} from '../../src/characters/characterCache';

jest.mock('../../src/api/coach');
jest.mock('../../src/api/scores', () => ({ fetchScoresWithBands: jest.fn() }));
jest.mock('../../src/characters/characterCache');
jest.mock('../../src/auth/AuthContext', () => ({
  useOptionalAuth: () => ({ session: { userId: 'u1', email: 'u1@example.com' }, isPending: false }),
}));

const base: CoachStatusDTO = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'mochi',
  personaChosen: true,
  personas: [],
  thinkingAttachment: 'bulb',
  thinkingText: 'steps',
};

beforeEach(() => {
  jest.clearAllMocks();
  (fetchScoresWithBands as jest.Mock).mockResolvedValue({ scores: [], bands: undefined });
  (readCachedCharacter as jest.Mock).mockResolvedValue(null);
  (writeCachedCharacter as jest.Mock).mockResolvedValue(undefined);
  (clearCachedCharacter as jest.Mock).mockResolvedValue(undefined);
  (readCachedThinking as jest.Mock).mockResolvedValue(null);
  (writeCachedThinking as jest.Mock).mockResolvedValue(undefined);
});

describe('useCoachStatus without a CharacterProvider (a screen rendered on its own)', () => {
  it('is null until the server answers, then exposes the status', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue(base);
    const { result } = renderHook(() => useCoachStatus());

    expect(result.current.status).toBeNull();
    await waitFor(() => expect(result.current.status).toEqual(base));
  });

  it('stays null (coach invisible) when the status request fails', async () => {
    (fetchCoachStatus as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCoachStatus());

    await waitFor(() => expect(fetchCoachStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.status).toBeNull();
  });

  it('refetches when the screen regains focus', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...base, consented: false });
    let onFocus: () => void = () => {};
    const unsubscribe = jest.fn();
    const navigation = {
      addListener: jest.fn((_event: string, cb: () => void) => {
        onFocus = cb;
        return unsubscribe;
      }),
    };
    const { result, unmount } = renderHook(() => useCoachStatus(navigation));
    await waitFor(() => expect(result.current.status?.consented).toBe(false));

    (fetchCoachStatus as jest.Mock).mockResolvedValue(base);
    act(() => onFocus());
    await waitFor(() => expect(result.current.status?.consented).toBe(true));

    expect(navigation.addListener).toHaveBeenCalledWith('focus', expect.any(Function));
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('lets a caller replace the status locally (e.g. after a persona change)', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue(base);
    const { result } = renderHook(() => useCoachStatus());
    await waitFor(() => expect(result.current.status).not.toBeNull());

    act(() => result.current.setStatus({ ...base, personaId: 'kit' }));
    expect(result.current.status?.personaId).toBe('kit');
  });
});

describe('useCoachStatus inside a CharacterProvider', () => {
  // Two callers on one screen, plus the provider itself, as in the app.
  function renderTwoCallers(navigation?: Parameters<typeof useCoachStatus>[0]) {
    return renderHook(() => ({ a: useCoachStatus(navigation), b: useCoachStatus(), character: useCharacter() }), {
      wrapper: CharacterProvider,
    });
  }

  it("reads the provider's status, fetched once however many screens ask", async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue(base);
    const { result } = renderTwoCallers();

    await waitFor(() => expect(result.current.a.status).toEqual(base));
    expect(result.current.b.status).toEqual(base);
    expect(fetchCoachStatus).toHaveBeenCalledTimes(1);
  });

  it('refresh reads the status again for every caller', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue(base);
    const { result } = renderTwoCallers();
    await waitFor(() => expect(result.current.a.status).toEqual(base));
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...base, consented: false });

    await act(() => result.current.a.refresh());

    expect(result.current.b.status?.consented).toBe(false);
    expect(fetchCoachStatus).toHaveBeenCalledTimes(2);
  });

  it('still refetches when the screen regains focus', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue(base);
    let onFocus: () => void = () => {};
    const navigation = {
      addListener: jest.fn((_event: string, cb: () => void) => {
        onFocus = cb;
        return jest.fn();
      }),
    };
    const { result } = renderTwoCallers(navigation);
    await waitFor(() => expect(result.current.a.status).toEqual(base));
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...base, enabled: false, consented: false });

    await act(async () => onFocus());

    await waitFor(() => expect(result.current.b.status?.enabled).toBe(false));
  });

  it('setStatus replaces the shared status, and a new personaId becomes the character', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue(base);
    const { result } = renderTwoCallers();
    await waitFor(() => expect(result.current.a.status).toEqual(base));

    act(() => result.current.a.setStatus({ ...base, personaId: 'boba', consented: false }));

    expect(result.current.b.status?.consented).toBe(false);
    expect(result.current.character.characterId).toBe('boba');
  });
});

describe('coachEntryRoute', () => {
  it('is null (no entry point at all) when the coach is disabled or status is unknown', () => {
    expect(coachEntryRoute(null)).toBeNull();
    expect(coachEntryRoute({ ...base, enabled: false })).toBeNull();
    expect(coachEntryRoute({ ...base, enabled: false, consented: true })).toBeNull();
  });

  it('goes to consent when enabled but not consented', () => {
    expect(coachEntryRoute({ ...base, consented: false })).toBe('CoachConsent');
  });

  it('goes to the chat when enabled and consented', () => {
    expect(coachEntryRoute(base)).toBe('Coach');
  });
});
