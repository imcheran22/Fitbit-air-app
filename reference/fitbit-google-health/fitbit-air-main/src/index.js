// Main entry point: start the BLE heart-rate monitor + the REST/WebSocket
// server + dashboard. Run with `npm start`.

import { config, googleConfigured } from './config.js';
import { logger } from './util/logger.js';
import { HeartRateMonitor } from './ble/heartRate.js';
import { SessionStore } from './server/sessions.js';
import { createServer } from './server/server.js';
import { GoogleHealthClient } from './google-health/client.js';

async function main() {
  const store = new SessionStore();

  const monitor = new HeartRateMonitor({
    nameFilter: config.ble.nameFilter,
    addressFilter: config.ble.addressFilter,
    autoReconnect: true,
  });

  const google = googleConfigured() ? new GoogleHealthClient() : null;
  if (!google) {
    logger.info('[google] not configured — steps/history endpoints disabled (BLE still works).');
  }

  const { listen } = createServer({ store, monitor, google });
  await listen();

  logger.info('[main] starting Bluetooth scan. On the Fitbit Air, enable heart-rate sharing');
  logger.info('[main] ("HR on equipment" / share real-time heart rate) so it starts advertising.');
  await monitor.start();

  const shutdown = async () => {
    logger.info('\n[main] shutting down...');
    await monitor.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('[main] fatal:', err);
  process.exit(1);
});
