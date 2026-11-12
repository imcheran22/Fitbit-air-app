export interface Source {
  /** Writes the user's new data into the normalized tables. `changed` is true when any row was inserted or updated. */
  pull(userId: number): Promise<{ changed: boolean }>;
  /** A quick heart-rate-only pull for the live heart-rate view. A source without one (the seed) has nothing to fetch. */
  pullHeartRate?(userId: number): Promise<void>;
}
