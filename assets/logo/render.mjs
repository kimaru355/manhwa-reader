// Renders the logo and every icon the app and site use from mark.svg: `node assets/logo/render.mjs` (needs the site's sharp).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const sharp = createRequire(join(root, 'site', 'package.json'))('sharp');

const mark = readFileSync(join(here, 'mark.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const bg = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C47CF5"/><stop offset="1" stop-color="#6B2FC0"/></linearGradient></defs>`;
/** A mark with its two colours filled in, scaled about the centre. */
const art = (cut, bubble, scale = 1) =>
  `<g transform="translate(512 512) scale(${scale}) translate(-552 -464)">${mark.replaceAll('var(--cut)', cut).replaceAll('var(--bubble)', bubble)}</g>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${bg}${body}</svg>`;

const files = {
  // Full square icon (iOS, site, store listing).
  'icon.svg': svg(`<rect width="1024" height="1024" fill="url(#g)"/>${art('#7B3BCF', '#FFD15C')}`),
  // Rounded version for the web.
  'logo.svg': svg(`<rect width="1024" height="1024" rx="224" fill="url(#g)"/>${art('#7B3BCF', '#FFD15C')}`),
  // Android adaptive icon: the launcher crops to the middle 66%, so the mark is smaller.
  'fg.svg': svg(art('#7B3BCF', '#FFD15C', 0.62)),
  'bg.svg': svg(`<rect width="1024" height="1024" fill="url(#g)"/>`),
  // Themed icon: Android only uses its alpha, so the panel gutters are cut out with a mask.
  'mono.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><mask id="m"><rect width="1024" height="1024" fill="#000"/>${art('#000', '#fff', 0.62)}</mask><rect width="1024" height="1024" fill="#fff" mask="url(#m)"/></svg>`,
  'splash.svg': svg(art('#7B3BCF', '#FFD15C')).replace(bg, ''),
};
// The full and rounded logo are kept as SVG for anywhere else that needs it.
for (const name of ['icon.svg', 'logo.svg']) writeFileSync(join(here, name), files[name]);

const png = (name, out, size) => sharp(Buffer.from(files[name])).resize(size, size).png({ compressionLevel: 9 }).toFile(join(root, out));
await Promise.all([
  png('icon.svg', 'assets/icon.png', 1024),
  png('fg.svg', 'assets/android-icon-foreground.png', 512),
  png('bg.svg', 'assets/android-icon-background.png', 512),
  png('mono.svg', 'assets/android-icon-monochrome.png', 432),
  png('splash.svg', 'assets/splash-icon.png', 1024),
  png('logo.svg', 'assets/favicon.png', 48),
  png('logo.svg', 'site/public/icon.png', 512),
  png('logo.svg', 'site/app/icon.png', 64),
  png('icon.svg', 'site/app/apple-icon.png', 180),
]);
console.log('done');
