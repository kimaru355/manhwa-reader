const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// [withReleaseSigning]';

/**
 * Signs release builds with your own key instead of the debug key, so every build you hand out can be
 * installed over the last one. The key is described in `keystore.properties` in the project root (never
 * committed; see docs/releasing.md). Without that file the build still works but is signed with the debug key.
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (g.includes(MARK)) return c;

    g = g.replace(
      /android\s*\{\n/,
      (m) => `${m}    ${MARK}
    def keystoreProps = new Properties()
    def keystoreFile = rootProject.file('../keystore.properties')
    if (keystoreFile.exists()) {
        keystoreFile.withInputStream { keystoreProps.load(it) }
    }

`,
    );

    g = g.replace(
      /signingConfigs\s*\{\n/,
      (m) => `${m}        release {
            if (keystoreProps['storeFile']) {
                storeFile rootProject.file('../' + keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
`,
    );

    // Only the release build type's line, which follows the "Caution!" comment.
    g = g.replace(
      /(signed-apk-android\.\s*)signingConfig signingConfigs\.debug/,
      "$1signingConfig keystoreProps['storeFile'] ? signingConfigs.release : signingConfigs.debug",
    );

    c.modResults.contents = g;
    return c;
  });
};
