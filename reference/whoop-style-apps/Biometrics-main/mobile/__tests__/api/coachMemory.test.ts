import * as SecureStore from 'expo-secure-store';
import { setBaseUrl } from '../../src/api/client';
import {
  CoachConsentRequiredError,
  CoachDisabledError,
  CoachMemoryNotFoundError,
  CoachMemoryValidationError,
  deleteCoachMemory,
  fetchLatestDigest,
  listCoachMemory,
  sendCoachMessage,
  updateCoachMemory,
} from '../../src/api/coach';

jest.mock('expo-secure-store');

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

const entry = { id: 'm1', category: 'SCHEDULE', value: 'Trains at 6am', status: 'PENDING', createdAt: '2026-09-20T08:00:00.000Z' };

function ok(body: unknown, statusCode = 200) {
  return { ok: true, status: statusCode, json: async () => body };
}
function fail(statusCode: number) {
  return { ok: false, status: statusCode, json: async () => ({}) };
}

beforeEach(() => {
  setBaseUrl('https://api.example.com');
  fetchMock.mockReset();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('token');
});

describe('listCoachMemory', () => {
  it('GETs the entries', async () => {
    fetchMock.mockResolvedValueOnce(ok({ entries: [entry] }));
    await expect(listCoachMemory()).resolves.toEqual([entry]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/me/coach/memory');
  });

  it('treats a missing entries field as empty', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    await expect(listCoachMemory()).resolves.toEqual([]);
  });

  it('maps 403 to consent-required and 404 to disabled', async () => {
    fetchMock.mockResolvedValueOnce(fail(403));
    await expect(listCoachMemory()).rejects.toBeInstanceOf(CoachConsentRequiredError);
    fetchMock.mockResolvedValueOnce(fail(404));
    await expect(listCoachMemory()).rejects.toBeInstanceOf(CoachDisabledError);
  });
});

describe('updateCoachMemory', () => {
  it('PATCHes the value and returns the entry', async () => {
    fetchMock.mockResolvedValueOnce(ok({ entry: { ...entry, value: 'Trains at 7am' } }));
    await expect(updateCoachMemory('m1', 'Trains at 7am')).resolves.toEqual({ ...entry, value: 'Trains at 7am' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/me/coach/memory/m1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ value: 'Trains at 7am' });
  });

  it('maps 400 to CoachMemoryValidationError and 404 to CoachMemoryNotFoundError', async () => {
    fetchMock.mockResolvedValueOnce(fail(400));
    await expect(updateCoachMemory('m1', 'x')).rejects.toBeInstanceOf(CoachMemoryValidationError);
    fetchMock.mockResolvedValueOnce(fail(404));
    await expect(updateCoachMemory('m1', 'x')).rejects.toBeInstanceOf(CoachMemoryNotFoundError);
  });
});

describe('deleteCoachMemory', () => {
  it('DELETEs and tolerates the 204', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: jest.fn() });
    await expect(deleteCoachMemory('m1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/me/coach/memory/m1');
    expect(init.method).toBe('DELETE');
  });

  it('maps 404 to CoachMemoryNotFoundError', async () => {
    fetchMock.mockResolvedValueOnce(fail(404));
    await expect(deleteCoachMemory('gone')).rejects.toBeInstanceOf(CoachMemoryNotFoundError);
  });
});

describe('fetchLatestDigest', () => {
  it('returns the digest', async () => {
    const digest = { id: 'd1', text: 'A good week.', createdAt: '2026-09-20T08:00:00.000Z' };
    fetchMock.mockResolvedValueOnce(ok({ digest }));
    await expect(fetchLatestDigest()).resolves.toEqual(digest);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/me/coach/digests/latest');
  });

  it('returns null when there is no digest or the body is malformed', async () => {
    fetchMock.mockResolvedValueOnce(ok({ digest: null }));
    await expect(fetchLatestDigest()).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(ok(undefined));
    await expect(fetchLatestDigest()).resolves.toBeNull();
  });
});

describe('sendCoachMessage memoryProposals', () => {
  it('passes memoryProposals through untouched', async () => {
    const reply = {
      conversationId: 'c1',
      message: { id: 'a1', role: 'assistant', text: 'ok', source: 'model', createdAt: 'x' },
      memoryProposals: [entry],
    };
    fetchMock.mockResolvedValueOnce(ok(reply));
    await expect(sendCoachMessage({ message: 'hi' })).resolves.toEqual(reply);
  });
});
