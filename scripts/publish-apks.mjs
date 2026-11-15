// Copies a release build's two APKs into the website with their published names and updates version.json,
// so the site's download page and the app's update check both point at the new version.
//
//   npm run publish:apks -- "What changed in this version"
//
// Run it after building the release (see docs/releasing.md). It reads the version from app.json.
//   android/app/build/outputs/apk/release/app-arm64-v8a-release.apk   -> site/public/manhwa-reader-v<version>.apk
//   android/app/build/outputs/apk/release/app-armeabi-v7a-release.apk -> site/public/manhwa-reader-older-android-v<version>.apk
// Older APKs in site/public are removed so the site repo doesn't keep growing.
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Keep these in step with site/lib/apk.ts.
export const standardApk = (v) => `manhwa-reader-v${v}.apk`;
export const legacyApk = (v) => `manhwa-reader-older-android-v${v}.apk`;

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const out = join(root, 'android/app/build/outputs/apk/release');
const site = join(root, 'site/public');

const version = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.version;
const [major = 0, minor = 0, patch = 0] = String(version).split('.').map((n) => parseInt(n, 10) || 0);
const versionCode = major * 10000 + minor * 100 + patch; // same rule as app.config.js
const notes = process.argv.slice(2).join(' ').trim();

const builds = [
  { from: join(out, 'app-arm64-v8a-release.apk'), to: standardApk(version), label: 'most phones (64-bit)' },
  { from: join(out, 'app-armeabi-v7a-release.apk'), to: legacyApk(version), label: 'older Android (32-bit)' },
];

const fail = (msg) => {
  console.error(`\n${msg}\n`);
  process.exit(1);
};

if (!existsSync(site)) fail(`No website folder at ${site}.`);
for (const b of builds) {
  if (!existsSync(b.from)) {
    fail(`Missing ${b.from}.\nBuild the release first (docs/releasing.md); the ABI split makes one APK per architecture.`);
  }
}
const built = Math.min(...builds.map((b) => statSync(b.from).mtimeMs));
if (Date.now() - built > 6 * 60 * 60 * 1000) {
  console.warn('Warning: these APKs were built more than 6 hours ago. Make sure they are the build for', version);
}

// Only files this script (or releases before 1.4.0) published are removed: older versions under the new names,
// and the old single manhwa-reader.apk. Any other APK in the folder is left alone and listed.
const keep = new Set(builds.map((b) => b.to));
const ours = /^manhwa-reader(-32-bit|-older-android)?-v-?\d+\.\d+\.\d+\.apk$/;
for (const f of readdirSync(site)) {
  if (!f.endsWith('.apk') || keep.has(f)) continue;
  if (f === 'manhwa-reader.apk' || ours.test(f)) {
    rmSync(join(site, f));
    console.log(`removed  ${f}`);
  } else {
    console.log(`left     ${f}  (not a published release name; delete it yourself if it's no longer needed)`);
  }
}
for (const b of builds) {
  copyFileSync(b.from, join(site, b.to));
  console.log(`copied   ${b.to}  (${(statSync(b.from).size / 1048576).toFixed(1)} MB, ${b.label})`);
}

const prev = existsSync(join(site, 'version.json')) ? JSON.parse(readFileSync(join(site, 'version.json'), 'utf8')) : {};
const info = { versionCode, versionName: version, notes: notes || (prev.versionName === version ? prev.notes : undefined) };
if (!info.notes) delete info.notes;
writeFileSync(join(site, 'version.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`version.json -> ${versionCode} (${version})${info.notes ? '' : '  [no notes: pass them as an argument]'}`);
console.log('\nNow commit and deploy the site.');
