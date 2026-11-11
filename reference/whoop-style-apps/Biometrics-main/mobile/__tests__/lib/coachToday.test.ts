import type { TodayBarDTO, TodaySummaryDTO } from '../../src/api/coach';
import {
  barColorKey,
  barFill,
  barQuestion,
  spanQuestion,
  suggestedQuestions,
  tickPosition,
  GENERAL_QUESTIONS,
  TRAINING_QUESTION,
} from '../../src/lib/coachToday';

function bar(overrides: Partial<TodayBarDTO>): TodayBarDTO {
  return {
    metric: 'recovery',
    label: 'Recovery',
    value: 26,
    usual: 58,
    unit: 'score',
    display: '26',
    usualDisplay: '58',
    status: 'below',
    scaleMax: 100,
    ...overrides,
  };
}

const recovery = bar({});
const sleep = bar({ metric: 'sleep', label: 'Sleep', value: 408, usual: 433, unit: 'minutes', display: '6h 48m', usualDisplay: '7h 13m', status: 'near', scaleMax: 606.2 });
const hrv = bar({ metric: 'hrv', label: 'HRV', value: 41, usual: 52, unit: 'ms', display: '41', usualDisplay: '52', status: 'below', scaleMax: 72.8 });
// Resting HR: higher than usual is worse, so the server marks it below.
const rhr = bar({ metric: 'rhr', label: 'Rest HR', value: 66, usual: 58, unit: 'bpm', display: '66', usualDisplay: '58', status: 'below', scaleMax: 92.4 });

describe('bar geometry', () => {
  it('fills to value / scaleMax and puts the tick at usual / scaleMax', () => {
    expect(barFill(recovery)).toBeCloseTo(0.26);
    expect(tickPosition(recovery)).toBeCloseTo(0.58);
    expect(barFill(hrv)).toBeCloseTo(41 / 72.8);
  });

  it('clamps to the track and has no tick without a usual', () => {
    expect(barFill(bar({ value: 140 }))).toBe(1);
    expect(barFill(bar({ value: -3 }))).toBe(0);
    expect(tickPosition(bar({ usual: null }))).toBeNull();
  });
});

describe('barColorKey', () => {
  it('is rose below, teal above, neutral near, and violet for sleep near usual', () => {
    expect(barColorKey(recovery)).toBe('statusBelow');
    expect(barColorKey(bar({ status: 'above' }))).toBe('statusAbove');
    expect(barColorKey(bar({ status: 'near' }))).toBe('statusNear');
    expect(barColorKey(sleep)).toBe('metricSleep');
    expect(barColorKey(bar({ status: null }))).toBe('statusNear');
  });

  it('follows the server status for resting HR, which is already inverted', () => {
    expect(barColorKey(rhr)).toBe('statusBelow');
  });
});

describe('barQuestion', () => {
  it('asks why a metric is lower or higher than usual', () => {
    expect(barQuestion(recovery)).toBe('Why is my recovery lower than usual today?');
    expect(barQuestion(bar({ value: 82, status: 'above' }))).toBe('Why is my recovery higher than usual today?');
    expect(barQuestion(hrv)).toBe('Why is my HRV lower than usual today?');
  });

  it('words resting HR by the number, not the inverted status', () => {
    expect(barQuestion(rhr)).toBe('Why is my resting heart rate higher than usual today?');
  });

  it('asks about last night when sleep was shorter or longer than usual', () => {
    expect(barQuestion(bar({ metric: 'sleep', value: 350, usual: 433, status: 'below' }))).toBe('Why was my sleep shorter than usual last night?');
    expect(barQuestion(bar({ metric: 'sleep', value: 520, usual: 433, status: 'above' }))).toBe('Why was my sleep longer than usual last night?');
  });

  it('asks how the metric looks when it is near usual or has no usual', () => {
    expect(barQuestion(sleep)).toBe('How did I sleep last night?');
    expect(barQuestion(bar({ status: 'near', value: 57 }))).toBe("How's my recovery looking today?");
    expect(barQuestion(bar({ usual: null, status: null }))).toBe("How's my recovery looking today?");
  });
});

describe('spanQuestion', () => {
  it("asks about the tapped metric's bar", () => {
    expect(spanQuestion('hrv', [recovery, hrv])).toBe('Why is my HRV lower than usual today?');
  });

  it('asks generally when there is no bar for it', () => {
    expect(spanQuestion('sleep', [recovery])).toBe('How did I sleep last night?');
    expect(spanQuestion('rhr', [recovery])).toBe("How's my resting heart rate looking today?");
  });
});

describe('suggestedQuestions', () => {
  const summary = (bars: TodayBarDTO[], hasData = true): TodaySummaryDTO => ({ date: '2026-09-30', hasData, sentence: null, bars });

  it('leads with the metrics furthest from usual, then asks about training, then one general question', () => {
    // recovery is 55% under usual, HRV 21% under, resting HR 14% worse.
    expect(suggestedQuestions(summary([sleep, hrv, rhr, recovery]))).toEqual([
      'Why is my recovery lower than usual today?',
      'Why is my HRV lower than usual today?',
      TRAINING_QUESTION,
      GENERAL_QUESTIONS[0],
    ]);
  });

  it('puts a metric above usual after the ones below it, and skips metrics near usual', () => {
    expect(suggestedQuestions(summary([sleep, bar({ status: 'above', value: 82 })]))).toEqual([
      'Why is my recovery higher than usual today?',
      'Should I train hard today?',
      GENERAL_QUESTIONS[0],
    ]);
  });

  it('offers only general questions before there is any data', () => {
    expect(suggestedQuestions(summary([], false))).toEqual(GENERAL_QUESTIONS);
    expect(suggestedQuestions(null)).toEqual(GENERAL_QUESTIONS);
  });
});
