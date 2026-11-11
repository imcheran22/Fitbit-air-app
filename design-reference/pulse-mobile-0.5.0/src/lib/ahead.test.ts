import { expect, it } from "vitest";
import { readAhead } from "./ahead";

it("hands results back in order, with at most `limit` running, whatever order they finish in", async () => {
  let running = 0;
  let most = 0;
  const take = readAhead(10, 4, async (i) => {
    most = Math.max(most, ++running);
    await new Promise((r) => setTimeout(r, (10 - i) * 2)); // later ones finish first
    running--;
    return i;
  });
  const got: number[] = [];
  for (let i = 0; i < 10; i++) got.push(await take(i));
  expect(got).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(most).toBe(4);
});
