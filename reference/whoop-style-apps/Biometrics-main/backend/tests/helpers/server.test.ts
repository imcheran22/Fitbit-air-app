import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import request from 'supertest';
import { testServer } from './server';

// Another local process's server: IPv4-only, answers 200 to anything.
function foreignServer(): http.Server {
  return http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('foreign');
  });
}

// Starts a foreign server on 127.0.0.1:port; resolves null if the OS refuses
// the address (it is taken).
function occupy(port: number): Promise<http.Server | null> {
  const server = foreignServer();
  return new Promise((resolve) => {
    server.once('error', () => resolve(null));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function close(server: http.Server | null): Promise<void> {
  return new Promise((resolve) => (server?.listening ? server.close(() => resolve()) : resolve()));
}

function portOf(server: unknown): number {
  return ((server as http.Server).address() as AddressInfo).port;
}

const app = express();
app.get('/whoami', (_req, res) => {
  res.status(401).send('our app');
});

describe('testServer', () => {
  it('reaches our app, not a foreign 127.0.0.1 listener started first', async () => {
    const foreign = await occupy(0);
    try {
      const server = await testServer(app);
      expect(server.address()).toMatchObject({ address: '127.0.0.1' });
      expect(portOf(server)).not.toBe(portOf(foreign));
      const res = await request(server).get('/whoami');
      expect(res.status).toBe(401);
      expect(res.text).toBe('our app');
    } finally {
      await close(foreign);
    }
  });

  // Forces the collision behind the old flakes: a foreign process holding
  // 127.0.0.1 on the same port as the test's server. With supertest's own
  // listen(0) (dual-stack ::) macOS lets the foreign bind succeed and the
  // request goes to it; on 127.0.0.1 the OS refuses the foreign bind.
  it('keeps the port to itself when a foreign listener tries to take 127.0.0.1 on the same port', async () => {
    const server = await testServer(app);
    const foreign = await occupy(portOf(server));
    try {
      expect(foreign).toBeNull();
      const res = await request(server).get('/whoami');
      expect(res.status).toBe(401);
      expect(res.text).toBe('our app');
    } finally {
      await close(foreign);
    }
  });
});
