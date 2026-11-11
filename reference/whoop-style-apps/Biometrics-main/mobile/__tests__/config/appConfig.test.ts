const appJson = require('../../app.json');
const buildConfig = require('../../app.config.js');

const ORIGINAL = process.env.EXPO_PUSH;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUSH;
  else process.env.EXPO_PUSH = ORIGINAL;
});

describe('app.config.js', () => {
  it('leaves the expo-notifications plugin out by default', () => {
    delete process.env.EXPO_PUSH;
    expect(buildConfig().plugins).not.toContain('expo-notifications');
  });

  it('leaves it out for any EXPO_PUSH value other than 1', () => {
    process.env.EXPO_PUSH = '0';
    expect(buildConfig().plugins).not.toContain('expo-notifications');
    process.env.EXPO_PUSH = 'true';
    expect(buildConfig().plugins).not.toContain('expo-notifications');
  });

  it('adds the plugin when EXPO_PUSH=1', () => {
    process.env.EXPO_PUSH = '1';
    expect(buildConfig().plugins).toContain('expo-notifications');
  });

  it('is exactly app.json by default', () => {
    delete process.env.EXPO_PUSH;
    expect(buildConfig()).toEqual(appJson.expo);
  });

  it('only appends to the plugin list, keeping every other key and plugin', () => {
    process.env.EXPO_PUSH = '1';
    const { plugins, ...rest } = buildConfig();
    const { plugins: basePlugins, ...baseRest } = appJson.expo;
    expect(rest).toEqual(baseRest);
    expect(plugins).toEqual([...basePlugins, 'expo-notifications']);
  });

  // The recap export only adds images (writeOnly), which on Android 13+ needs no READ_MEDIA_* grant;
  // the plugin's default would declare photo, video and audio read access.
  it('declares no Android media read permissions for expo-media-library', () => {
    const entry = buildConfig().plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-media-library');
    expect(entry[1].granularPermissions).toEqual([]);
  });

  it('does not mutate the shared app.json content between calls', () => {
    process.env.EXPO_PUSH = '1';
    buildConfig();
    delete process.env.EXPO_PUSH;
    expect(buildConfig().plugins).toEqual(appJson.expo.plugins);
    expect(appJson.expo.plugins).not.toContain('expo-notifications');
  });
});
