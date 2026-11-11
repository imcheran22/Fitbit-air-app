import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { HostedConsentScreen } from '../../src/screens/HostedConsentScreen';
import {
  HostedUnavailableError,
  StaleConsentVersionError,
  fetchCoachStatus,
  grantHostedConsent,
  setCoachEngine,
  type CoachStatusDTO,
} from '../../src/api/coach';

jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  fetchCoachStatus: jest.fn(),
  grantHostedConsent: jest.fn(),
  setCoachEngine: jest.fn(),
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: undefined }),
}));

const hostedConsent = {
  version: 'h1',
  summary: "Your question and a summary of your recent health numbers are sent to Anthropic to write the answer. Anthropic doesn't use it to train models. You can switch back any time.",
  dataItems: ['Your question and the recent conversation', 'A summary of your recent scores'],
};

const status: CoachStatusDTO = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: [] },
  personaId: 'mochi',
  personaChosen: true,
  personas: [],
  engine: 'local',
  engines: { hosted: { available: true, consented: false, consent: hostedConsent } },
};

beforeEach(() => {
  jest.clearAllMocks();
  (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
  (grantHostedConsent as jest.Mock).mockResolvedValue({ consented: true });
  (setCoachEngine as jest.Mock).mockResolvedValue({ engine: 'hosted' });
});

describe('HostedConsentScreen', () => {
  it("states what is sent to Anthropic in the server's own words", async () => {
    const { findByTestId, getByText } = render(<HostedConsentScreen />);

    expect(await findByTestId('hosted-consent-summary')).toHaveTextContent(hostedConsent.summary);
    expect(getByText('A summary of your recent scores')).toBeTruthy();
  });

  it('records the hosted consent, switches to Claude and goes back on "Use Claude"', async () => {
    const { findByTestId } = render(<HostedConsentScreen />);

    fireEvent.press(await findByTestId('hosted-consent-agree'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    expect(grantHostedConsent).toHaveBeenCalledWith('h1');
    expect(setCoachEngine).toHaveBeenCalledWith('hosted');
    expect((grantHostedConsent as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((setCoachEngine as jest.Mock).mock.invocationCallOrder[0]!);
  });

  it('only switches when hosted consent is already held', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, engines: { hosted: { available: true, consented: true, consent: hostedConsent } } });
    const { findByTestId } = render(<HostedConsentScreen />);

    fireEvent.press(await findByTestId('hosted-consent-agree'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    expect(grantHostedConsent).not.toHaveBeenCalled();
    expect(setCoachEngine).toHaveBeenCalledWith('hosted');
  });

  it('changes nothing on "Not now"', async () => {
    const { findByTestId } = render(<HostedConsentScreen />);

    fireEvent.press(await findByTestId('hosted-consent-decline'));

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(grantHostedConsent).not.toHaveBeenCalled();
    expect(setCoachEngine).not.toHaveBeenCalled();
  });

  it('shows the new text and asks again when the consent version changed', async () => {
    (grantHostedConsent as jest.Mock).mockRejectedValueOnce(new StaleConsentVersionError());
    const { findByTestId } = render(<HostedConsentScreen />);

    fireEvent.press(await findByTestId('hosted-consent-agree'));

    expect(await findByTestId('hosted-consent-updated-note')).toBeTruthy();
    expect(fetchCoachStatus).toHaveBeenCalledTimes(2);
    expect(setCoachEngine).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('says Claude is unavailable when the server does not offer it', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, engines: { hosted: { available: false, consented: false, consent: null } } });
    const { findByTestId, queryByTestId } = render(<HostedConsentScreen />);

    expect(await findByTestId('hosted-consent-unavailable')).toBeTruthy();
    expect(queryByTestId('hosted-consent-agree')).toBeNull();
  });

  it('says Claude is unavailable when the switch is refused as unavailable', async () => {
    (setCoachEngine as jest.Mock).mockRejectedValueOnce(new HostedUnavailableError());
    const { findByTestId } = render(<HostedConsentScreen />);

    fireEvent.press(await findByTestId('hosted-consent-agree'));

    expect(await findByTestId('hosted-consent-unavailable')).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('shows an error and stays when saving fails', async () => {
    (grantHostedConsent as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const { findByTestId } = render(<HostedConsentScreen />);

    fireEvent.press(await findByTestId('hosted-consent-agree'));

    expect(await findByTestId('hosted-consent-error')).toHaveTextContent('We could not save your choice. Please try again.');
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});

describe('HostedConsentScreen: accessibility', () => {
  it('marks its title and the list of what is sent as headings', async () => {
    const { findByRole, getByRole } = render(<HostedConsentScreen />);

    expect(await findByRole('header', { name: 'Answer with Claude' })).toBeTruthy();
    expect(getByRole('header', { name: 'What is sent when you ask something' })).toBeTruthy();
  });
});
