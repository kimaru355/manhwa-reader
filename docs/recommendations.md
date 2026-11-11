# Recommendations file

Home is built from one JSON file. Host it anywhere that serves raw JSON (for example a GitHub raw URL), then paste
the link in **Settings → Author recommendations**, or set `DEFAULT_RECS_URL` in `src/lib/recs.tsx` to ship it as the
default. The app caches the last good copy. Without a link it uses `src/data/recommendations.json`.

```json
{
  "version": 1,
  "updated": "2026-11-11",
  "sources": {
    "manga": [{ "source": "mangadex", "name": "MangaDex" }],
    "manhwa": [{ "source": "webtoons", "name": "WEBTOON" }],
    "interesting": [{ "source": "hentai20", "name": "Hentai20" }],
    "novel": []
  },
  "recommendations": [
    {
      "source": "webtoons",
      "id": "10336",
      "title": "I Only Need Our Child, Your Grace",
      "cover": "https://…/cover.jpg",
      "category": "manhwa",
      "tier": "good",
      "note": "Why you recommend it.",
      "bookmarks": [{ "chapterId": "1", "chapterName": "Ep. 1", "page": 1, "note": "Where the hook lands" }]
    }
  ]
}
```

## Fields

- `sources` — where Discover browses for each category. The first entry is the default; more than one shows a
  source switcher. Optional; the app falls back to MangaDex / WEBTOON / Hentai20.
- `category` — `manga`, `manhwa`, `interesting` or `novel`.
- `tier` — `all-time`, `interesting`, `good` or `trial`. Home groups each category by tier in that order.
- `source` — `mangadex`, `webtoons`, `hentai20` or `external`. `external` titles (use this for light novels) have no
  in-app reader: tapping one opens its `url` in the browser.
- `id` — the title's id on that source:
  - MangaDex: the UUID in `mangadex.org/title/<uuid>`.
  - WEBTOON: the `title_no` from the title's list URL.
  - Hentai20: the slug in `hentai20.io/manga/<slug>/`.
- `cover` — optional. Without it the title shows a letter tile until opened.
- `bookmarks` — the author's chapter bookmarks. `chapterId` is the source's chapter id:
  - MangaDex: the chapter UUID.
  - WEBTOON: the episode number (`episode_no`).
  - Hentai20: the chapter slug, e.g. `secret-class-chapter-12`.

  `page` is the image number within the chapter (1-based). They show on the title page, in the reader's bookmark
  sheet and as a sparkle on the chapter row.

Entries with an unknown `source`, `category` or `tier`, or without `id`/`title`, are skipped.
