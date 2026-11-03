# Manhwa Reader

Android app (React Native / Expo) for reading PDF manhwa from folders you choose.

- **Home** – every manhwa found in your folders (search, pull to refresh)
- **Favorites** – manhwa you hearted
- **Recent** – reading history with resume point (long-press to remove)
- **Settings** – add/remove manhwa folders. Nothing is scanned unless you add it here.
- **Reader** – continuous vertical scroll, pinch/double-tap zoom, page slider, previous/next chapter, jump-to-chapter sheet, resumes where you stopped

## Folder layout

A manhwa is a folder that directly contains one PDF per chapter. When you add a folder, it and its
immediate subfolders are scanned:

```
Manga/                      <- folder you add in Settings
  Panty Note - chapters/    -> "Panty Note" (the " - chapters" suffix is dropped)
    001 - Chapter 1.pdf
    002 - Chapter 2.pdf
  Some Series/
    ch1.pdf
  Complete Book.pdf         -> single-chapter manhwa (skipped if a folder with the same title exists)
```

Chapters are sorted naturally (`2` before `10`). Folders without PDFs (e.g. image folders) are ignored.

## Build an APK

Native modules (PDF rendering, thumbnails) mean this can't run in Expo Go.

**Cloud (no Android Studio needed):**

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

This produces an installable `.apk`.

**Local:** install JDK 17 and Android Studio (SDK + `ANDROID_HOME`), then `npx expo run:android`.

## Notes

- PDFs are copied into app cache one chapter at a time (the next one is prefetched), because
  `react-native-pdf` cannot open `content://` URIs from the folder picker directly. Cache is capped at 8 chapters.
- Covers are the first page of the first chapter, rendered once and stored in app storage.
- Folder access uses Android's Storage Access Framework, so no storage permission prompt is needed.
