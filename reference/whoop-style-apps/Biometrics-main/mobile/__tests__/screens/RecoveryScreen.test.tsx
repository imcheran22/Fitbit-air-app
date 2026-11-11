import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { RecoveryScreen } from '../../src/screens/RecoveryScreen';
import { fetchRecoveryMonth, fetchRecoveryPage, type RecoveryCalendarDTO, type RecoveryPageDTO } from '../../src/api/recovery';
import type { CoachStatusDTO } from '../../src/api/coach';
import { debtBlocks, RECOVERY_COPY } from '../../src/lib/recoveryCopy';
import { FORECAST_COPY } from '../../src/lib/forecastCopy';
import { COLORS } from '../../src/theme';
import { makePage } from '../../jest-mocks/recoveryPageFixture';

jest.mock('../../src/api/recovery');
jest.mock('../../src/api/coach');
jest.mock('../../src/sync/SyncProvider', () => ({ useSync: () => ({ dataVersion: 0 }) }));

const mockNavigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  replace: jest.fn(),
  addListener: () => () => {},
};
let mockParams: { date?: string } | undefined;
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockParams }),
  useNavigation: () => mockNavigation,
  useFocusEffect: () => {},
}));

const STATUS: CoachStatusDTO = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'mochi',
  personaChosen: true,
  personas: [],
};

const pageFetch = fetchRecoveryPage as jest.Mock;
// Debt blocks and streak squares are hidden from screen readers; the text beside them carries the meaning.
const HIDDEN_OK = { includeHiddenElements: true } as const;

function renderScreen(status: CoachStatusDTO | null = STATUS) {
  return render(withCharacter(<RecoveryScreen />, { characterId: 'mochi', status }));
}

function pending<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = undefined;
  pageFetch.mockResolvedValue(makePage());
});

describe('RecoveryScreen: states', () => {
  it('shows the loading skeleton under the header before the first page', () => {
    pageFetch.mockReturnValue(pending<RecoveryPageDTO>().promise);
    renderScreen();

    expect(screen.getByTestId('recovery-loading')).toBeTruthy();
    expect(screen.getByTestId('recovery-back')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Recovery' })).toBeTruthy();
  });

  it('shows the error with Try again, which fetches again', async () => {
    pageFetch.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    renderScreen();

    expect(await screen.findByText("Couldn't load your recovery.")).toBeTruthy();
    expect(screen.getByTestId('recovery-error')).toBeTruthy();
    expect(pageFetch).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(pageFetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('recovery-hero')).toBeTruthy();
  });

  it('maps a 400 to the future-day error without Try again', async () => {
    pageFetch.mockRejectedValueOnce(Object.assign(new Error('bad date'), { status: 400 }));
    renderScreen();

    expect(await screen.findByText("That day hasn't happened yet.")).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });
});

describe('RecoveryScreen: READY', () => {
  it('shows the hero numeral, verdict, band and line, and the summary', async () => {
    renderScreen();
    const hero = await screen.findByTestId('recovery-hero');

    expect(within(hero).getByText('68')).toBeTruthy();
    expect(within(hero).getByText('Mostly clear')).toBeTruthy();
    expect(within(hero).getByText('Good')).toBeTruthy();
    expect(within(hero).getByText('Good · +6 vs yesterday · High confidence')).toBeTruthy();
    expect(within(screen.getByTestId('recovery-summary')).getByText(
      'A warm front in your HRV is lifting you today. Sleep-debt fog lingers; an early night clears it.',
    )).toBeTruthy();
  });

  it('colours the band word in the band colour and leaves High confidence muted', async () => {
    renderScreen();
    const hero = await screen.findByTestId('recovery-hero');

    expect(within(hero).getByText('Good')).toHaveStyle({ color: COLORS.light.scoreGood });
    expect(within(hero).getByText('High confidence')).not.toHaveStyle({ color: COLORS.light.scoreFair });
  });

  it('labels the hero as one element', async () => {
    renderScreen();
    const hero = await screen.findByTestId('recovery-hero');

    expect(hero.props.accessible).toBe(true);
    expect(hero.props.accessibilityLabel).toBe('Recovery 68, Good, mostly clear. Up 6 from yesterday. High confidence.');
  });

  it('shows the date and update time under the title', async () => {
    renderScreen();

    expect((await screen.findByTestId('recovery-subtitle')).props.children).toMatch(/^Thu 8 Oct · updated /);
  });

  it('goes back from the back button', async () => {
    renderScreen();
    await screen.findByTestId('recovery-hero');

    fireEvent.press(screen.getByTestId('recovery-back'));
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('opens the info sheet with the weights, baselines and the four bands', async () => {
    renderScreen();
    await screen.findByTestId('recovery-hero');
    expect(screen.queryByTestId('recovery-info-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('recovery-info'));
    const sheet = screen.getByTestId('recovery-info-sheet');

    expect(within(sheet).getByText('How the score works')).toBeTruthy();
    expect(within(sheet).getByText(/weighted 45 \/ 35 \/ 20\.$/)).toBeTruthy();
    expect(within(sheet).getByText(/not a medical assessment/)).toBeTruthy();
    expect(within(sheet).getByText(/^Your HRV baseline: /)).toBeTruthy();
    expect(within(sheet).getByText(/^Your resting heart rate baseline: /)).toBeTruthy();
    for (const line of ['Clear skies · Excellent · 75 and up', 'Mostly clear · Good · 55–74', 'Cloudy · Fair · 40–54', 'Stormy · Low · under 40']) {
      expect(within(sheet).getByText(line)).toBeTruthy();
    }
  });

  it('colours Low confidence in the Fair colour and adds the rough-read sentence', async () => {
    const base = makePage();
    pageFetch.mockResolvedValue(makePage({ score: { ...base.score!, confidenceLevel: 'LOW' } }));
    renderScreen();
    const hero = await screen.findByTestId('recovery-hero');

    expect(within(hero).getByText(/ · Low confidence$/)).toBeTruthy();
    expect(within(hero).getByText('Low confidence')).toHaveStyle({ color: COLORS.light.scoreFair });
    expect(within(screen.getByTestId('recovery-summary')).getByText(/Some readings are missing, so treat today as a rough read\.$/)).toBeTruthy();
  });

  it('reads a past day in the past tense, with no update time', async () => {
    mockParams = { date: '2026-10-02' };
    pageFetch.mockResolvedValue(makePage({ date: '2026-10-02', isToday: false, previous: { date: '2026-10-01', score: 71 } }));
    renderScreen();

    expect(await screen.findByTestId('recovery-subtitle')).toHaveTextContent('Fri 2 Oct', { exact: true });
    expect(pageFetch).toHaveBeenCalledWith('2026-10-02');
    expect(within(screen.getByTestId('recovery-summary')).getByText(
      'A warm front in your HRV lifted you that day. Sleep-debt fog lingered; an early night would have cleared it.',
    )).toBeTruthy();
  });
});

describe('RecoveryScreen: building and no data', () => {
  it('shows cold-start progress and the building summary', async () => {
    const base = makePage();
    pageFetch.mockResolvedValue(makePage({
      state: 'BUILDING',
      previous: null,
      score: { ...base.score!, score: null, factors: [], coldStart: [{ metric: 'HRV', daysCollected: 9, daysRequired: 14 }] },
    }));
    renderScreen();
    const hero = await screen.findByTestId('recovery-hero');

    expect(within(hero).getByText('Day 9 of 14')).toBeTruthy();
    expect(within(hero).getByText('Learning your weather')).toBeTruthy();
    expect(within(hero).getByText('Your forecast is charging up · 5 days to go')).toBeTruthy();
    expect(within(screen.getByTestId('recovery-summary')).getByText(
      'We need 5 more days of HRV to read your weather. Keep wearing your watch to bed.',
    )).toBeTruthy();
  });

  it('keeps the building verdict when cold start has no progress to show', async () => {
    const base = makePage();
    pageFetch.mockResolvedValue(makePage({
      state: 'BUILDING',
      previous: null,
      score: { ...base.score!, score: null, factors: [], coldStart: [] },
    }));
    renderScreen();
    const hero = await screen.findByTestId('recovery-hero');

    expect(RECOVERY_COPY.buildingLine).toBe('Your forecast is charging up');
    expect(within(hero).getByText('Learning your weather')).toBeTruthy();
    expect(within(hero).getByText('Your forecast is charging up')).toBeTruthy();
    expect(within(hero).queryByText("Waiting for last night's data")).toBeNull();
    expect(screen.queryByTestId('recovery-summary')).toBeNull();
  });

  it('shows No reading today, with no summary', async () => {
    pageFetch.mockResolvedValue(makePage({ state: 'NO_DATA', score: null, previous: null, updatedAt: null }));
    renderScreen();
    const hero = await screen.findByTestId('recovery-hero');

    expect(within(hero).getByText('—')).toBeTruthy();
    expect(within(hero).getByText('No reading')).toBeTruthy();
    expect(within(hero).getByText("Waiting for last night's data")).toBeTruthy();
    expect(screen.queryByTestId('recovery-summary')).toBeNull();
    expect(screen.getByTestId('recovery-subtitle')).toHaveTextContent('Thu 8 Oct', { exact: true });
  });
});

describe('RecoveryScreen: Ask bar', () => {
  it("asks the coach about today with the recovery prefill", async () => {
    renderScreen();
    const bar = await screen.findByTestId('ask-coach-button');

    expect(bar.props.accessibilityLabel).toBe('Ask Mochi about today');
    fireEvent.press(bar);
    expect(mockNavigation.navigate).toHaveBeenCalledWith(
      'Tabs',
      { screen: 'Coach', params: { prefill: 'Why is my recovery where it is today?' } },
      { pop: true },
    );
  });

  it('asks about this day on a past day', async () => {
    mockParams = { date: '2026-10-02' };
    pageFetch.mockResolvedValue(makePage({ date: '2026-10-02', isToday: false }));
    renderScreen();

    expect((await screen.findByTestId('ask-coach-button')).props.accessibilityLabel).toBe('Ask Mochi about this day');
  });

  it('is hidden when the coach is disabled', async () => {
    renderScreen({ ...STATUS, enabled: false });
    await screen.findByTestId('recovery-hero');

    expect(screen.queryByTestId('ask-coach-button')).toBeNull();
  });
});

describe('RecoveryScreen: Last 7 days', () => {
  const BANDS: Record<string, string | null> = {
    '2026-10-02': 'Good', '2026-10-03': 'Excellent', '2026-10-04': 'Fair', '2026-10-05': 'Low', '2026-10-06': null, '2026-10-07': 'Good', '2026-10-08': 'Good',
  };

  it('shows 7 columns ending at Today, each labelled for a screen reader', async () => {
    renderScreen();
    const strip = await screen.findByTestId('recovery-last-seven');

    expect(within(strip).getByText('Last 7 days')).toBeTruthy();
    expect(within(strip).getAllByRole('button')).toHaveLength(7);
    expect(within(screen.getByTestId('recovery-day-2026-10-08')).getByText('Today')).toBeTruthy();
    expect(within(screen.getByTestId('recovery-day-2026-10-02')).getByText('Fri')).toBeTruthy();
    expect(within(screen.getByTestId('recovery-day-2026-10-02')).getByText('58')).toBeTruthy();
    for (const day of makePage().outlook) {
      expect(screen.getByTestId(`recovery-day-${day.date}`).props.accessibilityLabel).toBe(RECOVERY_COPY.cellLabel(day.date, day.score, BANDS[day.date]!));
    }
    expect(screen.getByTestId('recovery-day-2026-10-08').props.accessibilityLabel).toBe('Thursday 8 October, 68, Good');
  });

  it('reads the weekday instead of Today on a past day', async () => {
    mockParams = { date: '2026-10-08' };
    pageFetch.mockResolvedValue(makePage({ isToday: false }));
    renderScreen();
    const last = await screen.findByTestId('recovery-day-2026-10-08');

    expect(within(last).getByText('Thu')).toBeTruthy();
    expect(within(last).queryByText('Today')).toBeNull();
  });

  it('shows a dash for a day without a score, and Low scores in the Low colour', async () => {
    renderScreen();
    const empty = await screen.findByTestId('recovery-day-2026-10-06');

    expect(within(empty).getByText('—')).toBeTruthy();
    expect(empty.props.accessibilityLabel).toBe('Tuesday 6 October, No reading');
    expect(within(screen.getByTestId('recovery-day-2026-10-05')).getByText('36')).toHaveStyle({ color: COLORS.light.scorePoor });
    expect(within(screen.getByTestId('recovery-day-2026-10-04')).getByText('49')).not.toHaveStyle({ color: COLORS.light.scorePoor });
  });

  it("pushes that day's Recovery when a column is pressed", async () => {
    renderScreen();

    fireEvent.press(await screen.findByTestId('recovery-day-2026-10-05'));
    expect(mockNavigation.push).toHaveBeenCalledWith('Recovery', { date: '2026-10-05' });
  });

  it('the viewed day (the last column) is still read, but pressing it pushes nothing', async () => {
    renderScreen();
    const col = await screen.findByTestId('recovery-day-2026-10-08');

    expect(col.props.accessibilityRole).toBe('button');
    expect(col.props.accessibilityLabel).toBe('Thursday 8 October, 68, Good');
    fireEvent.press(col);
    expect(mockNavigation.push).not.toHaveBeenCalled();
  });
});

describe('RecoveryScreen: sleep debt', () => {
  it('shows the debt, the factor word and points, the usual and the clear copy', async () => {
    renderScreen();
    const tile = await screen.findByTestId('recovery-sleep-debt');

    expect(screen.getByText('Sleep and streak')).toBeTruthy();
    expect(within(tile).getByText('Sleep debt · 14 nights')).toBeTruthy();
    expect(within(tile).getByText('Fog · −5')).toHaveStyle({ color: COLORS.light.scorePoor });
    expect(within(tile).getByText('3h 10m')).toBeTruthy();
    expect(within(tile).getByText('owed · usual under 2h 05m')).toBeTruthy();
    expect(within(tile).getByText('Each block is 30 min. Two nights at your 8h goal clear the fog.')).toBeTruthy();
  });

  it('draws a 30-minute block row with a partial last block', async () => {
    renderScreen();
    const tile = await screen.findByTestId('recovery-sleep-debt');

    expect(debtBlocks(190, 125)).toEqual(['full', 'full', 'full', 'full', 'full', 'full', 'partial', 'empty']);
    for (let i = 0; i < 6; i++) {
      expect(within(tile).getByTestId(`debt-block-${i}`, HIDDEN_OK)).toHaveStyle({ backgroundColor: COLORS.light.scorePoor, height: 16, borderRadius: 3 });
    }
    expect(within(tile).getByTestId('debt-block-6', HIDDEN_OK)).toHaveStyle({ backgroundColor: COLORS.light.scorePoor, opacity: 0.45 });
    expect(within(tile).getByTestId('debt-block-7', HIDDEN_OK)).not.toHaveStyle({ backgroundColor: COLORS.light.scorePoor });
    expect(within(tile).queryByTestId('debt-block-8', HIDDEN_OK)).toBeNull();
  });

  it('fills blocks in the muted colour when the debt is within the usual', async () => {
    const base = makePage();
    pageFetch.mockResolvedValue(makePage({ sleepDebt: { ...base.sleepDebt!, minutes: 90, nightsToClear: 0 } }));
    renderScreen();
    const tile = await screen.findByTestId('recovery-sleep-debt');

    expect(within(tile).getByTestId('debt-block-0', HIDDEN_OK)).toHaveStyle({ backgroundColor: COLORS.light.muted });
    expect(within(tile).getByText("Each block is 30 min. You're within your usual.")).toBeTruthy();
  });

  it('shows the no-data line without a features row', async () => {
    pageFetch.mockResolvedValue(makePage({ sleepDebt: null }));
    renderScreen();
    const tile = await screen.findByTestId('recovery-sleep-debt');

    expect(within(tile).getByText('No sleep data in the last 14 nights')).toBeTruthy();
    expect(within(tile).queryByTestId('debt-block-0', HIDDEN_OK)).toBeNull();
  });

  it('shows plain "owed" with no clear copy in cold start', async () => {
    const base = makePage();
    pageFetch.mockResolvedValue(makePage({ sleepDebt: { ...base.sleepDebt!, usualLowMinutes: null, usualHighMinutes: null, nightsToClear: null } }));
    renderScreen();
    const tile = await screen.findByTestId('recovery-sleep-debt');

    expect(within(tile).getByText('owed')).toBeTruthy();
    expect(within(tile).getByText('Each block is 30 min.')).toBeTruthy();
  });

  it('caps a large debt at 16 blocks', async () => {
    const base = makePage();
    pageFetch.mockResolvedValue(makePage({ sleepDebt: { ...base.sleepDebt!, minutes: 2000 } }));
    renderScreen();
    const tile = await screen.findByTestId('recovery-sleep-debt');

    expect(within(tile).getAllByTestId(/^debt-block-\d+$/, HIDDEN_OK)).toHaveLength(16);
  });

  it('reads a factor of exactly −0.5 as Fog · −1 in the drag colour (word and number agree)', async () => {
    const base = makePage();
    const factors = base.score!.factors.map((f) => (f.factor === 'SLEEP_DEBT' ? { ...f, points: -0.5 } : f));
    pageFetch.mockResolvedValue(makePage({ score: { ...base.score!, factors } }));
    renderScreen();
    const tile = await screen.findByTestId('recovery-sleep-debt');

    expect(within(tile).getByText('Fog · −1')).toHaveStyle({ color: COLORS.light.scorePoor });
  });

  it('reads a factor under 0.5 as Calm · 0 in the muted colour', async () => {
    const base = makePage();
    const factors = base.score!.factors.map((f) => (f.factor === 'SLEEP_DEBT' ? { ...f, points: 0.49 } : f));
    pageFetch.mockResolvedValue(makePage({ score: { ...base.score!, factors } }));
    renderScreen();
    const tile = await screen.findByTestId('recovery-sleep-debt');

    expect(within(tile).getByText('Calm · 0')).toHaveStyle({ color: COLORS.light.muted });
  });

  it('hides the factor word when the sleep-debt factor is excluded', async () => {
    const base = makePage();
    const factors = base.score!.factors.map((f) => (f.factor === 'SLEEP_DEBT' ? { ...f, excluded: true } : f));
    pageFetch.mockResolvedValue(makePage({ score: { ...base.score!, factors } }));
    renderScreen();
    const tile = await screen.findByTestId('recovery-sleep-debt');

    expect(within(tile).queryByText(/^Fog/)).toBeNull();
    expect(within(tile).getByText('3h 10m')).toBeTruthy();
  });
});

describe('RecoveryScreen: Last night', () => {
  it('shows the duration and the stage caption, and opens the night', async () => {
    renderScreen();
    const tile = await screen.findByTestId('recovery-last-night');

    expect(within(tile).getByText('Last night')).toBeTruthy();
    expect(within(tile).getByText('6h 48m')).toBeTruthy();
    expect(within(tile).getByText('Deep 1h 22m · REM 1h 31m')).toBeTruthy();
    expect(tile.props.accessibilityLabel).toBe('Last night, 6h 48m. Opens the night.');
    expect(within(tile).getByTestId('last-night-bar-DEEP')).toHaveStyle({ flex: 82, backgroundColor: COLORS.light.sleepDeep });
    expect(within(tile).getByTestId('last-night-bar-AWAKE')).toHaveStyle({ flex: 31, backgroundColor: COLORS.light.sleepAwake });

    fireEvent.press(tile);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Sleep', { date: '2026-10-08' });
  });

  it('draws one solid bar without stages', async () => {
    const base = makePage();
    pageFetch.mockResolvedValue(makePage({ lastNight: { ...base.lastNight!, stages: null } }));
    renderScreen();
    const tile = await screen.findByTestId('recovery-last-night');

    expect(within(tile).getByText('No stage data')).toBeTruthy();
    expect(within(tile).getByTestId('last-night-bar-solid')).toBeTruthy();
    expect(within(tile).queryByTestId('last-night-bar-DEEP')).toBeNull();
  });

  it('is not pressable without a night', async () => {
    pageFetch.mockResolvedValue(makePage({ lastNight: null }));
    renderScreen();
    const card = await screen.findByTestId('last-night-card');

    expect(within(card).getByText('No sleep recorded')).toBeTruthy();
    expect(within(card).getByText('—')).toBeTruthy();
    expect(screen.queryByTestId('recovery-last-night')).toBeNull();
  });
});

describe('RecoveryScreen: Clear streak', () => {
  it('shows the run, the best run and the last 4 days as band squares', async () => {
    renderScreen();
    const tile = await screen.findByTestId('recovery-streak');

    expect(within(tile).getByText('Clear streak')).toBeTruthy();
    expect(within(tile).getByText('2')).toBeTruthy();
    expect(within(tile).getByText('days')).toBeTruthy();
    expect(within(tile).getByText('Good or better · best run 5')).toBeTruthy();
    expect(within(tile).getByTestId('streak-square-0', HIDDEN_OK)).toHaveStyle({ backgroundColor: COLORS.light.scorePoor, width: 14, height: 14, borderRadius: 4 });
    expect(within(tile).getByTestId('streak-square-1', HIDDEN_OK)).not.toHaveStyle({ backgroundColor: COLORS.light.scorePoor });
    expect(within(tile).getByTestId('streak-square-2', HIDDEN_OK)).toHaveStyle({ backgroundColor: COLORS.light.scoreGood });
    expect(within(tile).getByTestId('streak-square-3', HIDDEN_OK)).toHaveStyle({ backgroundColor: COLORS.light.scoreGood });
    expect(within(tile).queryByTestId('streak-square-4', HIDDEN_OK)).toBeNull();
  });

  it('says "day" for a run of one', async () => {
    pageFetch.mockResolvedValue(makePage({ streak: { current: 1, best: 5 } }));
    renderScreen();
    const tile = await screen.findByTestId('recovery-streak');

    expect(within(tile).getByText('day')).toBeTruthy();
  });

  it('explains the streak when there is no history', async () => {
    const base = makePage();
    pageFetch.mockResolvedValue(makePage({ streak: { current: 0, best: 0 }, outlook: base.outlook.map((d) => ({ ...d, score: null })) }));
    renderScreen();
    const tile = await screen.findByTestId('recovery-streak');

    expect(within(tile).getByText('0')).toBeTruthy();
    expect(within(tile).getByText('Good or better days in a row')).toBeTruthy();
  });
});

describe('RecoveryScreen: month calendar', () => {
  const monthFetch = fetchRecoveryMonth as jest.Mock;
  const base = makePage();
  const SEPTEMBER: RecoveryCalendarDTO = {
    month: { month: '2026-09', days: [{ date: '2026-09-14', score: 80 }], average: 80, counts: { excellent: 1, good: 0, fair: 0, low: 0 } },
    bands: base.bands,
  };
  const withMonth = (over: Partial<RecoveryPageDTO['month']>, page: Partial<RecoveryPageDTO> = {}) =>
    makePage({ ...page, month: { ...base.month, ...over } });
  const cls = (el: { props: { className?: unknown } }) => String(el.props.className).split(' ');

  it('shows the month title, the rounded average and the caption', async () => {
    pageFetch.mockResolvedValue(withMonth({ average: 63.6 }));
    renderScreen();
    const cal = await screen.findByTestId('recovery-calendar');

    expect(within(cal).getByText('October')).toBeTruthy();
    expect(cls(within(cal).getByText('64'))).toContain('text-number');
    expect(within(cal).getByText('month average · 1 Excellent, 1 Low')).toBeTruthy();
    expect(within(cal).getByText('Tap a day to see its conditions.')).toBeTruthy();
  });

  it('shows a scored day with its score and label, and opens it', async () => {
    pageFetch.mockResolvedValue(withMonth({ days: base.month.days.map((d) => (d.date === '2026-10-03' ? { ...d, score: 61 } : d)) }));
    renderScreen();
    const cell = await screen.findByTestId('recovery-cal-2026-10-03');

    expect(within(cell).getByText('61')).toBeTruthy();
    expect(cell.props.accessibilityLabel).toBe('Saturday 3 October, 61, Good');
    fireEvent.press(cell);
    expect(mockNavigation.push).toHaveBeenCalledWith('Recovery', { date: '2026-10-03' });
  });

  it('draws a future day as its date number, not pressable', async () => {
    renderScreen();
    const cal = await screen.findByTestId('recovery-calendar');

    expect(within(cal).queryByTestId('recovery-cal-2026-10-20')).toBeNull();
    // Hidden from screen readers: found only when hidden elements are included.
    expect(within(cal).queryByText('20')).toBeNull();
    expect(within(cal).getByText('20', HIDDEN_OK)).toBeTruthy();
    expect(screen.getByTestId('recovery-cal-2026-10-08')).toBeTruthy();
  });

  it('opens a past day with no row (the no-data state)', async () => {
    pageFetch.mockResolvedValue(withMonth({ days: base.month.days.filter((d) => d.date !== '2026-10-04') }));
    renderScreen();
    const cell = await screen.findByTestId('recovery-cal-2026-10-04');

    expect(within(cell).getByText('4')).toBeTruthy();
    expect(cell.props.accessibilityLabel).toBe('Sunday 4 October, No reading');
    fireEvent.press(cell);
    expect(mockNavigation.push).toHaveBeenCalledWith('Recovery', { date: '2026-10-04' });
  });

  it('rings the viewed day', async () => {
    renderScreen();
    const ring = await screen.findByTestId('recovery-cal-selected');

    expect(within(ring).getByTestId('recovery-cal-2026-10-08')).toBeTruthy();
    expect(ring).toHaveStyle({ borderWidth: 2, borderColor: COLORS.light.foreground, padding: 2, borderRadius: 10 });
  });

  it('the ringed cell is still read, but pressing it pushes nothing', async () => {
    renderScreen();
    const cell = await screen.findByTestId('recovery-cal-2026-10-08');

    expect(cell.props.accessibilityRole).toBe('button');
    expect(cell.props.accessibilityLabel).toBe('Thursday 8 October, 68, Good');
    fireEvent.press(cell);
    expect(mockNavigation.push).not.toHaveBeenCalled();
  });

  it("bolds today when viewing another day, taking today from the server, not the device clock", async () => {
    // The device clock is already in November (travelling east of the stored zone); the server says 8 Oct.
    jest.useFakeTimers({ now: new Date(2026, 10, 2, 12), advanceTimers: true });
    try {
      mockParams = { date: '2026-10-02' };
      pageFetch.mockResolvedValue(makePage({ date: '2026-10-02', isToday: false, today: '2026-10-08' }));
      renderScreen();
      const ring = await screen.findByTestId('recovery-cal-selected');

      expect(within(ring).getByTestId('recovery-cal-2026-10-02')).toBeTruthy();
      expect(cls(within(screen.getByTestId('recovery-cal-2026-10-08')).getByText('68'))).toContain('font-bold');
      expect(cls(within(screen.getByTestId('recovery-cal-2026-10-07')).getByText('62'))).not.toContain('font-bold');
      expect(screen.queryByTestId('recovery-cal-2026-10-09')).toBeNull();
      expect(screen.getByLabelText('Next month')).toBeDisabled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('pages back, with a skeleton until the month loads, and forward from the cache', async () => {
    const req = pending<RecoveryCalendarDTO>();
    monthFetch.mockReturnValue(req.promise);
    renderScreen();
    await screen.findByTestId('recovery-calendar');

    expect(screen.getByLabelText('Next month')).toBeDisabled();
    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(monthFetch).toHaveBeenCalledWith('2026-09');
    expect(screen.getByTestId('recovery-cal-loading')).toBeTruthy();
    expect(screen.queryByTestId('recovery-cal-2026-10-08')).toBeNull();

    req.resolve(SEPTEMBER);
    expect(await screen.findByText('September')).toBeTruthy();
    expect(screen.queryByTestId('recovery-cal-loading')).toBeNull();
    expect(within(screen.getByTestId('recovery-cal-2026-09-14')).getByText('80')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('October')).toBeTruthy();
    expect(screen.getByTestId('recovery-cal-2026-10-08')).toBeTruthy();
    expect(monthFetch).toHaveBeenCalledTimes(1);
  });

  it("disables Previous at firstScoredDate's month", async () => {
    pageFetch.mockResolvedValue(makePage({ firstScoredDate: '2026-10-02' }));
    renderScreen();
    await screen.findByTestId('recovery-calendar');

    expect(screen.getByLabelText('Previous month')).toBeDisabled();
    expect(screen.getByLabelText('Next month')).toBeDisabled();
  });

  it('pages back across a year and titles the month with its year', async () => {
    monthFetch.mockResolvedValue({ ...SEPTEMBER, month: { month: '2025-12', days: [], average: null, counts: { excellent: 0, good: 0, fair: 0, low: 0 } } });
    pageFetch.mockResolvedValue(withMonth({ month: '2026-01', days: [{ date: '2026-01-15', score: 68 }] }, { date: '2026-01-15', firstScoredDate: '2025-06-01' }));
    renderScreen();
    await screen.findByText('January');

    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(monthFetch).toHaveBeenCalledWith('2025-12');
    expect(await screen.findByText('December 2025')).toBeTruthy();
  });

  it('shows the month error with Retry, which fetches again', async () => {
    monthFetch.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(SEPTEMBER);
    renderScreen();
    await screen.findByTestId('recovery-calendar');

    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(await screen.findByText("Couldn't load September.")).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(monthFetch).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('recovery-cal-2026-09-14')).toBeTruthy();
    expect(screen.queryByText("Couldn't load September.")).toBeNull();
  });

  it('shows no average and only unscored cells for an empty month', async () => {
    pageFetch.mockResolvedValue(withMonth({ days: [], average: null, counts: { excellent: 0, good: 0, fair: 0, low: 0 } }));
    renderScreen();
    const cal = await screen.findByTestId('recovery-calendar');

    expect(within(cal).queryByText(/month average/)).toBeNull();
    expect(within(cal).getByText('Tap a day to see its conditions.')).toBeTruthy();
    for (let d = 1; d <= 8; d++) {
      const cell = screen.getByTestId(`recovery-cal-2026-10-0${d}`);
      expect(cell.props.accessibilityLabel).toMatch(/, No reading$/);
      expect(within(cell).getByText(String(d))).toBeTruthy();
    }
  });
});

describe("RecoveryScreen: tomorrow's forecast", () => {
  const card = () => screen.findByTestId('recovery-tomorrow');
  const ready = makePage().tomorrow as Extract<RecoveryPageDTO['tomorrow'], { status: 'READY' }>;

  it('selects the goal chip and shows its band, caption and track record', async () => {
    renderScreen();
    const c = await card();

    expect(within(c).getByText("Tomorrow's forecast")).toBeTruthy();
    expect(within(c).getByTestId('recovery-chip-8').props.accessibilityState).toEqual({ checked: true });
    expect(within(c).getByTestId('recovery-chip-6').props.accessibilityState).toEqual({ checked: false });
    expect(within(c).getByText('70–78')).toBeTruthy();
    expect(within(c).getByText('if you sleep 8h tonight')).toBeTruthy();
    expect(within(c).getByText('right 9 of last 12')).toBeTruthy();
    // The group stays non-accessible so each radio remains focusable on its own.
    expect(within(c).getByLabelText('Sleep tonight').props.accessibilityRole).toBe('radiogroup');
  });

  it('starts on the chip nearest the sleep goal', async () => {
    pageFetch.mockResolvedValue(makePage({ sleepDebt: { ...makePage().sleepDebt!, goalMinutes: 410 } }));
    renderScreen();
    const c = await card();

    expect(within(c).getByTestId('recovery-chip-7').props.accessibilityState).toEqual({ checked: true });
    expect(within(c).getByText('64–72')).toBeTruthy();
  });

  it('switches chips locally, without a new fetch', async () => {
    renderScreen();
    const c = await card();
    const calls = pageFetch.mock.calls.length;

    fireEvent.press(within(c).getByTestId('recovery-chip-6'));

    expect(within(c).getByTestId('recovery-chip-6').props.accessibilityState).toEqual({ checked: true });
    expect(within(c).getByTestId('recovery-chip-8').props.accessibilityState).toEqual({ checked: false });
    expect(within(c).getByText('56–66')).toBeTruthy();
    expect(within(c).getByText('if you sleep 6h tonight')).toBeTruthy();
    expect(within(c).queryByText('70–78')).toBeNull();
    expect(pageFetch).toHaveBeenCalledTimes(calls);
  });

  it('labels each chip with its hours and predicted score', async () => {
    renderScreen();
    const c = await card();

    expect(within(c).getByTestId('recovery-chip-6').props.accessibilityLabel).toBe('6 hours, predicted 61');
    expect(within(c).getByRole('radio', { name: '9 hours, predicted 76' })).toBeTruthy();
  });

  it('hides the track record under 5 days', async () => {
    pageFetch.mockResolvedValue(makePage({ tomorrow: { ...ready, trackRecord: { hits: 3, days: 4, withinPoints: 3 } } }));
    renderScreen();
    const c = await card();

    expect(within(c).queryByText(/right \d+ of last/)).toBeNull();
    expect(within(c).getByText('70–78')).toBeTruthy();
  });

  it('opens the Forecast screen from More levers', async () => {
    renderScreen();
    const c = await card();

    fireEvent.press(within(c).getByText('More levers'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Forecast');
  });

  it('shows the unlock progress without history, with no chips or More levers', async () => {
    pageFetch.mockResolvedValue(makePage({ tomorrow: { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 9 } }));
    renderScreen();
    const c = await card();

    expect(within(c).getByText("Tomorrow's forecast")).toBeTruthy();
    expect(within(c).getByText('Forecast unlocks after 21 days of data (9/21)')).toBeTruthy();
    expect(within(c).queryByRole('radio')).toBeNull();
    expect(within(c).queryByText('More levers')).toBeNull();
  });

  it('explains a low-confidence today', async () => {
    pageFetch.mockResolvedValue(makePage({ tomorrow: { status: 'NOT_ENOUGH_DATA', reason: 'LOW_CONFIDENCE_TODAY', daysOfHistory: 40 } }));
    renderScreen();
    const c = await card();

    expect(within(c).getByText(FORECAST_COPY.lowConfidence)).toBeTruthy();
    expect(within(c).queryByRole('radio')).toBeNull();
    expect(within(c).queryByText('More levers')).toBeNull();
  });

  it('says when the forecast is unavailable', async () => {
    pageFetch.mockResolvedValue(makePage({ tomorrow: { status: 'UNAVAILABLE' } }));
    renderScreen();
    const c = await card();

    expect(within(c).getByText(FORECAST_COPY.unavailable)).toBeTruthy();
    expect(within(c).queryByRole('radio')).toBeNull();
    expect(within(c).queryByText('More levers')).toBeNull();
  });

  it('shows no card for a past day', async () => {
    pageFetch.mockResolvedValue(makePage({ date: '2026-10-02', isToday: false }));
    renderScreen();
    await screen.findByTestId('recovery-calendar');

    expect(screen.queryByTestId('recovery-tomorrow')).toBeNull();
  });

  it('shows no card when the bundle has no tomorrow', async () => {
    pageFetch.mockResolvedValue(makePage({ tomorrow: null }));
    renderScreen();
    await screen.findByTestId('recovery-calendar');

    expect(screen.queryByTestId('recovery-tomorrow')).toBeNull();
  });
});
