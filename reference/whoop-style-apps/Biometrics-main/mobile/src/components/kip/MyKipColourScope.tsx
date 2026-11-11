import { useEffect } from 'react';
import { loadMyKipColour, resetMyKipColour } from '../../lib/kip/myKipColour';

// Mounted once inside the signed-in navigator: loads your KIP colour; signing out unmounts it and forgets it.
export function MyKipColourScope() {
  useEffect(() => {
    void loadMyKipColour();
    return () => resetMyKipColour();
  }, []);
  return null;
}
