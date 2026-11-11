import { router } from "expo-router";
import { ConnectFlow } from "@/screens/onboarding/Connect";

// `/connect`: leaving sample data for the person's own (docs/onboarding.md). Opened by the Sample data card and by
// Settings' Connect while the sample is loaded. Health Connect's permissions come first, so a refused sheet keeps the
// sample; once granted the app state clears it and onboarding shows the import (or the profile step first).
export default function Connect() {
  return <ConnectFlow sample onCancel={() => router.back()} />;
}
