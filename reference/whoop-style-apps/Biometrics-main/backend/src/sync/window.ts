// Fetch and backfill windows are half-open [start, end) in YYYY-MM-DD form:
// `dataPoints.list` filters on `>= start AND < end`, and dailyRollUp retrieves
// the `start` bucket with end = start + 1 (see handleFetchJob in worker.ts).
// So a window contains no days unless its start is strictly before its end.
//
// Google does not answer an empty window with an empty list: for the daily
// HRV collection it answers 400, which used to fail a whole backfill job for
// a request that had nothing to fetch. Callers use this to skip such a window
// instead of sending it.
//
// ISO dates compare correctly as plain strings.
export function isEmptyWindow(startDate: string, endDate: string): boolean {
  return startDate >= endDate;
}
