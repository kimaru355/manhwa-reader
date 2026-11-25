import { useCallback, useState } from 'react';

/** Multi-select state for a grid of titles: tap to pick several, then act on them all at once. */
export function useSelection() {
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  const start = useCallback((key?: string) => {
    setOn(true);
    setPicked(new Set(key ? [key] : []));
  }, []);
  const exit = useCallback(() => {
    setOn(false);
    setPicked(new Set());
  }, []);
  const toggle = useCallback((key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);
  const selectAll = useCallback((keys: string[]) => setPicked(new Set(keys)), []);
  const clear = useCallback(() => setPicked(new Set()), []);

  return { on, picked, start, exit, toggle, selectAll, clear };
}

export type Selection = ReturnType<typeof useSelection>;
