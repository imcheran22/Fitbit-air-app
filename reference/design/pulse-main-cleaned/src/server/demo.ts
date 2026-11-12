// The demo user (demo instances, and `pnpm seed:demo` on a real one). No Next imports, so scripts can use it.
// Its data is generated, so its password protects nothing; it only lets "Continue with demo data" sign in through
// the normal path. A demo instance signs sessions with DEMO_SECRET for the same reason.
export const DEMO_EMAIL = "demo@pulse.local";
export const DEMO_PASSWORD = "pulse-demo-generated-data";
export const DEMO_SECRET = "pulse-demo-instance-generated-data-only";
