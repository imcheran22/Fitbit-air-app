// In-memory session + reading store.
//
// A "session" is one continuous stretch of heart-rate streaming (e.g. a
// workout). We keep the current live state plus a rolling buffer of recent
// readings so a dashboard that connects mid-session can back-fill its chart.
// Everything lives in memory — restart the server and it resets. For durable
// history, use the Google Health API side of this project.

import { randomUUID } from 'node:crypto';

const MAX_BUFFER = 3600; // ~1 hour at 1 reading/sec

export class SessionStore {
  constructor() {
    this.sessions = new Map();
    this.currentId = null;
    this.buffer = []; // rolling recent readings for the active session
    this.device = null;
    this.status = 'idle';
    this.lastReading = null;
  }

  startSession(device) {
    const id = randomUUID();
    const session = {
      id,
      device: device || null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      count: 0,
      minBpm: null,
      maxBpm: null,
      sumBpm: 0,
    };
    this.sessions.set(id, session);
    this.currentId = id;
    this.buffer = [];
    this.device = device || null;
    return session;
  }

  endSession() {
    const session = this.sessions.get(this.currentId);
    if (session && !session.endedAt) session.endedAt = new Date().toISOString();
    this.currentId = null;
  }

  addReading(reading) {
    if (!this.currentId) this.startSession(this.device);
    const session = this.sessions.get(this.currentId);
    session.count += 1;
    session.sumBpm += reading.bpm;
    session.minBpm = session.minBpm === null ? reading.bpm : Math.min(session.minBpm, reading.bpm);
    session.maxBpm = session.maxBpm === null ? reading.bpm : Math.max(session.maxBpm, reading.bpm);

    this.lastReading = reading;
    this.buffer.push(reading);
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
  }

  setStatus(status) {
    this.status = status;
  }

  setDevice(device) {
    this.device = device;
  }

  summary(session) {
    const s = session || this.sessions.get(this.currentId);
    if (!s) return null;
    return {
      ...s,
      avgBpm: s.count ? Math.round(s.sumBpm / s.count) : null,
    };
  }

  snapshot() {
    return {
      status: this.status,
      device: this.device,
      lastReading: this.lastReading,
      session: this.summary(),
      recent: this.buffer.slice(-120), // last ~2 minutes
    };
  }

  listSessions() {
    return [...this.sessions.values()].map((s) => this.summary(s));
  }
}
