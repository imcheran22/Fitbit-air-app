import React from 'react';
import { AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { CharacterProvider, useCharacter, useSetCoachStatus } from '../../src/characters/CharacterProvider';
import { fetchCoachStatus, setCoachPersona, setCoachThinking, type CoachStatusDTO } from '../../src/api/coach';
import { fetchScoresWithBands, type DailyScoreDTO } from '../../src/api/scores';
import {
  clearCachedCharacter,
  readCachedCharacter,
  readCachedThinking,
  writeCachedCharacter,
  writeCachedThinking,
} from '../../src/characters/characterCache';

jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  fetchCoachStatus: jest.fn(),
  setCoachPersona: jest.fn(),
  setCoachThinking: jest.fn(),
}));
jest.mock('../../src/api/scores', () => ({ fetchScoresWithBands: jest.fn() }));
jest.mock('../../src/characters/characterCache');

let mockAuth: { session: { userId: string; email: string } | null; isPending: boolean } | undefined;
jest.mock('../../src/auth/AuthContext', () => ({ useOptionalAuth: () => mockAuth }));

const status: CoachStatusDTO = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'kit',
  personaChosen: true,
  personas: [],
  thinkingAttachment: 'bulb',
  thinkingText: 'steps',
};

function recovery(score: number | null): DailyScoreDTO {
  return { date: '2026-09-29', type: 'RECOVERY', score, confidenceLevel: 'HIGH', algorithmVersion: 'v1', factors: [], coldStart: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const signedIn = (userId = 'u1') => ({ session: { userId, email: `${userId}@example.com` }, isPending: false });

function renderCharacter() {
  return renderHook(() => useCharacter(), { wrapper: CharacterProvider });
}

let appStateListener: ((state: string) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = signedIn();
  (readCachedCharacter as jest.Mock).mockResolvedValue(null);
  (writeCachedCharacter as jest.Mock).mockResolvedValue(undefined);
  (clearCachedCharacter as jest.Mock).mockResolvedValue(undefined);
  (readCachedThinking as jest.Mock).mockResolvedValue(null);
  (writeCachedThinking as jest.Mock).mockResolvedValue(undefined);
  (setCoachThinking as jest.Mock).mockResolvedValue({ thinkingAttachment: 'bulb', thinkingText: 'steps' });
  (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
  (setCoachPersona as jest.Mock).mockResolvedValue({ personaId: 'axo' });
  (fetchScoresWithBands as jest.Mock).mockResolvedValue({ scores: [recovery(80)], bands: { excellent: 75, good: 55, fair: 40 } });
  appStateListener = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: (state: string) => void) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  }) as never);
});

describe('CharacterProvider: which character', () => {
  it('is Mochi before anything has loaded when nothing is cached', async () => {
    (fetchCoachStatus as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { result } = renderCharacter();

    expect(result.current.characterId).toBe('mochi');
    await waitFor(() => expect(readCachedCharacter).toHaveBeenCalled());
    expect(result.current.characterId).toBe('mochi');
    expect(result.current.statusLoaded).toBe(false);
  });

  it('shows the cached character on a signed-in cold start, before the status arrives', async () => {
    (readCachedCharacter as jest.Mock).mockResolvedValue('boba');
    (fetchCoachStatus as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.characterId).toBe('boba'));
  });

  it("switches to the server's character, exposes the status, and caches it", async () => {
    (readCachedCharacter as jest.Mock).mockResolvedValue('boba');
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.characterId).toBe('kit'));
    expect(result.current.status).toEqual(status);
    expect(result.current.statusLoaded).toBe(true);
    expect(result.current.personaChosen).toBe(true);
    expect(writeCachedCharacter).toHaveBeenCalledWith('kit');
  });

  it('does not let a slow cache read replace the character the server already named', async () => {
    const cache = deferred<string | null>();
    (readCachedCharacter as jest.Mock).mockReturnValue(cache.promise);
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.characterId).toBe('kit'));

    await act(async () => cache.resolve('boba'));

    expect(result.current.characterId).toBe('kit');
  });

  it('shows Mochi for an id this app does not know', async () => {
    (readCachedCharacter as jest.Mock).mockResolvedValue('boba');
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, personaId: 'twinkle' });
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    expect(result.current.characterId).toBe('mochi');
    expect(writeCachedCharacter).toHaveBeenCalledWith('mochi');
  });

  it('ignores a cached id this app does not know and shows Mochi', async () => {
    // characterCache validates too, but the provider must never expose an
    // unvalidated id: CharacterCanvas has no fallback for one.
    (readCachedCharacter as jest.Mock).mockResolvedValue('twinkle');
    (fetchCoachStatus as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { result } = renderCharacter();

    await waitFor(() => expect(readCachedCharacter).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.characterId).toBe('mochi');
  });

  it('shows Mochi when a status set through useSetCoachStatus names an unknown id', async () => {
    const { result } = renderHook(() => ({ character: useCharacter(), setStatus: useSetCoachStatus() }), {
      wrapper: CharacterProvider,
    });
    await waitFor(() => expect(result.current.character.characterId).toBe('kit'));

    act(() => result.current.setStatus?.({ ...status, personaId: 'twinkle' }));

    expect(result.current.character.characterId).toBe('mochi');
    expect(writeCachedCharacter).toHaveBeenLastCalledWith('mochi');
  });

  it('keeps the cached character when the status does not name one (malformed status)', async () => {
    (readCachedCharacter as jest.Mock).mockResolvedValue('boba');
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, enabled: false, consented: false, personaId: '', personaChosen: false });
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    await waitFor(() => expect(result.current.characterId).toBe('boba'));
    expect(writeCachedCharacter).not.toHaveBeenCalled();
  });

  it("still shows the user's character when the coach is switched off", async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, enabled: false, consented: false });
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.characterId).toBe('kit'));
    expect(result.current.status?.enabled).toBe(false);
  });

  it('keeps the cached character and reports an unknown status when the status request fails', async () => {
    (readCachedCharacter as jest.Mock).mockResolvedValue('boba');
    (fetchCoachStatus as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    await waitFor(() => expect(result.current.characterId).toBe('boba'));
    expect(result.current.status).toBeNull();
    expect(result.current.personaChosen).toBe(false);
  });

  it('reports personaChosen false for a user who never picked', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, personaId: 'mochi', personaChosen: false });
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    expect(result.current.personaChosen).toBe(false);
    expect(result.current.characterId).toBe('mochi');
  });

  it('refreshStatus reads the status again', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.characterId).toBe('kit'));
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, personaId: 'peep', consented: false });

    await act(() => result.current.refreshStatus());

    expect(result.current.characterId).toBe('peep');
    expect(result.current.status?.consented).toBe(false);
  });
});

describe('CharacterProvider: signed out', () => {
  it('is Mochi, clears the cache and fetches nothing', async () => {
    mockAuth = { session: null, isPending: false };
    (readCachedCharacter as jest.Mock).mockResolvedValue('boba');
    const { result } = renderCharacter();

    await waitFor(() => expect(clearCachedCharacter).toHaveBeenCalled());
    expect(result.current.characterId).toBe('mochi');
    expect(result.current.status).toBeNull();
    expect(result.current.statusLoaded).toBe(false);
    expect(readCachedCharacter).not.toHaveBeenCalled();
    expect(fetchCoachStatus).not.toHaveBeenCalled();
    expect(fetchScoresWithBands).not.toHaveBeenCalled();
  });

  it('treats no AuthProvider at all as signed out', async () => {
    mockAuth = undefined;
    const { result } = renderCharacter();

    await waitFor(() => expect(clearCachedCharacter).toHaveBeenCalled());
    expect(result.current.characterId).toBe('mochi');
    expect(fetchCoachStatus).not.toHaveBeenCalled();
  });

  it('keeps the cache, and fetches nothing, while the session is still loading on a cold start', async () => {
    mockAuth = { session: null, isPending: true };
    (readCachedCharacter as jest.Mock).mockResolvedValue('boba');
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.characterId).toBe('boba'));
    expect(clearCachedCharacter).not.toHaveBeenCalled();
    expect(fetchCoachStatus).not.toHaveBeenCalled();
  });

  it('goes back to Mochi, clears the cache and drops the status on sign-out', async () => {
    const { result, rerender } = renderCharacter();
    await waitFor(() => expect(result.current.characterId).toBe('kit'));

    mockAuth = { session: null, isPending: false };
    rerender({});

    await waitFor(() => expect(result.current.characterId).toBe('mochi'));
    expect(clearCachedCharacter).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBeNull();
    expect(result.current.recoveryBand).toBeNull();
    expect(result.current.personaChosen).toBe(false);
  });

  it('ignores a status reply that lands after sign-out', async () => {
    const reply = deferred<CoachStatusDTO>();
    (fetchCoachStatus as jest.Mock).mockReturnValue(reply.promise);
    const { result, rerender } = renderCharacter();
    await waitFor(() => expect(fetchCoachStatus).toHaveBeenCalled());

    mockAuth = { session: null, isPending: false };
    rerender({});
    await act(async () => reply.resolve(status));

    expect(result.current.characterId).toBe('mochi');
    expect(result.current.status).toBeNull();
    expect(writeCachedCharacter).not.toHaveBeenCalled();
  });

  it('loads the next account afresh after a switch', async () => {
    const { result, rerender } = renderCharacter();
    await waitFor(() => expect(result.current.characterId).toBe('kit'));
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, personaId: 'jelly' });

    mockAuth = signedIn('u2');
    rerender({});

    await waitFor(() => expect(result.current.characterId).toBe('jelly'));
    expect(fetchCoachStatus).toHaveBeenCalledTimes(2);
  });

  it('ignores a status reply that lands after unmount', async () => {
    const reply = deferred<CoachStatusDTO>();
    (fetchCoachStatus as jest.Mock).mockReturnValue(reply.promise);
    const { unmount } = renderCharacter();
    await waitFor(() => expect(fetchCoachStatus).toHaveBeenCalled());

    unmount();
    await act(async () => reply.resolve(status));

    expect(writeCachedCharacter).not.toHaveBeenCalled();
  });
});

describe('CharacterProvider: chooseCharacter', () => {
  it('switches at once, saves to the server and the cache', async () => {
    const save = deferred<{ personaId: string }>();
    (setCoachPersona as jest.Mock).mockReturnValue(save.promise);
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, personaId: 'mochi', personaChosen: false });
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.statusLoaded).toBe(true));

    let done!: Promise<void>;
    act(() => {
      done = result.current.chooseCharacter('axo');
    });

    expect(result.current.characterId).toBe('axo');
    expect(result.current.personaChosen).toBe(true);
    expect(result.current.status?.personaId).toBe('axo');
    expect(setCoachPersona).toHaveBeenCalledWith('axo');
    expect(writeCachedCharacter).toHaveBeenLastCalledWith('axo');
    await act(async () => {
      save.resolve({ personaId: 'axo' });
      await done;
    });
    expect(result.current.characterId).toBe('axo');
  });

  it('puts the previous character back and rethrows when saving fails', async () => {
    (setCoachPersona as jest.Mock).mockRejectedValue(new Error('offline'));
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, personaId: 'mochi', personaChosen: false });
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.statusLoaded).toBe(true));

    let caught: unknown;
    await act(async () => {
      await result.current.chooseCharacter('axo').catch((e: unknown) => {
        caught = e;
      });
    });

    expect((caught as Error).message).toBe('offline');
    expect(result.current.characterId).toBe('mochi');
    expect(result.current.personaChosen).toBe(false);
    expect(result.current.status?.personaId).toBe('mochi');
    expect(result.current.status?.personaChosen).toBe(false);
    expect(writeCachedCharacter).toHaveBeenLastCalledWith('mochi');
  });

  it('works while the coach status is unknown (status request failed)', async () => {
    (fetchCoachStatus as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.statusLoaded).toBe(true));

    await act(() => result.current.chooseCharacter('bun'));

    expect(result.current.characterId).toBe('bun');
    expect(result.current.status).toBeNull();
  });

  it('is not undone by a status fetch that started before the choice', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.characterId).toBe('kit'));
    const staleStatus = deferred<CoachStatusDTO>();
    const save = deferred<{ personaId: string }>();
    (fetchCoachStatus as jest.Mock).mockReturnValue(staleStatus.promise);
    (setCoachPersona as jest.Mock).mockReturnValue(save.promise);

    let refreshing!: Promise<void>;
    let choosing!: Promise<void>;
    act(() => {
      refreshing = result.current.refreshStatus();
      choosing = result.current.chooseCharacter('axo');
    });
    await act(async () => {
      staleStatus.resolve(status);
      await refreshing;
    });

    expect(result.current.characterId).toBe('axo');
    expect(result.current.status?.personaId).toBe('axo');
    await act(async () => {
      save.resolve({ personaId: 'axo' });
      await choosing;
    });
  });
});

describe('CharacterProvider: chooseCharacter races and guards', () => {
  it('is not undone by a status fetch that started before the choice and lands after the save', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.characterId).toBe('kit'));
    const staleStatus = deferred<CoachStatusDTO>();
    const save = deferred<{ personaId: string }>();
    (fetchCoachStatus as jest.Mock).mockReturnValue(staleStatus.promise);
    (setCoachPersona as jest.Mock).mockReturnValue(save.promise);

    let refreshing!: Promise<void>;
    let choosing!: Promise<void>;
    act(() => {
      refreshing = result.current.refreshStatus();
      choosing = result.current.chooseCharacter('axo');
    });
    await act(async () => {
      save.resolve({ personaId: 'axo' });
      await choosing;
    });
    await act(async () => {
      staleStatus.resolve(status);
      await refreshing;
    });

    expect(result.current.characterId).toBe('axo');
    expect(result.current.personaChosen).toBe(true);
    expect(result.current.status?.personaId).toBe('axo');
    expect(writeCachedCharacter).toHaveBeenLastCalledWith('axo');
  });

  it('is not undone by a status fetch that started while the save was pending and lands after it', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.characterId).toBe('kit'));
    const staleStatus = deferred<CoachStatusDTO>();
    const save = deferred<{ personaId: string }>();
    (fetchCoachStatus as jest.Mock).mockReturnValue(staleStatus.promise);
    (setCoachPersona as jest.Mock).mockReturnValue(save.promise);

    let refreshing!: Promise<void>;
    let choosing!: Promise<void>;
    act(() => {
      choosing = result.current.chooseCharacter('axo');
      refreshing = result.current.refreshStatus();
    });
    await act(async () => {
      save.resolve({ personaId: 'axo' });
      await choosing;
    });
    await act(async () => {
      staleStatus.resolve(status);
      await refreshing;
    });

    expect(result.current.characterId).toBe('axo');
    expect(result.current.status?.personaId).toBe('axo');
    expect(writeCachedCharacter).toHaveBeenLastCalledWith('axo');
  });

  it('lets a status through that started while a save was pending, once that save has failed', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.characterId).toBe('kit'));
    const staleStatus = deferred<CoachStatusDTO>();
    const save = deferred<{ personaId: string }>();
    (fetchCoachStatus as jest.Mock).mockReturnValue(staleStatus.promise);
    (setCoachPersona as jest.Mock).mockReturnValue(save.promise);

    let refreshing!: Promise<void>;
    let choosing!: Promise<void>;
    act(() => {
      choosing = result.current.chooseCharacter('axo');
      refreshing = result.current.refreshStatus();
    });
    await act(async () => {
      save.reject(new Error('offline'));
      await choosing.catch(() => {});
    });
    await act(async () => {
      staleStatus.resolve(status);
      await refreshing;
    });

    expect(result.current.characterId).toBe('kit');
    expect(writeCachedCharacter).toHaveBeenLastCalledWith('kit');
  });

  it('lets a stale status through once the choice it raced has failed', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.characterId).toBe('kit'));
    const staleStatus = deferred<CoachStatusDTO>();
    (fetchCoachStatus as jest.Mock).mockReturnValue(staleStatus.promise);
    (setCoachPersona as jest.Mock).mockRejectedValue(new Error('offline'));

    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.refreshStatus();
    });
    await act(async () => {
      await result.current.chooseCharacter('axo').catch(() => {});
    });
    await act(async () => {
      staleStatus.resolve(status);
      await refreshing;
    });

    expect(result.current.characterId).toBe('kit');
    expect(writeCachedCharacter).toHaveBeenLastCalledWith('kit');
  });

  it('does nothing while signed out', async () => {
    mockAuth = { session: null, isPending: false };
    const { result } = renderCharacter();
    await waitFor(() => expect(clearCachedCharacter).toHaveBeenCalled());

    await act(() => result.current.chooseCharacter('axo'));

    expect(result.current.characterId).toBe('mochi');
    expect(result.current.personaChosen).toBe(false);
    expect(setCoachPersona).not.toHaveBeenCalled();
    expect(writeCachedCharacter).not.toHaveBeenCalled();
  });

  it('rejects an id this app does not know, without changing anything', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.characterId).toBe('kit'));
    (writeCachedCharacter as jest.Mock).mockClear();

    let caught: unknown;
    await act(async () => {
      await result.current.chooseCharacter('twinkle' as never).catch((e: unknown) => {
        caught = e;
      });
    });

    expect(caught).toBeInstanceOf(Error);
    expect(result.current.characterId).toBe('kit');
    expect(setCoachPersona).not.toHaveBeenCalled();
    expect(writeCachedCharacter).not.toHaveBeenCalled();
  });
});

describe('CharacterProvider: thinking settings', () => {
  it('starts on the defaults and takes the server values once the status arrives, caching them', async () => {
    const reply = deferred<CoachStatusDTO>();
    (fetchCoachStatus as jest.Mock).mockReturnValue(reply.promise);
    const { result } = renderCharacter();

    expect(result.current.thinkingAttachment).toBe('bulb');
    expect(result.current.thinkingText).toBe('steps');
    await act(async () => reply.resolve({ ...status, thinkingAttachment: 'clock', thinkingText: 'tag' }));

    expect(result.current.thinkingAttachment).toBe('clock');
    expect(result.current.thinkingText).toBe('tag');
    expect(writeCachedThinking).toHaveBeenCalledWith({ attachment: 'clock', text: 'tag' });
  });

  it('shows the cached settings on a signed-in cold start, before the status arrives', async () => {
    (readCachedThinking as jest.Mock).mockResolvedValue({ attachment: 'gears', text: 'dialog' });
    (fetchCoachStatus as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.thinkingAttachment).toBe('gears'));
    expect(result.current.thinkingText).toBe('dialog');
  });

  it('does not let a slow cache read replace the settings the server already sent', async () => {
    const cache = deferred<{ attachment: string; text: string } | null>();
    (readCachedThinking as jest.Mock).mockReturnValue(cache.promise);
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, thinkingAttachment: 'clock', thinkingText: 'tag' });
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.thinkingAttachment).toBe('clock'));

    await act(async () => cache.resolve({ attachment: 'gears', text: 'dialog' }));

    expect(result.current.thinkingAttachment).toBe('clock');
    expect(result.current.thinkingText).toBe('tag');
  });

  it('falls back to the defaults for a status without thinking fields (an older server, via useSetCoachStatus)', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, thinkingAttachment: 'clock', thinkingText: 'tag' });
    const { result } = renderHook(() => ({ character: useCharacter(), setStatus: useSetCoachStatus() }), {
      wrapper: CharacterProvider,
    });
    await waitFor(() => expect(result.current.character.thinkingAttachment).toBe('clock'));
    const { thinkingAttachment: _a, thinkingText: _t, ...older } = status;

    act(() => result.current.setStatus?.(older as CoachStatusDTO));

    expect(result.current.character.thinkingAttachment).toBe('bulb');
    expect(result.current.character.thinkingText).toBe('steps');
  });

  it('switches at once, saves only the given setting, and caches it', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.statusLoaded).toBe(true));

    await act(async () => {
      await result.current.chooseThinking({ text: 'dialog' });
    });

    expect(result.current.thinkingAttachment).toBe('bulb');
    expect(result.current.thinkingText).toBe('dialog');
    expect(result.current.status?.thinkingText).toBe('dialog');
    expect(setCoachThinking).toHaveBeenCalledWith({ text: 'dialog' });
    expect(writeCachedThinking).toHaveBeenLastCalledWith({ attachment: 'bulb', text: 'dialog' });
  });

  it('switches the thinking text at once and rolls back when the save fails', async () => {
    const save = deferred<never>();
    (setCoachThinking as jest.Mock).mockReturnValue(save.promise);
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    expect(result.current.thinkingText).toBe('steps');

    let failed: unknown;
    let done!: Promise<void>;
    act(() => {
      done = result.current.chooseThinking({ text: 'dialog', attachment: 'gears' }).catch((e: unknown) => {
        failed = e;
      });
    });
    expect(result.current.thinkingText).toBe('dialog');
    expect(result.current.thinkingAttachment).toBe('gears');

    await act(async () => {
      save.reject(new Error('offline'));
      await done;
    });

    expect(failed).toBeInstanceOf(Error);
    expect(result.current.thinkingText).toBe('steps');
    expect(result.current.thinkingAttachment).toBe('bulb');
    expect(result.current.status?.thinkingText).toBe('steps');
    expect(writeCachedThinking).toHaveBeenLastCalledWith({ attachment: 'bulb', text: 'steps' });
  });

  it('is not undone by a status fetch that started before the choice and lands after the save', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.statusLoaded).toBe(true));
    const staleStatus = deferred<CoachStatusDTO>();
    (fetchCoachStatus as jest.Mock).mockReturnValue(staleStatus.promise);

    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.refreshStatus();
    });
    await act(async () => {
      await result.current.chooseThinking({ attachment: 'spinner' });
    });
    await act(async () => {
      staleStatus.resolve(status);
      await refreshing;
    });

    expect(result.current.thinkingAttachment).toBe('spinner');
  });

  it('rejects an unknown id without saving anything', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.statusLoaded).toBe(true));

    let caught: unknown;
    await act(async () => {
      await result.current.chooseThinking({ attachment: 'rocket' as never }).catch((e: unknown) => {
        caught = e;
      });
    });

    expect(caught).toBeInstanceOf(Error);
    expect(result.current.thinkingAttachment).toBe('bulb');
    expect(setCoachThinking).not.toHaveBeenCalled();
  });

  it('is the defaults when signed out, reads no cache and saves nothing', async () => {
    mockAuth = { session: null, isPending: false };
    (readCachedThinking as jest.Mock).mockResolvedValue({ attachment: 'gears', text: 'dialog' });
    const { result } = renderCharacter();

    await waitFor(() => expect(clearCachedCharacter).toHaveBeenCalled());
    await act(async () => {
      await result.current.chooseThinking({ text: 'dialog' });
    });
    expect(result.current.thinkingAttachment).toBe('bulb');
    expect(result.current.thinkingText).toBe('steps');
    expect(readCachedThinking).not.toHaveBeenCalled();
    expect(setCoachThinking).not.toHaveBeenCalled();
  });

  it('goes back to the defaults on sign-out', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, thinkingAttachment: 'clock', thinkingText: 'tag' });
    const { result, rerender } = renderCharacter();
    await waitFor(() => expect(result.current.thinkingAttachment).toBe('clock'));

    mockAuth = { session: null, isPending: false };
    rerender({});

    await waitFor(() => expect(result.current.thinkingAttachment).toBe('bulb'));
    expect(result.current.thinkingText).toBe('steps');
  });
});

describe('CharacterProvider: recovery band', () => {
  it("is the band of today's Recovery Score, fetched once for one day", async () => {
    (fetchScoresWithBands as jest.Mock).mockResolvedValue({ scores: [recovery(30)], bands: { excellent: 75, good: 55, fair: 40 } });
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.recoveryBand).toBe('scorePoor'));
    expect(fetchScoresWithBands).toHaveBeenCalledTimes(1);
    expect(fetchScoresWithBands).toHaveBeenCalledWith(1, 'RECOVERY');
  });

  it("uses the server's band thresholds", async () => {
    (fetchScoresWithBands as jest.Mock).mockResolvedValue({ scores: [recovery(60)], bands: { excellent: 90, good: 70, fair: 65 } });
    const { result } = renderCharacter();

    await waitFor(() => expect(result.current.recoveryBand).toBe('scorePoor'));
  });

  it('is null when there is no score today, or the score is still cold-starting', async () => {
    (fetchScoresWithBands as jest.Mock).mockResolvedValue({ scores: [recovery(null)], bands: undefined });
    const { result } = renderCharacter();
    await waitFor(() => expect(fetchScoresWithBands).toHaveBeenCalled());
    await act(async () => {});

    expect(result.current.recoveryBand).toBeNull();
  });

  it('is null when the scores request fails', async () => {
    (fetchScoresWithBands as jest.Mock).mockRejectedValue(new Error('offline'));
    const { result } = renderCharacter();
    await waitFor(() => expect(fetchScoresWithBands).toHaveBeenCalled());
    await act(async () => {});

    expect(result.current.recoveryBand).toBeNull();
  });

  it('is read again when the app returns to the foreground', async () => {
    const { result } = renderCharacter();
    await waitFor(() => expect(result.current.recoveryBand).toBe('scoreExcellent'));
    (fetchScoresWithBands as jest.Mock).mockResolvedValue({ scores: [recovery(10)], bands: undefined });

    await act(async () => appStateListener?.('background'));
    await act(async () => appStateListener?.('active'));

    await waitFor(() => expect(result.current.recoveryBand).toBe('scorePoor'));
    expect(fetchScoresWithBands).toHaveBeenCalledTimes(2);
  });

  it('is not fetched on foreground while signed out', async () => {
    mockAuth = { session: null, isPending: false };
    renderCharacter();
    await waitFor(() => expect(clearCachedCharacter).toHaveBeenCalled());

    await act(async () => appStateListener?.('background'));
    await act(async () => appStateListener?.('active'));

    expect(fetchScoresWithBands).not.toHaveBeenCalled();
  });
});
