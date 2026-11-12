import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrendChart, type TrendPoint } from "./TrendChart";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/strain", useSearchParams: () => new URLSearchParams() }));

afterEach(() => {
  vi.restoreAllMocks();
  document.querySelector("#recharts_measurement_span")?.remove();
});

const STACK = [
  { key: "resting", label: "Resting", color: "var(--energy-resting)" },
  { key: "active", label: "Active", color: "var(--energy-active)" },
];
const chart = (last: TrendPoint) => {
  const points: TrendPoint[] = [{ date: "2026-09-30", value: 2000, parts: { resting: 1600, active: 400 } }, last];
  return render(
    <TrendChart label="Calories burned" unit="kcal" format="grouped" colorBy="single" stack={STACK} headline="day" ranges={["w", "m"]} defaultRange="w" data={{ value: points, reason: null, provisional: false }} />,
  );
};

describe("TrendChart stack", () => {
  it("heads with the last day's total and its split, active first", () => {
    chart({ date: "2026-10-01", value: 2150, parts: { resting: 1700, active: 450 } });
    expect(screen.getByText("2,150")).toBeInTheDocument();
    const legend = screen.getByText("Active").parentElement!;
    expect(legend.textContent).toBe("Active450Resting1,700");
    expect(screen.queryByText("Average")).not.toBeInTheDocument();
  });

  it("scrubs the card header with keyboard arrows without a floating duplicate", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 200));
    const { container } = render(
      <TrendChart label="Calories burned" unit="kcal" format="grouped" colorBy="single" stack={STACK} headline="day" defaultRange="w" data={{ value: [
        { date: "2026-09-29", value: 1900, parts: { resting: 1600, active: 300 } },
        { date: "2026-09-30", value: 2000, parts: { resting: 1600, active: 400 } },
        { date: "2026-10-01", value: 2150, parts: { resting: 1700, active: 450 } },
      ], reason: null, provisional: false }} />,
    );
    const plot = screen.getByRole("application");
    fireEvent.focus(plot);
    fireEvent.keyDown(plot, { key: "ArrowRight" });
    await waitFor(() => expect(container.querySelector("[aria-live=polite]")).toHaveTextContent("2,000"));
    expect(container.querySelector("[aria-live=polite]")).toHaveTextContent("Active400");
    expect(container.querySelector(".recharts-tooltip-wrapper")?.textContent).toBe("");
  });

  it("keeps the provisional label beside the selected day's value", () => {
    chart({ date: "2026-10-01", value: 2150, provisional: true, parts: { resting: 1700, active: 450 } });
    expect(screen.getByText("So far")).toBeInTheDocument();
    expect(screen.getByText("2,150")).toBeInTheDocument();
  });

  it("says no breakdown for a day with a total but no parts", () => {
    chart({ date: "2026-10-01", value: 2150, parts: null });
    expect(screen.getByText("2,150")).toBeInTheDocument();
    expect(screen.getByText("No breakdown for this day")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });
});
