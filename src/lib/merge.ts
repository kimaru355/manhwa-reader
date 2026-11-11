export type MergePlan<T> = {
  /** Items to add or replace locally. */
  toLocal: T[];
  /** Keys to delete locally (they were deleted on another device). */
  deleteLocal: string[];
  /** Items to add or replace on the server. */
  toRemote: T[];
  /** Keys to delete on the server (they were deleted here). */
  deleteRemote: string[];
  /** Keys present everywhere afterwards; becomes the base for the next merge. */
  result: string[];
};

/**
 * Three-way merge of one collection. `base` holds the keys both sides agreed on at the last sync, which is
 * how a deletion is told apart from something that was never there. With no base (first sync) nothing
 * is deleted: both sides are simply combined. `newer` decides conflicts for items present on both sides.
 */
export function threeWay<T>(
  local: Map<string, T>,
  remote: Map<string, T>,
  base: Set<string>,
  newer: (l: T, r: T) => 'local' | 'remote' | 'same',
): MergePlan<T> {
  const plan: MergePlan<T> = { toLocal: [], deleteLocal: [], toRemote: [], deleteRemote: [], result: [] };
  for (const key of new Set([...local.keys(), ...remote.keys()])) {
    const l = local.get(key);
    const r = remote.get(key);
    if (l !== undefined && r !== undefined) {
      const w = newer(l, r);
      if (w === 'local') plan.toRemote.push(l);
      else if (w === 'remote') plan.toLocal.push(r);
      plan.result.push(key);
    } else if (l !== undefined) {
      if (base.has(key)) plan.deleteLocal.push(key);
      else {
        plan.toRemote.push(l);
        plan.result.push(key);
      }
    } else if (r !== undefined) {
      if (base.has(key)) plan.deleteRemote.push(key);
      else {
        plan.toLocal.push(r);
        plan.result.push(key);
      }
    }
  }
  return plan;
}
