"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("@expo/config-plugins");
const SERVICE_NAME = 'expo.modules.nowplaying.NowPlayingService';
const withExpoNowPlaying = injectServiceIntoMainManifest();
function injectServiceIntoMainManifest() {
    return (config) => (0, config_plugins_1.withAndroidManifest)(config, (cfg) => {
        var _a;
        const app = (_a = cfg.modResults.manifest.application) === null || _a === void 0 ? void 0 : _a[0];
        if (!app)
            return cfg;
        app.service = app.service || [];
        const exists = app.service.some((s) => s.$['android:name'] === SERVICE_NAME);
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
exports.default = withExpoNowPlaying;
