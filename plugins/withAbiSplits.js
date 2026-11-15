const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// [withAbiSplits]';

/**
 * One release build makes two APKs instead of one large one:
 *   app-arm64-v8a-release.apk    -> most phones (64-bit)       -> manhwa-reader-v<version>.apk
 *   app-armeabi-v7a-release.apk  -> older phones (32-bit only) -> manhwa-reader-32-bit-v-<version>.apk
 * Both have the same versionCode, so either one updates an installed app. `npm run publish:apks` copies and
 * renames them into the website (see docs/releasing.md).
 *
 * Skipped on EAS (EAS_BUILD is set there): EAS expects a single APK/AAB per build.
 */
function addAbiSplits(contents) {
  if (contents.includes(MARK)) return contents;
  return contents.replace(
    /android\s*\{\n/,
    (m) => `${m}    ${MARK}
    splits {
        abi {
            reset()
            enable true
            universalApk false
            include "arm64-v8a", "armeabi-v7a"
        }
    }

`,
  );
}

module.exports = function withAbiSplits(config) {
  if (process.env.EAS_BUILD) return config;
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = addAbiSplits(c.modResults.contents);
    return c;
  });
};

module.exports.addAbiSplits = addAbiSplits;
