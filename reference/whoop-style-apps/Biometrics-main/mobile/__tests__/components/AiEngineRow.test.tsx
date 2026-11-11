import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AiEngineRow } from '../../src/components/ai-engine-row';
import { CoachConsentRequiredError, setCoachEngine, type CoachStatusDTO } from '../../src/api/coach';

jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  setCoachEngine: jest.fn(),
}));

const hostedConsent = { version: 'h1', summary: 'Your question and a summary of your recent health numbers are sent to Anthropic.', dataItems: ['Recovery score'] };

function status(over: Partial<CoachStatusDTO> = {}, hosted: Partial<NonNullable<CoachStatusDTO['engines']>['hosted']> = {}): CoachStatusDTO {
  return {
    enabled: true,
    consented: true,
    consent: { version: 'v1', summary: 's', dataItems: [] },
    personaId: 'mochi',
    personaChosen: true,
    personas: [],
    engine: 'local',
    engines: { hosted: { available: true, consented: false, consent: hostedConsent, ...hosted } },
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
  (setCoachEngine as jest.Mock).mockImplementation(async (engine: string) => ({ engine }));
});

describe('AiEngineRow', () => {
  it('offers On-device and Claude, with the current one selected', () => {
    const { getByTestId } = setup(status());

    expect(getByTestId('ai-engine-local').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(getByTestId('ai-engine-hosted').props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    expect(getByTestId('ai-engine-local')).toHaveTextContent(/On-device/);
    expect(getByTestId('ai-engine-hosted')).toHaveTextContent(/Claude/);
  });

  it('is not shown when this server does not offer Claude', () => {
    const { queryByTestId } = setup(status({}, { available: false }));

    expect(queryByTestId('ai-engine')).toBeNull();
  });

  it('is not shown for a status without engine fields', () => {
    const { queryByTestId } = setup(status({ engines: undefined, engine: undefined }));

    expect(queryByTestId('ai-engine')).toBeNull();
  });

  it('opens the consent screen to switch to Claude before hosted consent is given', () => {
    const { getByTestId, onChooseHosted } = setup(status());

    fireEvent.press(getByTestId('ai-engine-hosted'));

    expect(onChooseHosted).toHaveBeenCalledTimes(1);
    expect(setCoachEngine).not.toHaveBeenCalled();
  });

  it('switches straight to Claude once hosted consent is held', async () => {
    const { getByTestId, onChange } = setup(status({}, { consented: true }));

    fireEvent.press(getByTestId('ai-engine-hosted'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ engine: 'hosted' })));
    expect(setCoachEngine).toHaveBeenCalledWith('hosted');
  });

  it('goes to consent when the server says the hosted consent is no longer current', async () => {
    (setCoachEngine as jest.Mock).mockRejectedValueOnce(new CoachConsentRequiredError());
    const { getByTestId, onChooseHosted, onChange } = setup(status({}, { consented: true }));

    fireEvent.press(getByTestId('ai-engine-hosted'));

    await waitFor(() => expect(onChooseHosted).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches back to On-device at once', async () => {
    const { getByTestId, onChange } = setup(status({ engine: 'hosted' }, { consented: true }));

    fireEvent.press(getByTestId('ai-engine-local'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ engine: 'local' })));
    expect(setCoachEngine).toHaveBeenCalledWith('local');
  });

  it('does nothing for the engine already selected', () => {
    const { getByTestId, onChange } = setup(status());

    fireEvent.press(getByTestId('ai-engine-local'));

    expect(setCoachEngine).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says so when the switch fails, and keeps the selection', async () => {
    (setCoachEngine as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const { getByTestId, findByTestId, onChange } = setup(status({ engine: 'hosted' }, { consented: true }));

    fireEvent.press(getByTestId('ai-engine-local'));

    expect(await findByTestId('ai-engine-error')).toHaveTextContent("Couldn't switch the AI engine. Please try again.");
    expect(onChange).not.toHaveBeenCalled();
  });
});
