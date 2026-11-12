export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrateDb } = await import("./server/db");
    const { startWorker } = await import("./server/worker");
    try {
      await migrateDb(); // validates config and applies migrations at boot, retrying while Postgres starts
    } catch (err) {
      console.error(err);
      process.exit(1); // refuse to run (KTD13); Next would otherwise stay up serving 500s
    }
    startWorker();
  }
}
