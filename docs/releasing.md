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
3. Build the release APK in Android Studio.
4. Copy `android/app/build/outputs/apk/release/app-release.apk` to the site's `public/manhwa-reader.apk` and set
   `public/version.json` to the same versionCode/versionName.
