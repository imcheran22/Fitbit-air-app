import http from 'http';
import type { RequestListener } from 'http';

// Why this exists: given an app, supertest calls `server.listen(0)`, which
// binds the dual-stack wildcard `::`, and then sends the request to
// 127.0.0.1:<port>. On macOS the kernel can hand that wildcard a port that
// another local process already holds on 127.0.0.1 (Ollama, llama-server, ...),
// and the more specific IPv4 binding wins, so the test talks to the other
// server. Binding 127.0.0.1 ourselves makes the kernel pick a port that is
// free on that exact address, so the request can only reach our app.
//
// supertest only closes servers it started itself; a server passed in that is
// already listening is left open. Every server made here is closed in an
// afterAll hook that importing this module registers in the test file.

const open = new Set<http.Server>();

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

afterAll(async () => {
  const servers = [...open];
  open.clear();
  await Promise.all(servers.map(close));
});

/**
 * The app behind a fresh HTTP server listening on 127.0.0.1 (an ephemeral
 * port), ready to pass to supertest: `request(await testServer(app))`.
 * Closed automatically after the test file's last test.
 */
export function testServer(app: RequestListener): Promise<http.Server> {
  const server = http.createServer(app);
  open.add(server);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
