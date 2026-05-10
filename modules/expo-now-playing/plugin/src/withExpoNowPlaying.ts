import { ConfigPlugin, withAndroidManifest } from '@expo/config-plugins';

const SERVICE_NAME = 'expo.modules.nowplaying.NowPlayingService';

const withExpoNowPlaying: ConfigPlugin = injectServiceIntoMainManifest();

function injectServiceIntoMainManifest(): ConfigPlugin {
  return (config) =>
    withAndroidManifest(config, (cfg) => {
      const app = cfg.modResults.manifest.application?.[0];
      if (!app) return cfg;
      app.service = app.service || [];
      const exists = app.service.some(
        (s: any) => s.$['android:name'] === SERVICE_NAME
      );
      if (!exists) {
        app.service.push({
          $: {
            'android:name': SERVICE_NAME,
            'android:exported': 'false',
            'android:foregroundServiceType': 'mediaPlayback',
          },
          'intent-filter': [
            {
              action: [
                { $: { 'android:name': 'androidx.media3.session.MediaSessionService' } },
              ],
            },
          ],
        });
      }
      return cfg;
    });
}

export default withExpoNowPlaying;
