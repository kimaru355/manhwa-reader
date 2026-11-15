# Releasing

Android only installs a new APK over the old app when the package name and the **signing key** match and the
`versionCode` is higher. Every build handed to testers must use the same release key.

## Signing key

`keystore/release.keystore` and `keystore.properties` (project root) hold the release key. Both are git-ignored.
**Back them up somewhere safe.** If the key is lost, testers must uninstall before installing a build signed with a
new key. Without `keystore.properties` a build falls back to the debug key.

## Each release

1. Bump `version` in `app.json` (the versionCode is derived: 1.4.0 -> 10400).
2. Regenerate the Android project so it picks up the version: `npx expo prebuild --platform android --clean`
3. Build the release in Android Studio (or `cd android && ./gradlew assembleRelease`). Since 1.4.0 one build makes
   two APKs (`plugins/withAbiSplits.js`), in `android/app/build/outputs/apk/release/`:
   - `app-arm64-v8a-release.apk`: most phones (64-bit)
   - `app-armeabi-v7a-release.apk`: older phones that only run 32-bit apps
4. Put them on the website: `npm run publish:apks -- "Short notes about this version"`. This copies them into
   `site/public/` as
   - `manhwa-reader-v<version>.apk`
   - `manhwa-reader-older-android-v<version>.apk`

   writes `site/public/version.json` (versionCode, versionName, notes), and removes older published APKs.
5. Commit and deploy the site. The app's update check reads `version.json`, and "Get it" opens the site's
   `/download` page, which offers both APKs.

Both APKs have the same versionCode and signing key, so either one installs over any earlier version. Apps older
than 1.4.0 update from `/manhwa-reader.apk`; once that file is gone the address leads to `/download`.

## Building with EAS instead

EAS signs with a key it stores for the project, not with `keystore/release.keystore`. An APK built by EAS will not
install over one built in Android Studio (or the other way round) unless both use the same key. To make EAS use
your key, upload it once with `npx eas-cli@latest credentials` (Android -> production -> Keystore -> upload), or keep
building every release locally as described above. Pick one and stick to it.
