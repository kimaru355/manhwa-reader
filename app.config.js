/**
 * Android only installs a new APK over the old app when it has the same package name, the same signing
 * key and a higher versionCode. The versionCode is worked out from the version in app.json so there is
 * one number to change: 1.4.0 -> 10400, 1.5.0 -> 10500. Put the same two values in the site's version.json.
 */
module.exports = ({ config }) => {
  const [major = 0, minor = 0, patch = 0] = String(config.version ?? '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  return {
    ...config,
    android: { ...config.android, versionCode: major * 10000 + minor * 100 + patch },
  };
};
