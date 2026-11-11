// Every user-facing forecast string, so the Dashboard card and the Forecast
// screen can never drift apart. Components import from here; they never inline copy.
export const FORECAST_MIN_DAYS = 21;

// "1 drink", "2 drinks": the unit arrives plural from the API.
const habitLabel = (n: number, unit: string) => `${n} ${n === 1 && unit.endsWith('s') ? unit.slice(0, -1) : unit}`;

export const FORECAST_COPY = {
  noneYet: 'No measurable effect for you yet',
  disclaimer: 'An estimate from your own history — not medical advice.',
  effectOrder: 'Effects shown in order: recent trend, sleep, habits.',
  unlocksAfter: (days: number) => `Forecast unlocks after ${FORECAST_MIN_DAYS} days of data (${days}/${FORECAST_MIN_DAYS})`,
  lowConfidence: 'Today’s score isn’t confident enough to forecast from yet. Check back after tonight’s sync.',
  band: (lo: number, hi: number) => `Likely ${Math.round(lo)}–${Math.round(hi)}`,
  trackRecord: (within: number, hits: number, days: number) => `Within ±${within} on ${hits} of the last ${days} days`,
  legendActual: 'Actual score',
  legendForecast: 'Forecast',
  loadError: 'Couldn’t load tomorrow’s forecast. Try again in a moment.',
  unavailable: 'Tomorrow’s forecast is unavailable right now.',
  trendLabel: 'Recent trend',
  sleepLabel: (h: number) => `Sleep ${h} h`,
  habitLabel,
  /** A lever's current value: "7.5 h" for sleep, "1 drink" for a habit, matching the Why bars. */
  leverValue: (value: number, unit: string, isSleep: boolean) => (isSleep ? `${value} h` : habitLabel(value, unit)),
  notModelled: 'Not included in this forecast',
  title: 'Tomorrow',
  planHeading: 'Plan tomorrow',
  reset: 'Reset',
  whyHeading: 'Why',
  trackRecordHeading: 'Track record',
  rightOfLast: (hits: number, days: number) => `right ${hits} of last ${days}`,
  ifYouSleep: (h: number) => `if you sleep ${h}h tonight`,
  moreLevers: 'More levers',
  sleepTonight: 'Sleep tonight',
  chipHours: (h: number) => `${h}h`,
  chipLabel: (h: number, score: number) => `${h} hours, predicted ${Math.round(score)}`,
} as const;
