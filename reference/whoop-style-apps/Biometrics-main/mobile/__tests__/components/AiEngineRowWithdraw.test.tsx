import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AiEngineRow } from '../../src/components/ai-engine-row';
import { HostedUnavailableError, fetchCoachStatus, revokeHostedConsent, setCoachEngine, type CoachStatusDTO } from '../../src/api/coach';

// Carried privacy requirement: a user who said yes to Claude can always take it back.
jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  setCoachEngine: jest.fn(),
  revokeHostedConsent: jest.fn(),
  fetchCoachStatus: jest.fn(),
}));

const hostedConsent = { version: 'hosted-1', summary: 'Anything you type is sent to Anthropic.', dataItems: ['Your messages'] };

function status(over: Partial<CoachStatusDTO> = {}, hosted: Partial<NonNullable<CoachStatusDTO['engines']>['hosted']> = {}): CoachStatusDTO {
  return {
    enabled: true,
    consented: true,
    consent: { version: 'v1', summary: 's', dataItems: [] },
    personaId: 'mochi',
    personaChosen: true,
    personas: [],
    engine: 'hosted',
    engines: { hosted: { available: true, consented: true, consent: hostedConsent, ...hosted } },
    ...over,
  };
}

function setup(s: CoachStatusDTO) {
  const onChange = jest.fn();
  const onChooseHosted = jest.fn();
  return { ...render(<AiEngineRow status={s} onChange={onChange} onChooseHosted={onChooseHosted} />), onChange, onChooseHosted };
}

beforeEach(() => {
  jest.clearAllMocks();
  (revokeHostedConsent as jest.Mock).mockResolvedValue(undefined);
  (setCoachEngine as jest.Mock).mockImplementation(async (engine: string) => ({ engine }));
});

describe('AiEngineRow: withdrawing the hosted consent', () => {
  it('offers to withdraw only while the hosted consent is held', () => {
    expect(setup(status()).getByTestId('ai-engine-withdraw')).toBeTruthy();
  });

  it('offers no withdraw control without a hosted consent', () => {
    expect(setup(status({ engine: 'local' }, { consented: false })).queryByTestId('ai-engine-withdraw')).toBeNull();
  });

  it('withdraws, then keeps the status the server reports (engine back to on-device)', async () => {
    const fresh = status({ engine: 'local' }, { consented: false });
    (fetchCoachStatus as jest.Mock).mockResolvedValue(fresh);
    const { getByTestId, onChange } = setup(status());

    fireEvent.press(getByTestId('ai-engine-withdraw'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(fresh));
    expect(revokeHostedConsent).toHaveBeenCalledTimes(1);
    expect(setCoachEngine).not.toHaveBeenCalled();
  });

  it('still shows on-device and no hosted consent when the status refresh fails after withdrawing', async () => {
    (fetchCoachStatus as jest.Mock).mockRejectedValue(new Error('offline'));
    const { getByTestId, onChange } = setup(status());

    fireEvent.press(getByTestId('ai-engine-withdraw'));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const next = onChange.mock.calls[0][0] as CoachStatusDTO;
    expect(next.engine).toBe('local');
    expect(next.engines?.hosted.consented).toBe(false);
  });

  it('says so when withdrawing fails, and changes nothing', async () => {
    (revokeHostedConsent as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const { getByTestId, findByTestId, onChange } = setup(status());

    fireEvent.press(getByTestId('ai-engine-withdraw'));

    expect(await findByTestId('ai-engine-withdraw-error')).toHaveTextContent(/couldn't withdraw/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('still lets the user withdraw when the server no longer offers Claude', () => {
    const { getByTestId, queryByTestId } = setup(status({ engine: 'local' }, { available: false }));

    expect(getByTestId('ai-engine-withdraw')).toBeTruthy();
    expect(queryByTestId('ai-engine-hosted')).toBeNull();
  });
});

describe('AiEngineRow: Claude withdrawn by the server', () => {
  it('disables Claude with a short explanation when the switch is refused as unavailable', async () => {
    (setCoachEngine as jest.Mock).mockRejectedValueOnce(new HostedUnavailableError());
    const { getByTestId, findByTestId, onChange, onChooseHosted } = setup(status({ engine: 'local' }));

    fireEvent.press(getByTestId('ai-engine-hosted'));

    expect(await findByTestId('ai-engine-unavailable')).toHaveTextContent(/isn't available/);
    expect(getByTestId('ai-engine-hosted').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onChooseHosted).not.toHaveBeenCalled();
  });

  it('shows the effective engine from the server, not the last choice', () => {
    // Hosted consent held, but the server reports the effective engine as on-device.
    const { getByTestId } = setup(status({ engine: 'local' }));

    expect(getByTestId('ai-engine-local').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(getByTestId('ai-engine-hosted').props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });
});
