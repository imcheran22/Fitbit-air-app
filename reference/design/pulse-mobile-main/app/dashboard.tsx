import { useLocalSearchParams } from "expo-router";
import { EditDashboardPage } from "@/screens/home/EditDashboard";

// Home's My Dashboard editor, a full-screen sheet opened by CUSTOMIZE (src/screens/home/EditDashboard.tsx).
export default function Dashboard() {
  const { keys, empty } = useLocalSearchParams<{ keys?: string; empty?: string }>();
  return <EditDashboardPage keys={keys} empty={empty} />;
}
