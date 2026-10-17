import type { RawEntry, RawListing, Adapter } from "../src/adapters.ts";
import type { LocalValue, Writer } from "../src/states.ts";

// Small seeded generator so a failing case can be replayed: SEED=1234 npm test
export function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)];
  return { next, int, pick };
}
export type R = ReturnType<typeof rng>;

export const TYPES = ["plain", "encrypted", "sensitive", "secret"] as const;
export const KEYS = ["API_KEY", "DB_URL", "TOKEN", "EMPTY_FLAG", "REGION", "WEBHOOK_SECRET"];

export function genLocal(r: R): LocalValue {
  const version = 1 + r.int(5);
  const writer: Writer = r.pick(["user", "sync", "restore"] as const);
  switch (r.int(3)) {
    case 0: return { kind: "none", version };
    case 1: return { kind: "empty", version, writer };
    default: return { kind: "value", value: r.pick(["a", "b", "secret-1", "x".repeat(8)]), version, writer };
  }
}

export function genListing(r: R, adapter: Adapter): RawListing {
  if (r.int(10) === 0) return { ok: false, error: r.pick(["timeout", "500", "rate limited"]) };
  const entries: RawEntry[] = [];
  for (const key of KEYS) {
    if (r.int(4) === 0) continue;                                  // absent
    const type = r.pick(TYPES);
    // Write-only types come back blank, the way providers hide them.
    const value = adapter.writeOnlyTypes.has(type) ? r.pick(["", null] as const) : r.pick(["", "a", "b", "c", null] as const);
    entries.push({ key, type, value });
  }
  return { ok: true, entries };
}

export const CASES = Number(process.env.CASES ?? 3000);
export const SEED = Number(process.env.SEED ?? 20261006);
