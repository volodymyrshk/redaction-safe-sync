import { classify, type Adapter, type RawListing } from "./adapters.ts";
import { plan, SAFE, type Action, type Policy } from "./plan.ts";
import type { LocalValue } from "./states.ts";
import type { Store } from "./store.ts";

export type SyncReport = { applied: Record<string, Action>; conflicts: string[]; lostRaces: string[] };

export function sync(store: Store, adapter: Adapter, listing: RawListing, keys: string[], policy: Policy = SAFE): SyncReport {
  const remote = classify(adapter, listing, keys);
  const report: SyncReport = { applied: {}, conflicts: [], lostRaces: [] };
  for (const key of keys) {
    const local = store.get(key);
    const action = plan(local, remote.get(key)!, policy);
    if (action.op === "conflict") report.conflicts.push(key);
    if (!store.apply(key, action, local.version, "sync")) report.lostRaces.push(key);
    else report.applied[key] = action;
  }
  return report;
}

// Restore values from a pre-incident backup, but only where the damage is still there:
// the current value was written by sync, is empty or missing, and the backup has a value.
// A user edit made after the incident is never overwritten.
export function restore(store: Store, backup: Map<string, LocalValue>): string[] {
  const restored: string[] = [];
  for (const [key, saved] of backup) {
    if (saved.kind !== "value") continue;
    const current = store.get(key);
    const damaged = current.kind === "none" || (current.kind === "empty" && current.writer === "sync");
    if (!damaged) continue;
    if (store.apply(key, { op: "set", value: saved.value }, current.version, "restore")) restored.push(key);
  }
  return restored;
}
