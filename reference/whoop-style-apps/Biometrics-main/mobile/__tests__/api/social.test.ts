import { apiFetch } from '../../src/api/client';
import {
  fetchHighlights, fetchRecapShared, fetchSocialHome, fetchStory, markStickersSeen, markStorySeen, saveCheckIn, shareRecap, unshareRecap,
} from '../../src/api/social';

jest.mock('../../src/api/client');
const api = apiFetch as jest.Mock;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

beforeEach(() => api.mockReset());

it('reads the Social home, and only a bare 404 means an older server', async () => {
  api.mockResolvedValueOnce({ stories: [] });
  expect(await fetchSocialHome()).toEqual({ stories: [] });
  expect(api).toHaveBeenLastCalledWith('/me/social');
  api.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 404 }));
  expect(await fetchSocialHome()).toBeNull();
  api.mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 404, code: 'not_found' }));
  await expect(fetchSocialHome()).rejects.toThrow('gone');
  api.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403, code: 'not_buddies' }));
  await expect(fetchSocialHome()).rejects.toThrow('forbidden');
});

it('writes with JSON bodies and escapes ids in paths', async () => {
  api.mockResolvedValue({});
  await saveCheckIn('TIRED');
  expect(api).toHaveBeenLastCalledWith('/me/social/checkin', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ mood: 'TIRED' }) });
  await fetchStory('a/b');
  expect(api).toHaveBeenLastCalledWith('/me/social/stories/a%2Fb');
  await markStorySeen('a/1');
  expect(api).toHaveBeenLastCalledWith('/me/social/stories/a%2F1/seen', expect.objectContaining({ method: 'POST' }));
  await markStorySeen('a/1', '2026-10-07T15:00:00.000Z');
  expect(api).toHaveBeenLastCalledWith('/me/social/stories/a%2F1/seen', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ through: '2026-10-07T15:00:00.000Z' }) });
  await markStickersSeen();
  expect(api).toHaveBeenLastCalledWith('/me/social/stickers/seen', expect.objectContaining({ method: 'POST' }));
  await shareRecap('r1', 'A steadier week');
  expect(api).toHaveBeenLastCalledWith('/me/social/recap-shares', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ recapId: 'r1', line: 'A steadier week' }) });
  await unshareRecap('r/1');
  expect(api).toHaveBeenLastCalledWith('/me/social/recap-shares/r%2F1', expect.objectContaining({ method: 'DELETE' }));
});

it('reads whether a recap is shared; an older server answers null', async () => {
  api.mockResolvedValueOnce({ shared: true });
  expect(await fetchRecapShared('r/1')).toBe(true);
  expect(api).toHaveBeenLastCalledWith('/me/social/recap-shares/r%2F1');
  api.mockResolvedValueOnce({ shared: false });
  expect(await fetchRecapShared('r1')).toBe(false);
  api.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 404 }));
  expect(await fetchRecapShared('r1')).toBeNull();
  api.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
  await expect(fetchRecapShared('r1')).rejects.toThrow('boom');
});

it('unwraps the week highlights, which may be null', async () => {
  const highlights = { weekStart: '2026-09-28', weekEnd: '2026-10-04', items: [] };
  api.mockResolvedValueOnce({ highlights });
  expect(await fetchHighlights()).toEqual(highlights);
  expect(api).toHaveBeenLastCalledWith('/me/social/highlights');
  api.mockResolvedValueOnce({ highlights: null });
  expect(await fetchHighlights()).toBeNull();
});
