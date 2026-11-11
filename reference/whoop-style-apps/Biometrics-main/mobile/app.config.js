// Dynamic Expo config. It is app.json plus, optionally, push notifications.
//
// Push is OFF by default because the `expo-notifications` config plugin adds
// the `aps-environment` entitlement, and Xcode refuses to sign an app with that
// entitlement on a free personal Apple team. Leaving it out keeps ordinary
// builds working; the runtime code (src/lib/pushRegistration.ts) reports
// "Notifications aren't available in this build" instead of failing.
//
// To enable push:
//   1. Use a paid Apple Developer team.
//   2. Put an EAS project id in app.json at expo.extra.eas.projectId (needed to
//      obtain an Expo push token).
//   3. Regenerate the native project with the plugin on:
//        EXPO_PUSH=1 npx expo prebuild --platform ios
//      The variable is read at prebuild time only; without it the plugin is not
//      added.
const appJson = require('./app.json');

module.exports = () => {
  // Copied so the shared app.json module is never mutated between calls.
  const config = { ...appJson.expo, plugins: [...(appJson.expo.plugins ?? [])] };
  if (process.env.EXPO_PUSH === '1') config.plugins.push('expo-notifications');
  return config;
};
