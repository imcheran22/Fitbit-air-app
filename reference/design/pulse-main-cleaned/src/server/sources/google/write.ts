// Logged entries as Google Health data points, in the shapes Google's guides show (docs/research/google-health-coverage.md,
// "Writing"). Times go out as UTC instants with the zone's offset, so Google's civil times match the owner's clock.
import type { LogData, LogType } from "@/lib/log";
import { addDays, fromWall, localMidnight, utcOffsetS } from "../../time";

const iso = (s: number) => new Date(s * 1000).toISOString().replace(".000Z", "Z");
const offset = (s: number, tz: string) => `${utcOffsetS(s, tz)}s`;
const sample = (s: number, tz: string) => ({ physicalTime: iso(s), utcOffset: offset(s, tz) });
const interval = (start: number, end: number, tz: string) => ({
  startTime: iso(start),
  startUtcOffset: offset(start, tz),
  endTime: iso(end),
  endUtcOffset: offset(end, tz),
});

/** The DataPoint body `dataPoints.create` takes for one logged entry at `ts` (unix seconds). */
export function toDataPoint(type: LogType, data: unknown, ts: number, tz: string): Record<string, unknown> {
  const d = data;
  switch (type) {
    case "hydration-log": {
      const { ml } = d as LogData["hydration-log"];
      // A drink is a moment; Google's example spans one second.
      return { hydrationLog: { interval: interval(ts, ts + 1, tz), amountConsumed: { milliliters: ml, userProvidedUnit: "MILLILITER" } } };
    }
    case "nutrition-log": {
      const f = d as LogData["nutrition-log"];
      return {
        nutritionLog: {
          interval: interval(ts, ts + 1, tz),
          // An anonymous food needs a display name; without one it is Fitbit's "Quick calories".
          foodDisplayName: f.name ?? "Quick calories",
          mealType: f.meal,
          energy: { kcal: f.kcal },
          ...(f.carbs != null && { totalCarbohydrate: { grams: f.carbs } }),
          ...(f.fat != null && { totalFat: { grams: f.fat } }),
          ...(f.protein != null && { nutrients: [{ nutrient: "PROTEIN", quantity: { grams: f.protein } }] }),
        },
      };
    }
    case "weight":
      return { weight: { sampleTime: sample(ts, tz), weightGrams: Math.round((d as LogData["weight"]).kg * 1000) } };
    case "body-fat":
      return { bodyFat: { sampleTime: sample(ts, tz), percentage: (d as LogData["body-fat"]).pct } };
    case "moods": {
      const m = d as LogData["moods"];
      return { moods: { sampleTime: sample(ts, tz), moods: m.moods, ...(m.valence && { valences: [m.valence] }) } };
    }
    case "symptoms":
      return { symptoms: { sampleTime: sample(ts, tz), symptoms: (d as LogData["symptoms"]).symptoms } };
    case "menstrual-period": {
      const p = d as LogData["menstrual-period"];
      // Whole local days: from the first day's midnight to the last second of the last day. Google wants an end on
      // every period; an ongoing one ends today and is logged again (or deleted and re-logged) once it is over.
      const start = fromWall(`${p.start}T00:00`, tz);
      const end = localMidnight(addDays(p.end, 1), tz) - 1;
      return { menstrualPeriod: { interval: interval(start, end, tz), ...(p.flow && { notes: `Flow: ${p.flow.toLowerCase()}` }) } };
    }
    case "ovulation-test":
      return { ovulationTest: { sampleTime: sample(ts, tz), result: (d as LogData["ovulation-test"]).result } };
  }
  throw new Error(`unknown log type ${type satisfies never}`);
}
