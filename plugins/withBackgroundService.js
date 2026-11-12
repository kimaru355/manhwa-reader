const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * Lets react-native-background-actions run as a "data sync" foreground service, which Android 14+
 * requires to be declared, and adds the permissions it needs (including the notification it shows).
 */
module.exports = function withBackgroundService(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const wanted = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
    ];
    manifest['uses-permission'] = manifest['uses-permission'] ?? [];
    for (const name of wanted) {
      if (!manifest['uses-permission'].some((p) => p.$['android:name'] === name)) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service ?? [];
    const name = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
    app.service = app.service.filter((s) => s.$['android:name'] !== name);
    app.service.push({
      $: {
        'android:name': name,
        'android:foregroundServiceType': 'dataSync',
        'android:exported': 'false',
        'tools:replace': 'android:foregroundServiceType',
      },
    });
    return cfg;
  });
};
