import * as SecureStore from 'expo-secure-store';
import { ApiError, setBaseUrl } from '../../src/api/client';
import {
  CoachConsentRequiredError,
  HostedUnavailableError,
  StaleConsentVersionError,
  StaleConversationError,
  TooManyMessagesError,
  TurnInProgressError,
  fetchCoachStatus,
  fetchConversation,
  fetchTodaySummary,
  grantHostedConsent,
  revokeHostedConsent,
  listConversations,
  mapCoachError,
  sendCoachMessage,
  setCoachEngine,
  toAnswerCard,
  toTodaySummary,
} from '../../src/api/coach';

jest.mock('expo-secure-store');

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

function ok(body: unknown, statusCode = 200) {
  return { ok: true, status: statusCode, json: async () => body };
}
function fail(statusCode: number, body: unknown = {}) {
  return { ok: false, status: statusCode, json: async () => body };
}

const consent = { version: 'h1', summary: 'Your question and a summary are sent to Anthropic.', dataItems: ['Recovery score'] };
const baseStatus = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'luna',
  personaChosen: true,
  personas: [],
};

beforeEach(() => {
  setBaseUrl('https://api.example.com');
  fetchMock.mockReset();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('token');
});

describe('fetchCoachStatus: engines', () => {
  it('reads the engine and the hosted engine offer', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ...baseStatus, engine: 'hosted', engines: { hosted: { available: true, consented: true, consent } } }));
    const status = await fetchCoachStatus();
    expect(status.engine).toBe('hosted');
    expect(status.engines).toEqual({ hosted: { available: true, consented: true, consent } });
  });

  it('reads a server without engine fields as on-device only', async () => {
    fetchMock.mockResolvedValueOnce(ok(baseStatus));
    const status = await fetchCoachStatus();
    expect(status.engine).toBe('local');
    expect(status.engines).toEqual({ hosted: { available: false, consented: false, consent: null } });
  });

  it('reads an unknown engine value as local and a malformed consent as none', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ...baseStatus, engine: 'gpu', engines: { hosted: { available: 'yes', consented: true, consent: 'x' } } }));
    const status = await fetchCoachStatus();
    expect(status.engine).toBe('local');
    expect(status.engines).toEqual({ hosted: { available: false, consented: true, consent: null } });
  });
});

describe('setCoachEngine', () => {
  it('PUTs the engine', async () => {
    fetchMock.mockResolvedValueOnce(ok({ engine: 'hosted' }));
    await expect(setCoachEngine('hosted')).resolves.toEqual({ engine: 'hosted' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/me/coach/engine');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ engine: 'hosted' });
  });

  it('maps 403 to CoachConsentRequiredError and a hosted_unavailable 404 to HostedUnavailableError', async () => {
    fetchMock.mockResolvedValueOnce(fail(403, { error: 'consent_required' }));
    await expect(setCoachEngine('hosted')).rejects.toBeInstanceOf(CoachConsentRequiredError);
    fetchMock.mockResolvedValueOnce(fail(404, { error: 'hosted_unavailable' }));
    await expect(setCoachEngine('hosted')).rejects.toBeInstanceOf(HostedUnavailableError);
  });
});

describe('grantHostedConsent', () => {
  it('POSTs the version with the hosted scope', async () => {
    fetchMock.mockResolvedValueOnce(ok({ consented: true }));
    await grantHostedConsent('h1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/me/coach/consent');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ version: 'h1', scope: 'hosted' });
  });

  it('maps a 409 to StaleConsentVersionError', async () => {
    fetchMock.mockResolvedValueOnce(fail(409, { error: 'stale_consent_version' }));
    await expect(grantHostedConsent('h0')).rejects.toBeInstanceOf(StaleConsentVersionError);
  });

  it('maps a hosted_unavailable 404 to HostedUnavailableError', async () => {
    fetchMock.mockResolvedValueOnce(fail(404, { error: 'hosted_unavailable' }));
    await expect(grantHostedConsent('h1')).rejects.toBeInstanceOf(HostedUnavailableError);
  });
});

describe('mapCoachError', () => {
  it('maps a 409 turn_in_progress to TurnInProgressError, not a stale consent', () => {
    expect(mapCoachError(new ApiError(409, 'Conflict', 'turn_in_progress'))).toBeInstanceOf(TurnInProgressError);
    expect(mapCoachError(new ApiError(409, 'Conflict', 'stale_consent_version'))).toBeInstanceOf(StaleConsentVersionError);
  });

  it('maps a 429 too_many_messages to TooManyMessagesError with the retry delay from the body', () => {
    const mapped = mapCoachError(new ApiError(429, 'Too many', 'too_many_messages', { error: 'too_many_messages', retryAfterSeconds: 30 }));
    expect(mapped).toBeInstanceOf(TooManyMessagesError);
    expect((mapped as TooManyMessagesError).retryAfterSeconds).toBe(30);
    expect((mapCoachError(new ApiError(429, 'Too many', 'too_many_messages', { retryAfterSeconds: 'soon' })) as TooManyMessagesError).retryAfterSeconds).toBeUndefined();
  });

  it('gives the JSON send path the same TooManyMessagesError', async () => {
    fetchMock.mockResolvedValueOnce(fail(429, { error: 'too_many_messages', retryAfterSeconds: 12 }));
    const error = await sendCoachMessage({ message: 'Hi' }).catch((e) => e);
    expect(error).toBeInstanceOf(TooManyMessagesError);
    expect(error.retryAfterSeconds).toBe(12);
  });
});

describe('conversations', () => {
  it('lists past conversations, newest first as the server sends them, dropping malformed rows', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        conversations: [
          { id: 'c2', title: 'How did I sleep?', lastMessageAt: '2026-09-30T08:00:00.000Z', messageCount: 4 },
          { id: 7, title: 'bad' },
          { id: 'c1', title: '', lastMessageAt: '2026-09-28T08:00:00.000Z' },
        ],
      }),
    );
    await expect(listConversations()).resolves.toEqual([
      { id: 'c2', title: 'How did I sleep?', lastMessageAt: '2026-09-30T08:00:00.000Z', messageCount: 4 },
      { id: 'c1', title: 'Conversation', lastMessageAt: '2026-09-28T08:00:00.000Z' },
    ]);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/me/coach/conversations');
  });

  it('asks for the page before a cursor', async () => {
    fetchMock.mockResolvedValueOnce(ok({ conversations: [] }));
    await listConversations('2026-09-28T08:00:00.000Z');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/me/coach/conversations?before=2026-09-28T08%3A00%3A00.000Z');
  });

  it('reads a missing list as empty', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    await expect(listConversations()).resolves.toEqual([]);
  });

  it('fetches one conversation by id', async () => {
    fetchMock.mockResolvedValueOnce(ok({ conversationId: 'c 1', messages: [{ id: 'a', role: 'user', text: 'Hi', createdAt: 'x' }] }));
    await expect(fetchConversation('c 1')).resolves.toEqual({ conversationId: 'c 1', messages: [{ id: 'a', role: 'user', text: 'Hi', createdAt: 'x' }] });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/me/coach/conversations/c%201');
  });

  it('maps a deleted conversation to StaleConversationError', async () => {
    fetchMock.mockResolvedValueOnce(fail(404, { error: 'conversation_not_found' }));
    await expect(fetchConversation('gone')).rejects.toBeInstanceOf(StaleConversationError);
  });
});

describe('toAnswerCard', () => {
  const tile = { factId: 'sleep.total', label: 'total', display: '6h 48m', value: 408, usual: 433, status: 'below' };

  it('keeps a well-formed tiles card', () => {
    const card = { headline: 'Decent night', tiles: [tile], tip: 'Try a cooler room.', source: 'Last night and your past 7 nights' };
    expect(toAnswerCard(card)).toEqual(card);
  });

  it('keeps a ranked card and drops malformed rows and an unknown status', () => {
    const card = toAnswerCard({
      headline: 'What moves your recovery',
      ranked: [{ factId: 'habit.caffeine_late', label: 'Caffeine after 2pm', display: '−8 pts', value: -8, status: 'weird' }, { label: 'no id' }],
      source: 'Your last 30 days',
    });
    expect(card).toEqual({
      headline: 'What moves your recovery',
      ranked: [{ factId: 'habit.caffeine_late', label: 'Caffeine after 2pm', display: '−8 pts', value: -8 }],
      source: 'Your last 30 days',
    });
  });

  it('rejects a card without a headline or without any rows', () => {
    expect(toAnswerCard({ tiles: [tile], source: 's' })).toBeNull();
    expect(toAnswerCard({ headline: 'h', tiles: [], source: 's' })).toBeNull();
    expect(toAnswerCard(null)).toBeNull();
    expect(toAnswerCard('card')).toBeNull();
  });

  // R41: the signed difference from usual, kept when well-formed; cards stored before it parse as before.
  it('keeps a tile difference from usual and drops a malformed one', () => {
    const withDelta = toAnswerCard({ headline: 'h', tiles: [{ ...tile, deltaDisplay: '−25m' }], source: 's' });
    expect(withDelta?.tiles?.[0]?.deltaDisplay).toBe('−25m');
    for (const deltaDisplay of [42, '', '   ', 'x'.repeat(40), null]) {
      const card = toAnswerCard({ headline: 'h', tiles: [{ ...tile, deltaDisplay }], source: 's' });
      expect(card?.tiles?.[0]).toEqual(tile);
    }
  });
});

describe('today summary', () => {
  const summary = {
    date: '2026-09-30',
    hasData: true,
    sentence: {
      text: "Recovery's 26, about half your usual.",
      spans: [{ text: "Recovery's " }, { text: '26', metric: 'recovery' }, { text: ', about half your usual.' }],
      source: 'ai',
    },
    bars: [
      { metric: 'recovery', label: 'Recovery', value: 26, usual: 58, unit: 'score', display: '26', usualDisplay: '58', status: 'below', scaleMax: 100 },
      { metric: 'sleep', label: 'Sleep', value: 408, usual: 433, unit: 'minutes', display: '6h 48m', usualDisplay: '7h 13m', status: 'near', scaleMax: 606 },
    ],
  };

  it('fetches and keeps a well-formed summary', async () => {
    fetchMock.mockResolvedValueOnce(ok(summary));
    await expect(fetchTodaySummary()).resolves.toEqual(summary);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/me/coach/today');
  });

  it('drops bars with an unknown metric or no number, and a span metric it does not know', () => {
    const result = toTodaySummary({
      ...summary,
      sentence: { ...summary.sentence, spans: [{ text: 'Hi', metric: 'steps' }] },
      bars: [...summary.bars, { metric: 'steps', label: 'Steps', value: 1 }, { metric: 'hrv', label: 'HRV', value: 'x' }],
    });
    expect(result.bars.map((b) => b.metric)).toEqual(['recovery', 'sleep']);
    expect(result.sentence?.spans).toEqual([{ text: 'Hi' }]);
  });

  it('fills a missing or non-positive scale from 1.4 × the larger of value and usual', () => {
    const result = toTodaySummary({
      ...summary,
      bars: [{ metric: 'hrv', label: 'HRV', value: 41, usual: 52, unit: 'ms', display: '41', usualDisplay: '52', status: 'below', scaleMax: 0 }],
    });
    expect(result.bars[0]!.scaleMax).toBeCloseTo(72.8);
  });

  it('reads a malformed body as no data', () => {
    expect(toTodaySummary(undefined)).toEqual({ date: '', hasData: false, sentence: null, bars: [] });
  });
});

describe('revokeHostedConsent', () => {
  it('DELETEs the hosted scope only and tolerates the 204', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: jest.fn() });
    await expect(revokeHostedConsent()).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/me/coach/consent?scope=hosted');
    expect(init.method).toBe('DELETE');
  });
});
