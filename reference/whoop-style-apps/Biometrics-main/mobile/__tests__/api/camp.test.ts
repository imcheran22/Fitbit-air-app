import { apiFetch } from '../../src/api/client';
import { clearCampNote, fetchCamp, saveCampNote, sayGoodnight, undoGoodnight } from '../../src/api/social';

jest.mock('../../src/api/client');
const api = apiFetch as jest.Mock;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

beforeEach(() => api.mockReset());

it('reads the camp; only a bare 404 means a server without the Campfire', async () => {
  api.mockResolvedValueOnce({ night: true, members: [] });
  expect(await fetchCamp()).toEqual({ night: true, members: [] });
  expect(api).toHaveBeenLastCalledWith('/me/camp');
  api.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 404 }));
  expect(await fetchCamp()).toBeNull();
  api.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403, code: 'not_buddies' }));
  await expect(fetchCamp()).rejects.toThrow('forbidden');
});

it('throws a 404 that carries an error code; only a bare 404 is an older server', async () => {
  api.mockRejectedValueOnce(Object.assign(new Error('coded'), { status: 404, code: 'not_buddies' }));
  await expect(fetchCamp()).rejects.toThrow('coded');
  api.mockRejectedValueOnce(Object.assign(new Error('bare'), { status: 404 }));
  expect(await fetchCamp()).toBeNull();
});

it('says and undoes goodnight, and shares and clears a note', async () => {
  api.mockResolvedValue({});
  await sayGoodnight();
  expect(api).toHaveBeenLastCalledWith('/me/camp/goodnight', { method: 'POST', headers: JSON_HEADERS });
  await undoGoodnight();
  expect(api).toHaveBeenLastCalledWith('/me/camp/goodnight', { method: 'DELETE', headers: JSON_HEADERS });
  await saveCampNote('night all');
  expect(api).toHaveBeenLastCalledWith('/me/camp/note', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ text: 'night all' }) });
  await clearCampNote();
  expect(api).toHaveBeenLastCalledWith('/me/camp/note', { method: 'DELETE', headers: JSON_HEADERS });
});
