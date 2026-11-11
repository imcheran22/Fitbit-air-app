import React from 'react';
import { characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CoachDigestCard } from '../../src/components/coach-digest-card';
import { CoachConsentRequiredError, CoachDisabledError, fetchLatestDigest } from '../../src/api/coach';
import { fetchRecaps } from '../../src/api/recaps';

jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  fetchLatestDigest: jest.fn(),
}));
jest.mock('../../src/api/recaps');

const digest = {
  id: 'd1',
  text: 'Your recovery held steady this week. Late nights on Tuesday and Thursday were the main drag.',
  createdAt: '2026-09-20T12:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  (fetchLatestDigest as jest.Mock).mockResolvedValue(digest);
  (fetchRecaps as jest.Mock).mockResolvedValue([]);
});

describe('CoachDigestCard', () => {
  it('shows a loading placeholder first', async () => {
    const { getByTestId, findByTestId } = render(<CoachDigestCard />);
    expect(getByTestId('coach-digest-loading')).toBeTruthy();
    await findByTestId('coach-digest-card');
  });

  it('shows the latest digest text with its date', async () => {
    const { findByTestId, getByTestId } = render(<CoachDigestCard />);

    expect(await findByTestId('coach-digest-preview')).toHaveTextContent(/Your recovery held steady/);
    expect(getByTestId('coach-digest-date')).toHaveTextContent(/Sep 20/);
  });

  it('opens the full text when tapped, and closes again', async () => {
    const { findByTestId, getByTestId, queryByTestId } = render(<CoachDigestCard />);

    expect(queryByTestId('coach-digest-full')).toBeNull();
    fireEvent.press(await findByTestId('coach-digest-card'));

    expect(getByTestId('coach-digest-full')).toHaveTextContent(digest.text);
    // The server no longer appends the disclaimer to the recap; it is shown once, under it.
    expect(getByTestId('coach-digest-footnote')).toHaveTextContent('Comparisons against your own readings, not medical advice.');
    fireEvent.press(getByTestId('coach-digest-close'));
    await waitFor(() => expect(queryByTestId('coach-digest-full')).toBeNull());
  });

  it('renders nothing when there is no digest', async () => {
    (fetchLatestDigest as jest.Mock).mockResolvedValue(null);
    const { queryByTestId, toJSON } = render(<CoachDigestCard />);

    await waitFor(() => expect(queryByTestId('coach-digest-loading')).toBeNull());
    expect(toJSON()).toBeNull();
  });

  it('shows a quiet error state when loading fails', async () => {
    (fetchLatestDigest as jest.Mock).mockRejectedValue(new Error('offline'));
    const { findByTestId, queryByTestId } = render(<CoachDigestCard />);

    expect(await findByTestId('coach-digest-error')).toBeTruthy();
    expect(queryByTestId('coach-digest-card')).toBeNull();
  });

  it('renders nothing when the server says the coach is disabled or unconsented', async () => {
    (fetchLatestDigest as jest.Mock).mockRejectedValueOnce(new CoachDisabledError());
    const first = render(<CoachDigestCard />);
    await waitFor(() => expect(first.queryByTestId('coach-digest-loading')).toBeNull());
    expect(first.toJSON()).toBeNull();
    first.unmount();

    (fetchLatestDigest as jest.Mock).mockRejectedValueOnce(new CoachConsentRequiredError());
    const second = render(<CoachDigestCard />);
    await waitFor(() => expect(second.queryByTestId('coach-digest-loading')).toBeNull());
    expect(second.toJSON()).toBeNull();
  });

  it("opens the week's recap instead of the sheet when the digest is that recap's story", async () => {
    (fetchRecaps as jest.Mock).mockResolvedValue([{ id: 'd1', kind: 'WEEK' }]);
    const onOpenRecap = jest.fn();
    const { findByTestId, queryByTestId } = render(withCharacter(<CoachDigestCard onOpenRecap={onOpenRecap} />));
    await waitFor(() => expect(fetchRecaps).toHaveBeenCalledWith({ kind: 'WEEK', limit: 1 }));
    fireEvent.press(await findByTestId('coach-digest-card'));
    await waitFor(() => expect(onOpenRecap).toHaveBeenCalledWith('d1'));
    expect(queryByTestId('coach-digest-full')).toBeNull();
  });
});

describe('CoachDigestCard character', () => {
  it("shows the user's character on the recap, idle", async () => {
    const utils = render(withCharacter(<CoachDigestCard />, { characterId: 'jelly' }));
    await utils.findByTestId('coach-digest-card');

    expect(characterLabel(utils, 'coach-digest-character')).toBe('character:jelly:idle:18:playing:none');
  });

  it('rests on a poor recovery day', async () => {
    const utils = render(withCharacter(<CoachDigestCard />, { characterId: 'jelly', recoveryBand: 'scorePoor' }));
    await utils.findByTestId('coach-digest-card');

    expect(characterLabel(utils, 'coach-digest-character')).toBe('character:jelly:resting:18:playing:none');
  });
});
