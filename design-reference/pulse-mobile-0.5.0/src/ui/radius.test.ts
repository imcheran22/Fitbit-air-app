import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { RADIUS } from "./radius";

it("RADIUS equals the borderRadius scale of tailwind.config.js", () => {
  const config = readFileSync(new URL("../../tailwind.config.js", import.meta.url), "utf8");
  const scale = /borderRadius: \{([^}]*)\}/.exec(config)?.[1] ?? "";
  for (const [name, px] of Object.entries(RADIUS)) expect(scale).toContain(`${/^[a-z]+$/.test(name) ? name : `"${name}"`}: "${px}px"`);
});
