/** Pages loaded before a chapter opens. */
export const INITIAL_PAGES = 10;
/** More pages are requested once this many (or fewer) are left ahead of the reader. */
export const MIN_AHEAD = 5;
/** How many pages are added each time. */
export const STEP = 5;
/** Pages above the reader are filled in when the reader gets this close to the top of what is loaded. */
const BACK = 3;
const CONCURRENCY = 4;

/**
 * Decides which pages of a chapter to fetch and when. The first INITIAL_PAGES (from where the reader
 * starts) load up front; after that, whenever MIN_AHEAD or fewer loaded pages remain below the reader,
 * STEP more are requested, so there are always at least MIN_AHEAD pages ready ahead. Pages are fetched a
 * few at a time, nearest first. `fetchOne` returns whether the page is now available.
 */
export class PageLoader {
  low: number;
  through: number;
  private queue: number[] = [];
  private inflight = new Set<number>();
  private done = new Set<number>();
  private stopped = false;

  readonly total: number;
  private fetchOne: (index: number) => Promise<boolean>;

  constructor(total: number, start: number, fetchOne: (index: number) => Promise<boolean>) {
    this.total = total;
    this.fetchOne = fetchOne;
    this.low = Math.min(Math.max(start, 0), Math.max(total - 1, 0));
    this.through = Math.min(total - 1, this.low + INITIAL_PAGES - 1);
  }

  get loadedCount() {
    return this.done.size;
  }

  has(index: number) {
    return this.done.has(index);
  }

  /** Marks pages that are already on disk so they are not fetched again. */
  markLoaded(index: number) {
    this.done.add(index);
  }

  /** Loads the opening pages and resolves when they have all been tried. `ok` is false if any failed. */
  async loadInitial(onProgress?: (done: number, total: number) => void): Promise<boolean> {
    const first = this.low;
    const last = this.through;
    const count = last - first + 1;
    let finished = 0;
    let ok = true;
    const indexes = Array.from({ length: count }, (_, k) => first + k);
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, count) }, async () => {
        while (indexes.length && !this.stopped) {
          const i = indexes.shift()!;
          if (!this.done.has(i)) {
            this.inflight.add(i);
            const res = await this.fetchOne(i).catch(() => false);
            this.inflight.delete(i);
            if (res) this.done.add(i);
            else ok = false;
          }
          onProgress?.(++finished, count);
        }
      }),
    );
    return ok;
  }

  /** Call whenever the reader's page changes (0-based). */
  advance(page: number) {
    if (this.stopped) return;
    if (page < this.low || page > this.through) {
      // Jumped somewhere else (slider, bookmark): start a fresh window there.
      this.queue.length = 0;
      this.low = page;
      this.through = Math.min(this.total - 1, page + INITIAL_PAGES - 1);
      this.request(page, this.through);
      return;
    }
    if (this.through < this.total - 1 && this.through - page <= MIN_AHEAD) {
      const to = Math.min(this.total - 1, this.through + STEP);
      this.request(this.through + 1, to);
      this.through = to;
    }
    if (this.low > 0 && page - this.low <= BACK) {
      const from = Math.max(0, this.low - STEP);
      // Nearest to the reader first.
      for (let i = this.low - 1; i >= from; i--) this.enqueue(i);
      this.low = from;
    }
    this.pump();
  }

  /** Tries a failed page again right away. */
  retry(index: number) {
    if (this.done.has(index) || this.inflight.has(index)) return;
    this.queue = this.queue.filter((i) => i !== index);
    this.queue.unshift(index);
    this.pump();
  }

  stop() {
    this.stopped = true;
    this.queue.length = 0;
  }

  private request(from: number, to: number) {
    for (let i = from; i <= to; i++) this.enqueue(i);
    this.pump();
  }

  private enqueue(i: number) {
    if (i < 0 || i >= this.total || this.done.has(i) || this.inflight.has(i) || this.queue.includes(i)) return;
    this.queue.push(i);
  }

  private pump() {
    while (!this.stopped && this.inflight.size < CONCURRENCY && this.queue.length) {
      const i = this.queue.shift()!;
      this.inflight.add(i);
      this.fetchOne(i)
        .catch(() => false)
        .then((ok) => {
          this.inflight.delete(i);
          if (ok) this.done.add(i);
          this.pump();
        });
    }
  }
}
