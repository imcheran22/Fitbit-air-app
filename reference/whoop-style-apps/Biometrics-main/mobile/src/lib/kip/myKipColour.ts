import { useSyncExternalStore } from 'react';
import { fetchIdentity } from '../../api/buddies';
import { saveKipColour } from '../../api/kip';
import { DEFAULT_KIP_COLOUR, type KipColour } from './kipArt';
import { kipColourOf } from './kipColour';

// Your KIP's colour (spec 2026-10-13 KIP colour §3): loaded once per sign-in by MyKipColourScope (and again by the
// picker if that read failed), coral until then or when the read fails, updated by a save, and forgotten on sign-out
// so the next account starts fresh.

let colour: KipColour = DEFAULT_KIP_COLOUR;
let epoch = 0;
let loadFailed = false;
const listeners = new Set<() => void>();

function publish(next: KipColour): void {
  colour = next;
  listeners.forEach((l) => l());
}

export function getMyKipColour(): KipColour {
  return colour;
}

/** Whether the last read failed, so the picker can try again rather than show coral as saved. */
export function myKipColourLoadFailed(): boolean {
  return loadFailed;
}

export async function loadMyKipColour(): Promise<void> {
  const at = epoch;
  try {
    const identity = await fetchIdentity();
    if (at !== epoch) return;
    loadFailed = false;
    publish(kipColourOf(identity?.kipColour));
  } catch {
    // Keep what is shown; the next sign-in, save or visit to the picker tries again.
    if (at === epoch) loadFailed = true;
  }
}

// Every write moves the epoch, so a read already in flight can't land over it.
export function setMyKipColour(next: KipColour): void {
  epoch++;
  loadFailed = false;
  publish(next);
}

/** Saves to the server, then shows it everywhere unless you signed out meanwhile. Throws when the save fails. */
export async function saveMyKipColour(next: KipColour): Promise<void> {
  const at = epoch;
  await saveKipColour(next);
  if (at === epoch) setMyKipColour(next);
}

export function resetMyKipColour(): void {
  epoch++;
  loadFailed = false;
  publish(DEFAULT_KIP_COLOUR);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMyKipColour(): KipColour {
  return useSyncExternalStore(subscribe, getMyKipColour, getMyKipColour);
}
