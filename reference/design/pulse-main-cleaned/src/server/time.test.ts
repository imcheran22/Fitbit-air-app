import { describe, expect, it } from "vitest";
import { addDays, daysBetween, fractionalYears, localDay, localMidnight, localMinutes, wall, wholeYears } from "./time";

describe("age", () => {
  it("whole years tick over on the birthday, not the day after", () => {
    expect(wholeYears("1990-06-15", "2026-06-14")).toBe(35);
    expect(wholeYears("1990-06-15", "2026-06-15")).toBe(36);
    expect(wholeYears("1990-06-15", "2026-12-31")).toBe(36);
    expect(wholeYears("1990-01-01", "1990-01-01")).toBe(0);
  });

  it("fractional years are exact on a birthday and floor to whole years every day", () => {
    expect(fractionalYears("1990-06-15", "2026-06-15")).toBe(36);
    expect(fractionalYears("1990-06-15", "2026-06-14")).toBeGreaterThan(35.99);
    expect(fractionalYears("1990-06-15", "2026-06-14")).toBeLessThan(36);
    expect(fractionalYears("1990-01-01", "1990-07-02")).toBeCloseTo(182 / 365, 12);
    for (let i = 0; i < 3 * 366; i++) {
      const day = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      for (const birth of ["1990-06-15", "1992-02-29", "1985-12-31"]) {
        expect(Math.floor(fractionalYears(birth, day)), `${birth} on ${day}`).toBe(wholeYears(birth, day));
      }
    }
  });

  it("a Feb 29 birth date turns over on Mar 1 in common years and on Feb 29 in leap years", () => {
    expect(wholeYears("1992-02-29", "2026-02-28")).toBe(33);
    expect(wholeYears("1992-02-29", "2026-03-01")).toBe(34);
    expect(wholeYears("1992-02-29", "2028-02-28")).toBe(35);
    expect(wholeYears("1992-02-29", "2028-02-29")).toBe(36);
    expect(fractionalYears("1992-02-29", "2026-03-01")).toBe(34);
    expect(fractionalYears("1992-02-29", "2028-02-29")).toBe(36);
    expect(fractionalYears("1992-02-29", "2026-02-28")).toBeLessThan(34);
  });
});

// Every kind of offset and transition: none, half and quarter hours, 30-minute DST, DST at 02:00, DST at
// midnight (Santiago, Havana, Azores), and a fall-back to midnight (Amman until 2022).
const ZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "America/St_Johns",
  "Europe/London",
  "America/New_York",
  "America/Santiago",
  "America/Havana",
  "Atlantic/Azores",
  "Asia/Amman",
  "Australia/Lord_Howe",
  "Pacific/Chatham",
];

const offset = (s: number, tz: string) => wall(s, tz).asUtc - s;

/** The day-boundary contract every caller relies on, for local day `d` in `tz`. */
function checkDay(tz: string, d: string) {
  const m = localMidnight(d, tz);
  const next = localMidnight(addDays(d, 1), tz);
  const at = `${tz} ${d}`;
  expect(localDay(m, tz), at).toBe(d);
  expect(localDay(m - 1, tz), `${at} - 1 s`).toBe(addDays(d, -1));
  expect(m % 900, `${at}: on the 15-minute grid the sync writer's dayOf cache assumes`).toBe(0);
  const hours = (next - m) / 3600;
  // 23, 23.5, 24, 24.5 or 25 h for DST; Antarctica/Casey moved its offset by 3 h in 2020.
  expect(Math.abs(hours - 24) <= 3 && Number.isInteger(hours * 4), `${at} lasts ${hours} h`).toBe(true);
  expect([localMinutes(m, tz), localMinutes(next - 60, tz)], `${at} minutes`).toEqual([0, hours * 60 - 1]);
  // The day opens at 00:00 on the clock, unless the clocks jump past midnight at that very instant.
  if (offset(m, tz) === offset(m - 1, tz)) expect(wall(m, tz).time, at).toBe("00:00:00");
}

/** Every day around each offset change in 2020–2030, and every 30th day, in `tz`. */
function checkZone(tz: string) {
  const noonOffset = (d: string) => offset(Date.parse(`${d}T12:00:00Z`) / 1000, tz);
  let today = noonOffset("2020-01-01");
  for (let d = "2020-01-01", i = 0; d <= "2030-12-31"; d = addDays(d, 1), i++) {
    const tomorrow = noonOffset(addDays(d, 1));
    // A zone's midnight is within 14 h of UTC's, so a change between these noons touches days d-1 to d+2.
    if (today !== tomorrow) for (let k = -1; k <= 2; k++) checkDay(tz, addDays(d, k));
    else if (i % 30 === 0) checkDay(tz, d);
    today = tomorrow;
  }
}

describe("local days across zones and DST", () => {
  it.each(ZONES)("%s: localMidnight, localDay and localMinutes agree around every transition of 2020–2030, and on a sample of days", (tz) => checkZone(tz));

  // Lengths and opening clock times on the transitions, pinned so a regression names the day.
  it.each([
    ["Asia/Kolkata", "2026-09-06", 24, "00:00:00"],
    ["Europe/London", "2026-03-29", 23, "00:00:00"],
    ["Europe/London", "2026-10-25", 25, "00:00:00"],
    ["America/New_York", "2026-03-08", 23, "00:00:00"],
    ["America/New_York", "2026-11-01", 25, "00:00:00"],
    ["America/Santiago", "2026-09-05", 24, "00:00:00"],
    ["America/Santiago", "2026-09-06", 23, "01:00:00"], // midnight does not exist: the day opens at 01:00
    ["America/Santiago", "2026-04-04", 25, "00:00:00"],
    ["America/Havana", "2026-03-08", 23, "01:00:00"],
    ["Atlantic/Azores", "2026-03-29", 23, "01:00:00"],
    ["Asia/Amman", "2021-10-29", 25, "00:00:00"], // midnight happens twice: the day opens at the first
    ["Australia/Lord_Howe", "2026-10-04", 23.5, "00:00:00"],
    ["Australia/Lord_Howe", "2026-04-05", 24.5, "00:00:00"],
    ["Pacific/Chatham", "2026-09-27", 23, "00:00:00"],
    ["Pacific/Chatham", "2026-04-05", 25, "00:00:00"],
    ["America/St_Johns", "2026-03-08", 23, "00:00:00"],
  ] as const)("%s %s lasts %s h and opens at %s", (tz, day, hours, opens) => {
    const m = localMidnight(day, tz);
    expect((localMidnight(addDays(day, 1), tz) - m) / 3600).toBe(hours);
    expect(wall(m, tz)).toMatchObject({ day, time: opens });
  });

  it("a repeated midnight opens the day at the first one, so the day's first hour is inside it", () => {
    const m = localMidnight("2021-10-29", "Asia/Amman");
    expect(wall(m, "Asia/Amman").time).toBe("00:00:00");
    expect(wall(m + 3600, "Asia/Amman").time).toBe("00:00:00"); // the clocks went back to midnight
    expect(localMinutes(m + 3600 + 60, "Asia/Amman")).toBe(61);
  });

  it("addDays and daysBetween are calendar arithmetic, whatever the zone", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-09-06", 0)).toBe("2026-09-06");
    for (const n of [-400, -1, 0, 1, 31, 366]) expect(daysBetween("2026-03-29", addDays("2026-03-29", n))).toBe(n);
  });
});

// All ~420 IANA zones over 2020–2030 (1.7 M days, a few seconds): nightly only.
describe.skipIf(!process.env.PULSE_NIGHTLY)("local days in every zone (nightly)", () => {
  it("holds the contract in every IANA zone", () => {
    for (const tz of Intl.supportedValuesOf("timeZone")) checkZone(tz);
  }, 300_000);
});
