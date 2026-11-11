import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { FactorBar, factorBarScale, factorBarGeometry } from '../../src/components/ui/factor-bar';
import type { FactorDTO } from '../../src/api/scores';

function factor(overrides: Partial<FactorDTO> & Pick<FactorDTO, 'factor'>): FactorDTO {
  const labels: Record<FactorDTO['factor'], string> = {
    HRV: 'HRV',
    RHR: 'Resting HR',
    SLEEP_DEBT: 'Sleep debt',
    SLEEP_DURATION: 'Sleep duration',
    SLEEP_EFFICIENCY: 'Sleep efficiency',
    CIRCADIAN_CONSISTENCY: 'Bedtime consistency',
  };
  return {
    label: labels[overrides.factor],
    z: 0,
    weight: 0.3,
    contribution: 0,
    points: 0,
    imputed: false,
    excluded: false,
    ...overrides,
  };
}

function fillWidth(node: { props: { style?: unknown } }): string {
  return String(StyleSheet.flatten(node.props.style as never).width);
}

describe('factorBarScale', () => {
  it('is the largest |points| across the factors, so every bar shares one scale', () => {
    expect(
      factorBarScale([factor({ factor: 'HRV', points: 8 }), factor({ factor: 'RHR', points: -12 }), factor({ factor: 'SLEEP_DEBT', points: 2 })]),
    ).toBe(12);
  });

  it('ignores excluded factors', () => {
    expect(factorBarScale([factor({ factor: 'HRV', points: 50, excluded: true }), factor({ factor: 'RHR', points: -3 })])).toBe(3);
  });

  it('falls back to 1 when there is nothing to scale against', () => {
    expect(factorBarScale([])).toBe(1);
    expect(factorBarScale([factor({ factor: 'HRV', points: 0 })])).toBe(1);
  });
});

describe('factorBarGeometry', () => {
  it('extends right for positive points and left for negative', () => {
    expect(factorBarGeometry(4, 8)).toEqual({ side: 'right', fraction: 0.5 });
    expect(factorBarGeometry(-4, 8)).toEqual({ side: 'left', fraction: 0.5 });
  });

  it('has no bar at zero and never exceeds the full half-width', () => {
    expect(factorBarGeometry(0, 8)).toEqual({ side: 'none', fraction: 0 });
    expect(factorBarGeometry(20, 8).fraction).toBe(1);
  });
});

describe('FactorBar', () => {
  it('renders the label as given and the signed points', () => {
    const { getByText } = render(<FactorBar factor={factor({ factor: 'HRV', points: 8.2 })} scale={10} />);

    expect(getByText('HRV')).toBeTruthy();
    expect(getByText('+8.2 pts')).toBeTruthy();
  });

  it('draws a positive bar on the right of the centre and a negative bar on the left', () => {
    const { getByTestId, queryByTestId } = render(
      <>
        <FactorBar factor={factor({ factor: 'HRV', points: 5 })} scale={10} />
        <FactorBar factor={factor({ factor: 'RHR', points: -5 })} scale={10} />
      </>,
    );

    expect(getByTestId('factor-bar-pos-HRV')).toBeTruthy();
    expect(queryByTestId('factor-bar-neg-HRV')).toBeNull();
    expect(getByTestId('factor-bar-neg-RHR')).toBeTruthy();
    expect(queryByTestId('factor-bar-pos-RHR')).toBeNull();
  });

  it('sizes bars against one shared scale, so equal points look equal and bigger looks bigger', () => {
    const { getByTestId } = render(
      <>
        <FactorBar factor={factor({ factor: 'HRV', points: 5 })} scale={10} />
        <FactorBar factor={factor({ factor: 'RHR', points: -5 })} scale={10} />
        <FactorBar factor={factor({ factor: 'SLEEP_DEBT', points: -10 })} scale={10} />
      </>,
    );

    expect(fillWidth(getByTestId('factor-bar-pos-HRV'))).toBe('50%');
    expect(fillWidth(getByTestId('factor-bar-neg-RHR'))).toBe('50%');
    expect(fillWidth(getByTestId('factor-bar-neg-SLEEP_DEBT'))).toBe('100%');
  });

  it('uses points, not the raw contribution, for the bar length', () => {
    const { getByTestId } = render(
      <FactorBar factor={factor({ factor: 'HRV', points: 2, contribution: 9 })} scale={4} />,
    );

    expect(fillWidth(getByTestId('factor-bar-pos-HRV'))).toBe('50%');
  });

  it('renders the RESTING_HR factor with the server label "Resting HR", never a daily minimum', () => {
    const { getByText, queryByText, getByTestId } = render(
      <FactorBar factor={factor({ factor: 'RHR', label: 'Resting HR', points: -3.1 })} scale={10} />,
    );

    expect(getByText('Resting HR')).toBeTruthy();
    expect(queryByText(/daily minimum/i)).toBeNull();
    expect(queryByText(/minimum/i)).toBeNull();
    expect(getByTestId('factor-bar-RHR').props.accessibilityLabel).toMatch(/resting hr/i);
    expect(getByTestId('factor-bar-RHR').props.accessibilityLabel).not.toMatch(/minimum/i);
  });

  it('shows an excluded factor as still building, with no bar and no fake points', () => {
    const { getByText, queryByTestId, queryByText } = render(
      <FactorBar factor={factor({ factor: 'SLEEP_DEBT', points: 5, excluded: true })} scale={10} />,
    );

    expect(getByText('Sleep debt')).toBeTruthy();
    expect(getByText(/building baseline/i)).toBeTruthy();
    expect(queryByTestId('factor-bar-pos-SLEEP_DEBT')).toBeNull();
    expect(queryByText(/pts/)).toBeNull();
  });

  it('marks an imputed factor as estimated', () => {
    const { getByText } = render(<FactorBar factor={factor({ factor: 'HRV', points: 2, imputed: true })} scale={10} />);

    expect(getByText(/estimated/i)).toBeTruthy();
  });

  it('matches its snapshot', () => {
    const { toJSON } = render(<FactorBar factor={factor({ factor: 'HRV', points: -4.5 })} scale={9} />);

    expect(toJSON()).toMatchSnapshot();
  });

  it('renders a Sleep Score factor with the server label and a Building baseline state', () => {
    const { getByText, getByTestId } = render(
      <FactorBar factor={factor({ factor: 'CIRCADIAN_CONSISTENCY', excluded: true, z: null })} scale={9} />,
    );

    expect(getByText('Bedtime consistency')).toBeTruthy();
    expect(getByText('Building baseline')).toBeTruthy();
    expect(getByTestId('factor-bar-CIRCADIAN_CONSISTENCY')).toBeTruthy();
  });

  it('matches its snapshot: sleep duration below goal', () => {
    const { toJSON } = render(<FactorBar factor={factor({ factor: 'SLEEP_DURATION', points: -6.4 })} scale={9} />);

    expect(toJSON()).toMatchSnapshot();
  });
});
