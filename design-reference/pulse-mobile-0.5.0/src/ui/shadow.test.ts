import { describe, expect, it, vi } from "vitest";
import { DARK, LIGHT } from "./palette";
import { boxShadow, edge, ring } from "./shadow";

vi.mock("./theme", () => ({ useTheme: () => ({}) }));

// The strings each site typed by hand before the shadow tokens: the helper must write exactly these.
describe("boxShadow writes what the sites wrote by hand", () => {
  it("card: the light shadow alone, the dark lit edge alone", () => {
    expect(boxShadow("light", edge(LIGHT["card-edge"]), "card")).toBe("0 1px 2px rgba(16, 21, 24, 0.05), 0 0 0 1px rgba(16, 21, 24, 0.05)");
    expect(boxShadow("dark", edge(DARK["card-edge"]), "card")).toBe("inset 0 1px 0 rgba(255, 255, 255, 0.06)");
    expect(boxShadow("dark", edge(DARK["card-edge"]), "card", ring("red"))).toBe("inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 0 0 1px red");
  });
  it("overlay panels: ring then overlay shadow", () => {
    expect(boxShadow("light", ring(LIGHT["overlay-ring"], { inset: false }), "overlay")).toBe("0 0 0 1px rgba(16, 21, 24, 0.1), 0 8px 24px rgba(16, 21, 24, 0.14)");
    expect(boxShadow("dark", ring(DARK["overlay-ring"]), "overlay")).toBe("inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 8px 24px rgba(0, 0, 0, 0.45)");
    expect(boxShadow("dark", ring(DARK["popover-ring"]), "overlay")).toBe("inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 8px 24px rgba(0, 0, 0, 0.45)");
    expect(boxShadow("light", ring(LIGHT.border), "overlay")).toBe("inset 0 0 0 1px rgba(16, 21, 24, 0.1), 0 8px 24px rgba(16, 21, 24, 0.14)");
  });
  it("glass, thumb, lifted row and toast", () => {
    expect(boxShadow("dark", "glass")).toBe("0 10px 30px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.35)");
    expect(boxShadow("light", "glass")).toBe("0 10px 30px rgba(16, 21, 24, 0.12), 0 2px 6px rgba(16, 21, 24, 0.08)");
    expect(boxShadow("light", edge(LIGHT["glass-edge"]), ring(LIGHT["glass-rim"]))).toBe("inset 0 1px 0 rgba(255, 255, 255, 0.9), inset 0 0 0 1px rgba(16, 21, 24, 0.06)");
    expect(boxShadow("dark", "thumb")).toBe("0 1px 3px rgba(0, 0, 0, 0.4)");
    expect(boxShadow("light", "thumb")).toBe("0 1px 3px rgba(16, 21, 24, 0.3)");
    for (const s of ["light", "dark"] as const) {
      expect(boxShadow(s, "lifted")).toBe("0 8px 24px rgba(0, 0, 0, 0.35)");
      expect(boxShadow(s, "toast")).toBe("0 4px 12px rgba(0, 0, 0, 0.1)");
    }
  });
  it("rings of other widths, outside the edge", () => {
    expect(ring("#fff", { width: 2, inset: false })).toBe("0 0 0 2px #fff");
    expect(ring("#fff", { width: 2 })).toBe("inset 0 0 0 2px #fff");
  });
});
