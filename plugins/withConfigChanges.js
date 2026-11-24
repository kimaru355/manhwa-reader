const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * Connecting or disconnecting Bluetooth earbuds (which register as input devices) changes the `navigation`
 * (and sometimes `touchscreen`) configuration. Without these in configChanges Android destroys and recreates
 * the activity: the app reloaded to the home tab and then crashed on the next screen opened. Handling them
 * keeps the running app as it is.
 */
const EXTRA = ['navigation', 'touchscreen'];

module.exports = function withConfigChanges(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const have = (activity.$['android:configChanges'] ?? '').split('|').filter(Boolean);
    activity.$['android:configChanges'] = [...new Set([...have, ...EXTRA])].join('|');
    return cfg;
  });
};
