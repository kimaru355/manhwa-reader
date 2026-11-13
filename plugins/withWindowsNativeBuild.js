// Local Windows builds (Android Studio / gradlew): CMake 3.22.1's ninja (1.10) can't create
// paths > 260 chars, which breaks React Native codegen objects. Use CMake 3.31.6 (ninja 1.12,
// long-path aware) and build the two ABIs real phones use (arm64-v8a, armeabi-v7a). No-op on other platforms (e.g. EAS Linux builders).
// Requires "CMake 3.31.6" installed via Android Studio SDK Manager.
const { withGradleProperties, withProjectBuildGradle, withAppBuildGradle } = require('expo/config-plugins');

const CMAKE = '3.31.6';
const ROOT_MARK = '// [withWindowsNativeBuild]';

module.exports = function withWindowsNativeBuild(config) {
  if (process.platform !== 'win32') return config;

  config = withGradleProperties(config, (c) => {
    const items = c.modResults.filter((i) => !(i.type === 'property' && i.key === 'reactNativeArchitectures'));
    items.push({ type: 'property', key: 'reactNativeArchitectures', value: 'arm64-v8a,armeabi-v7a' });
    c.modResults = items;
    return c;
  });

  config = withProjectBuildGradle(config, (c) => {
    if (c.modResults.contents.includes(ROOT_MARK)) return c;
    c.modResults.contents += `
${ROOT_MARK}
subprojects { sp ->
  ["com.android.application", "com.android.library"].each { id ->
    sp.pluginManager.withPlugin(id) {
      try {
        sp.android.externalNativeBuild.cmake.version = "${CMAKE}"
      } catch (Throwable ignored) {
        // :app is already locked here; it is set in app/build.gradle
      }
    }
  }
}
`;
    return c;
  });

  config = withAppBuildGradle(config, (c) => {
    if (c.modResults.contents.includes(ROOT_MARK)) return c;
    c.modResults.contents = c.modResults.contents.replace(
      /android\s*\{\n/,
      (m) => `${m}    ${ROOT_MARK}\n    externalNativeBuild {\n        cmake {\n            version "${CMAKE}"\n        }\n    }\n\n`,
    );
    return c;
  });

  return config;
};
