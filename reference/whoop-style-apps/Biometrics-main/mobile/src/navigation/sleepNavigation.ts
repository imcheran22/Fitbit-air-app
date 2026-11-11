// The only named targets for the Sleep page (spec §5): no other caller names the route, except the notification
// handler (navigationRef) and the page's own setParams. A plain navigate updates an open Sleep page's params.
type Nav = { navigate: (...args: any[]) => void };

export function openSleep(navigation: Nav, date?: string): void {
  navigation.navigate('Sleep', date ? { date } : undefined);
}

/** "Open this night" (the Recovery Last night tile, the Activity calendar). */
export function openNight(navigation: Nav, date: string): void {
  openSleep(navigation, date);
}
