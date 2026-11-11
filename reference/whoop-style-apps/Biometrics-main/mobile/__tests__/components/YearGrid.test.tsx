import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Rect } from 'react-native-svg';
import { YearGrid } from '../../src/components/activity/YearGrid';
import { COLORS } from '../../src/theme';

const TODAY = '2026-10-13';

function renderGrid(props: Partial<React.ComponentProps<typeof YearGrid>> = {}) {
  const utils = render(<YearGrid metric="steps" values={new Map()} today={TODAY} goal={10000} {...props} />);
  fireEvent(screen.getByTestId('year-grid-canvas'), 'layout', { nativeEvent: { layout: { width: 350, height: 80 } } });
  return utils;
}

const squares = () => within(screen.getByTestId('year-grid-canvas')).UNSAFE_getAllByType(Rect);

describe('YearGrid', () => {
  it('draws a square per day from 1 January through today, in week columns', () => {
    renderGrid();

    // 1 Jan to 13 Oct 2026 is 286 days; one more rect outlines today.
    expect(squares()).toHaveLength(287);
    expect(screen.getByTestId('year-grid').props.accessibilityLabel).toBe('Steps per day, January to October 2026');
  });

  it('colours a day by its level and outlines today', () => {
    renderGrid({ values: new Map([['2026-01-01', 12000]]) });

    const [first] = squares();
    expect([COLORS.light.heat4, COLORS.dark.heat4]).toContain(first!.props.fill);
    const outline = squares()[squares().length - 1]!;
    expect([COLORS.light.foreground, COLORS.dark.foreground]).toContain(outline.props.stroke);
    expect(outline.props.fill).toBe('none');
  });

  it('uses the sleep ramp for sleep, against the sleep goal', () => {
    renderGrid({ metric: 'sleep', goal: 480, values: new Map([['2026-01-01', 480]]) });

    expect([COLORS.light.sleepHeat4, COLORS.dark.sleepHeat4]).toContain(squares()[0]!.props.fill);
    expect(screen.getByTestId('year-grid').props.accessibilityLabel).toBe('Sleep per night, January to October 2026');
  });

  it('labels the months under the grid', () => {
    renderGrid();

    const labels = within(screen.getByTestId('year-grid-months')).getAllByText(/^[A-Z][a-z]{2}$/, { includeHiddenElements: true });
    expect(labels.map((l) => l.props.children)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
  });

  it("uses the score colours for Recovery, banded by the user's bands", () => {
    renderGrid({ metric: 'recovery', goal: 0, bands: { excellent: 80, good: 60, fair: 40 }, values: new Map([['2026-01-01', 85], ['2026-01-02', 30]]) });

    const [first, second] = squares();
    expect([COLORS.light.scoreExcellent, COLORS.dark.scoreExcellent]).toContain(first!.props.fill);
    expect([COLORS.light.scorePoor, COLORS.dark.scorePoor]).toContain(second!.props.fill);
    expect(screen.getByTestId('year-grid').props.accessibilityLabel).toBe('Recovery per day, January to October 2026');
  });
});
