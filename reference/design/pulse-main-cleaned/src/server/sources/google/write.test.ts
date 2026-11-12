import { describe, expect, it } from "vitest";
import { localMidnight } from "../../time";
import { toDataPoint } from "./write";

const TZ = "Asia/Kolkata"; // +05:30, 19800 s
const T = Date.parse("2026-10-02T06:00:00Z") / 1000; // 11:30 local
const sample = { physicalTime: "2026-10-02T06:00:00Z", utcOffset: "19800s" };
const moment = { startTime: "2026-10-02T06:00:00Z", startUtcOffset: "19800s", endTime: "2026-10-02T06:00:01Z", endUtcOffset: "19800s" };

describe("toDataPoint (shapes from Google's guides)", () => {
  it("water: a one-second hydration log in millilitres", () => {
    expect(toDataPoint("hydration-log", { ml: 250 }, T, TZ)).toEqual({
      hydrationLog: { interval: moment, amountConsumed: { milliliters: 250, userProvidedUnit: "MILLILITER" } },
    });
  });

  it("food: an anonymous nutrition log, protein as a nutrient, missing macros left out", () => {
    expect(toDataPoint("nutrition-log", { name: "Dal", meal: "LUNCH", kcal: 420, protein: 18, carbs: 60, fat: null }, T, TZ)).toEqual({
      nutritionLog: {
        interval: moment,
        foodDisplayName: "Dal",
        mealType: "LUNCH",
        energy: { kcal: 420 },
        totalCarbohydrate: { grams: 60 },
        nutrients: [{ nutrient: "PROTEIN", quantity: { grams: 18 } }],
      },
    });
    const quick = toDataPoint("nutrition-log", { name: null, meal: "SNACK", kcal: 150, protein: null, carbs: null, fat: null }, T, TZ);
    expect(quick).toEqual({ nutritionLog: { interval: moment, foodDisplayName: "Quick calories", mealType: "SNACK", energy: { kcal: 150 } } });
  });

  it("weight in grams and body fat in percent, as samples", () => {
    expect(toDataPoint("weight", { kg: 72.4 }, T, TZ)).toEqual({ weight: { sampleTime: sample, weightGrams: 72400 } });
    expect(toDataPoint("body-fat", { pct: 18.5 }, T, TZ)).toEqual({ bodyFat: { sampleTime: sample, percentage: 18.5 } });
  });

  it("mood and symptoms keep Google's enum values", () => {
    expect(toDataPoint("moods", { moods: ["CALM", "CONTENT"], valence: "PLEASANT" }, T, TZ)).toEqual({
      moods: { sampleTime: sample, moods: ["CALM", "CONTENT"], valences: ["PLEASANT"] },
    });
    expect(toDataPoint("moods", { moods: ["SAD"], valence: null }, T, TZ)).toEqual({ moods: { sampleTime: sample, moods: ["SAD"] } });
    expect(toDataPoint("symptoms", { symptoms: ["HEADACHE"] }, T, TZ)).toEqual({ symptoms: { sampleTime: sample, symptoms: ["HEADACHE"] } });
  });

  it("a period covers whole local days, flow in the notes", () => {
    const p = toDataPoint("menstrual-period", { start: "2026-09-28", end: "2026-10-01", flow: "MEDIUM" }, 0, TZ);
    expect(p).toEqual({
      menstrualPeriod: {
        interval: {
          startTime: new Date(localMidnight("2026-09-28", TZ) * 1000).toISOString().replace(".000Z", "Z"),
          startUtcOffset: "19800s",
          endTime: "2026-10-01T18:29:59Z",
          endUtcOffset: "19800s",
        },
        notes: "Flow: medium",
      },
    });
  });

  it("an ovulation test result, and the offset follows DST", () => {
    expect(toDataPoint("ovulation-test", { result: "LUTEINIZING_HORMONE_SURGE" }, T, TZ)).toEqual({
      ovulationTest: { sampleTime: sample, result: "LUTEINIZING_HORMONE_SURGE" },
    });
    const summer = Date.parse("2026-07-01T12:00:00Z") / 1000;
    expect(toDataPoint("weight", { kg: 70 }, summer, "Europe/London")).toMatchObject({ weight: { sampleTime: { utcOffset: "3600s" } } });
  });
});
