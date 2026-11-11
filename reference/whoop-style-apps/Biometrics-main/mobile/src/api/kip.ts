import { send } from './buddies';
import { apiFetch } from './client';
import type { KipColour } from '../lib/kip/kipArt';

export const saveKipColour = (colour: KipColour) => apiFetch<{ kipColour: string }>('/me/kip-colour', send('PUT', { colour }));
