import { Redirect } from "expo-router";

/** A development route in a release build: it sends the person home. */
export function NotInRelease() {
  return <Redirect href="/" />;
}
