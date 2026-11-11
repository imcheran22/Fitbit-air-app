import net from 'net';
import express from 'express';
import type { Server } from 'http';
import { describeListenError, listenOrExit } from '../src/listen';

// Occupies a free port so a second listen on it fails the way it does when an
// older backend is still running.
function occupyPort(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, () => resolve({ server, port: (server.address() as net.AddressInfo).port }));
  });
}

function close(server: net.Server | Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('listenOrExit', () => {
  // Regression: Express 5 passes a listen error to the listen callback, and the
  // old server.ts callback ignored its argument, so a second backend started
  // while the first still owned the port printed "Backend listening" and kept
  // running (with its queue workers) without serving anything.
  it('reports the failure and exits instead of pretending to listen when the port is taken', async () => {
    const { server: occupier, port } = await occupyPort();
    const onListening = jest.fn();
    const log = jest.fn();
    let exited!: (code: number) => void;
    const exitCalled = new Promise<number>((resolve) => (exited = resolve));

    listenOrExit(express(), port, { onListening, log, exit: (code) => exited(code) });

    await expect(exitCalled).resolves.toBe(1);
    expect(onListening).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain(String(port));
    expect(String(log.mock.calls[0][0])).toMatch(/already in use/i);
    await close(occupier);
  });

  it('runs onListening once, and does not exit, when the port is free', async () => {
    const exit = jest.fn();
    let listening!: () => void;
    const started = new Promise<void>((resolve) => (listening = resolve));
    const onListening = jest.fn(() => listening());

    const server = listenOrExit(express(), 0, { onListening, log: jest.fn(), exit });
    await started;

    expect(onListening).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    await close(server);
  });

  it('does not start background work (onListening) before the port is actually bound', async () => {
    const { server: occupier, port } = await occupyPort();
    const order: string[] = [];
    let exited!: () => void;
    const exitCalled = new Promise<void>((resolve) => (exited = resolve));

    listenOrExit(express(), port, {
      onListening: () => order.push('listening'),
      log: () => order.push('log'),
      exit: () => {
        order.push('exit');
        exited();
      },
    });

    await exitCalled;
    expect(order).toEqual(['log', 'exit']);
    await close(occupier);
  });
});

describe('describeListenError', () => {
  const withCode = (code: string, message = 'boom') => Object.assign(new Error(message), { code });

  it('explains a port conflict and how to find the other process', () => {
    const text = describeListenError(withCode('EADDRINUSE'), 3000);
    expect(text).toMatch(/port 3000 is already in use/i);
    expect(text).toContain('lsof');
  });

  it('explains a permission problem', () => {
    expect(describeListenError(withCode('EACCES'), 80)).toMatch(/permission/i);
  });

  it('falls back to the underlying message for anything else', () => {
    const text = describeListenError(withCode('EWHATEVER', 'something odd'), 3000);
    expect(text).toContain('3000');
    expect(text).toContain('something odd');
  });
});
