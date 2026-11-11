// HTTP (REST) + WebSocket server.
//
// - Serves the live dashboard from /public.
// - REST API under /api for one-shot reads and Google Health data.
// - WebSocket at /ws pushes every heart-rate reading and status change in
//   real time to all connected clients.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';

import { config, googleConfigured } from '../config.js';
import { logger } from '../util/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../../public');

/**
 * @param {object} deps
 * @param {import('./sessions.js').SessionStore} deps.store
 * @param {import('../ble/heartRate.js').HeartRateMonitor} deps.monitor
 * @param {import('../google-health/client.js').GoogleHealthClient} [deps.google]
 */
export function createServer({ store, monitor, google }) {
  const app = express();
  app.use(express.json());
  app.use(express.static(publicDir));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // ---- WebSocket broadcast plumbing ------------------------------------
  function broadcast(type, payload) {
    const msg = JSON.stringify({ type, payload, at: new Date().toISOString() });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg);
    }
  }

  wss.on('connection', (ws) => {
    logger.info(`[ws] client connected (${wss.clients.size} total)`);
    // Send the current snapshot so a late joiner can render immediately.
    ws.send(JSON.stringify({ type: 'snapshot', payload: store.snapshot(), at: new Date().toISOString() }));
    ws.on('close', () => logger.info(`[ws] client disconnected (${wss.clients.size} total)`));
  });

  // ---- Wire BLE monitor events into the store + WebSocket --------------
  monitor.on('status', ({ status }) => {
    store.setStatus(status);
    if (status === 'streaming') store.startSession(store.device);
    if (status === 'disconnected') store.endSession();
    broadcast('status', { status, device: store.device });
  });
  monitor.on('connected', (device) => {
    store.setDevice(device);
    broadcast('device', device);
  });
  monitor.on('battery', (pct) => broadcast('battery', pct));
  monitor.on('sensorLocation', (loc) => broadcast('sensorLocation', loc));
  monitor.on('heartRate', (reading) => {
    store.addReading(reading);
    broadcast('heartRate', reading);
  });
  monitor.on('error', (err) => broadcast('error', { message: err.message }));

  // ---- REST API --------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, googleConfigured: googleConfigured() });
  });

  app.get('/api/status', (_req, res) => res.json(store.snapshot()));
  app.get('/api/heart-rate/live', (_req, res) => res.json(store.lastReading || { bpm: null }));
  app.get('/api/sessions', (_req, res) => res.json(store.listSessions()));

  // Google Health endpoints (steps, heart-rate history). These require the
  // OAuth flow in docs/GOOGLE_HEALTH_SETUP.md to have been completed.
  app.get('/api/steps', async (req, res) => {
    if (!google) return res.status(501).json({ error: 'Google Health not configured' });
    try {
      const date = req.query.date || undefined;
      res.json(await google.getSteps(date));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/api/heart-rate/history', async (req, res) => {
    if (!google) return res.status(501).json({ error: 'Google Health not configured' });
    try {
      res.json(await google.getHeartRate(req.query.date || undefined));
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // OAuth callback used by the loopback flow.
  app.get('/oauth/callback', async (req, res) => {
    if (!google) return res.status(501).send('Google Health not configured.');
    try {
      await google.handleCallback(req.query);
      res.send('Google Health authorized. You can close this tab and return to the terminal.');
    } catch (err) {
      res.status(400).send(`OAuth error: ${err.message}`);
    }
  });

  function listen() {
    return new Promise((resolve) => {
      server.listen(config.server.port, config.server.host, () => {
        const url = `http://${config.server.host}:${config.server.port}`;
        logger.info(`[server] dashboard:  ${url}`);
        logger.info(`[server] websocket:  ${url.replace('http', 'ws')}/ws`);
        resolve(server);
      });
    });
  }

  return { app, server, wss, listen, broadcast };
}
