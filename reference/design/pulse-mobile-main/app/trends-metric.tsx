import { useLocalSearchParams } from "expo-router";
import { MetricPageBody } from "@/screens/trends/MetricPage";

// The Trends metric picker, opened from the picker row on /trends (src/screens/trends/MetricPage.tsx).
export default function TrendsMetric() {
  const { current, r } = useLocalSearchParams<{ current?: string; r?: string }>();
  return <MetricPageBody current={current} r={r} />;
}
