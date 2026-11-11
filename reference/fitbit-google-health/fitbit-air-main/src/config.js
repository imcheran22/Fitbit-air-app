// Central configuration, loaded from environment variables with sane defaults.
// We intentionally avoid a dotenv dependency: if a `.env` file exists we parse
// it ourselves (tiny, dependency-free) so `npm install` stays lean.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function loadDotEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

export const config = {
  rootDir,
  server: {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || '127.0.0.1',
  },
  ble: {
    // Case-insensitive substring match against the advertised local name.
    nameFilter: (process.env.BLE_NAME_FILTER || '').trim(),
    // Exact match against peripheral.address or peripheral.id.
    addressFilter: (process.env.BLE_ADDRESS_FILTER || '').trim().toLowerCase(),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI || 'http://127.0.0.1:3000/oauth/callback',
    tokenFile: path.join(rootDir, '.google-tokens.json'),
  },
};

export function googleConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}
