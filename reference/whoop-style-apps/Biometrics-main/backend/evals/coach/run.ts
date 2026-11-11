// `npm run eval:coach`: runs the coach eval suite against the database named by
// DATABASE_URL (each fixture uses a throwaway user that is deleted afterwards)
// and exits non-zero on any failure. No network, no model: the provider is a
// ScriptedStreamProvider driving the real answer pipeline. The same suite is
// CI-gated by tests/coach/evals.test.ts.
//
// Output is fixture ids, categories, check names and messages that quote only
// the fixture's own text; it never prints a user's data.

import { prisma } from '../../src/db/client';
import { NEGATIVE_FIXTURES, FIXTURES } from './fixtures';
import { runEval } from './runner';

async function main(): Promise<number> {
  const report = await runEval(FIXTURES, NEGATIVE_FIXTURES);

  for (const r of report.results) {
    console.log(`${r.passed ? 'PASS' : 'FAIL'}  [${r.category}] ${r.id}`);
    for (const f of r.failures) console.log(`        - ${f.check}: ${f.message}`);
  }
  for (const n of report.negatives) {
    console.log(`${n.caught ? 'CAUGHT' : 'MISSED'}  [must-fail: ${n.mustFailCheck}] ${n.id}`);
    if (!n.caught) for (const f of n.failures) console.log(`        - ${f.check}: ${f.message}`);
  }

  const passed = report.results.filter((r) => r.passed).length;
  const caught = report.negatives.filter((n) => n.caught).length;
  console.log(`\n${passed}/${report.results.length} fixtures passed, ${caught}/${report.negatives.length} must-fail fixtures caught`);
  return report.ok ? 0 : 1;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error(err instanceof Error ? err.name : 'eval_failed');
    await prisma.$disconnect();
    process.exit(1);
  });
