# Recommendations file

Home is built from one JSON file. The app fetches it from `DEFAULT_RECS_URL` in `src/lib/recs.tsx`
(`https://manhwa-reader.kimaru355.co.ke/recommendations.json`) on launch and on pull-to-refresh, and caches the last
good copy. A different link can be pasted in **Settings → Author recommendations**. If nothing has been fetched yet
it falls back to `src/data/recommendations.json`, which doubles as a sample of every field: copy it, replace the
`SAMPLE` entries with real ones, and upload it to the URL above.

```json
{
  "version": 1,
  "updated": "2026-11-11",
  "sources": {
    "manga": [{ "source": "mangadex", "name": "MangaDex" }],
    "manhwa": [{ "source": "webtoons", "name": "WEBTOON" }],
    "isekai": [{ "source": "mangadex", "name": "MangaDex" }],
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
  source switcher. Optional; the app falls back to MangaDex / WEBTOON / MangaDex (Isekai).
- `category` — `manga`, `manhwa`, `isekai` or `novel`. `isekai` is a genre shelf: its titles are MangaDex titles, and Discover filters MangaDex by the Isekai tag.
- `tier` — `all-time`, `interesting`, `good` or `trial`. Home groups each category by tier in that order.
- `source` — `mangadex`, `webtoons`, `novelfull` or `external`. `external` titles (use this for light novels) have no
  in-app reader: tapping one opens its `url` in the browser.
- `id` — the title's id on that source:
  - MangaDex: the UUID in `mangadex.org/title/<uuid>`.
  - WEBTOON: the `title_no` from the title's list URL.
- `cover` — optional. Without it the title shows a letter tile until opened.
- `bookmarks` — the author's chapter bookmarks. `chapterId` is the source's chapter id:
  - MangaDex: the chapter UUID.
  - WEBTOON: the episode number (`episode_no`).

  `page` is the image number within the chapter (1-based). They show on the title page, in the reader's bookmark
  sheet and as a sparkle on the chapter row.

Entries with an unknown `source`, `category` or `tier`, or without `id`/`title`, are skipped.
