import { describe, expect, it } from "vitest";
import { FACES, hasColorClass, readFont } from "./fontClasses";

const base = { family: "sans", weight: "regular" } as const;

describe("readFont", () => {
  it("takes the family and weight off the classes and leaves the rest", () => {
    const r = readFont("font-numeric text-xl font-bold leading-6", base);
    expect(r.face).toEqual({ family: "numeric", weight: "bold" });
    expect(r.rest).toBe("text-xl leading-6");
    expect(FACES[r.face.family][r.face.weight]).toBe("Barlow_700Bold");
  });
  it("inherits what it does not name", () => {
    expect(readFont("text-[13px] font-semibold", { family: "numeric", weight: "bold" }).face).toEqual({ family: "numeric", weight: "semibold" });
    expect(readFont("text-xs", { family: "numeric", weight: "bold" }).face).toEqual({ family: "numeric", weight: "bold" });
  });
  it("reads truncate and line-clamp as a line count", () => {
    expect(readFont("truncate text-sm", base).lines).toBe(1);
    expect(readFont("line-clamp-2", base).lines).toBe(2);
    expect(readFont("text-sm", base).lines).toBeUndefined();
  });
  it("shrinks like a CSS flex item unless the classes say otherwise", () => {
    expect(readFont("text-sm", base).shrink).toBe(1);
    expect(readFont("text-sm whitespace-nowrap", base)).toMatchObject({ shrink: 0, rest: "text-sm" });
    for (const c of ["shrink-0", "shrink", "flex-1", "min-w-0 flex-1", "flex-none"]) expect(readFont(c, base).shrink).toBeUndefined();
  });
  it("maps Barlow's regular to its 500 face, as the web loads it", () => {
    expect(FACES.numeric.regular).toBe("Barlow_500Medium");
  });
});

describe("hasColorClass", () => {
  it("tells colour classes from size classes", () => {
    for (const c of ["text-muted-foreground", "text-foreground/85", "text-optimal-text", "dark:text-on-media", "text-[#fff]", "text-foreground/[0.045]"]) expect(hasColorClass(c)).toBe(true);
    for (const c of ["text-xs", "text-[15px]", "text-center", "text-balance", "font-bold", "text-2xl"]) expect(hasColorClass(c)).toBe(false);
  });
  it("finds one among many", () => {
    expect(hasColorClass("text-xs font-bold text-recovery-red-text uppercase")).toBe(true);
  });
});
