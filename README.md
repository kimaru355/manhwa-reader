# Manhwa Reader

Android app (React Native / Expo) for reading PDF manhwa from folders you choose.

- **Home** – every manhwa found in your folders (search, pull to refresh)
- **Favorites** – manhwa you hearted
- **Recent** – reading history with resume point (long-press to remove)
- **Settings** – add/remove manhwa folders. Nothing is scanned unless you add it here.
- **Reader** – continuous vertical scroll, pinch/double-tap zoom, page slider, previous/next chapter, jump-to-chapter sheet, resumes where you stopped

## Folder layout

A manhwa is a folder that directly contains one PDF per chapter. The folders directly inside a folder you add are scanned:

```
manhwa/                     <- folder you add in Settings
  Panty Note - chapters/    -> "Panty Note" (the " - chapters" suffix is dropped)
    001 - Chapter 1.pdf
    002 - Chapter 2.pdf
  Some Series/
    ch1.pdf
  Merged Book.pdf           -> ignored
```

If none of the subfolders hold PDFs, the folder you added is itself treated as one manhwa. Chapters are sorted naturally (`2` before `10`).

## Build an APK

Native modules (PDF rendering, thumbnails) mean this can't run in Expo Go.

**Android Studio:** open the `android` folder, let Gradle sync, set the Build Variant to `release`, then Build > Build APK(s).

**Command line:** `npx expo run:android --variant release` (needs `JAVA_HOME` and `ANDROID_HOME`).

## Notes

- Each chapter is copied into app cache and opened from there (the next one is prefetched; cache is capped at 8 chapters).
- Covers are page 1 of the first chapter, rendered once and stored in app storage.
- Folder access uses Android's Storage Access Framework, so no storage permission prompt is needed.
- `patches/` holds a `react-native-pdf` patch applied on `npm install`. It only affects `content://` paths, which the app no longer uses.
