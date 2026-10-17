import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, exampleAdapters } from "../src/adapters.ts";
import { plan, SAFE } from "../src/plan.ts";
import { Store } from "../src/store.ts";
import { restore, sync } from "../src/sync.ts";
import type { LocalValue } from "../src/states.ts";
import { CASES, KEYS, SEED, genListing, genLocal, rng } from "./gen.ts";

function forAll(name: string, body: (r: ReturnType<typeof rng>, i: number) => void) {
  test(name, () => {
    const r = rng(SEED);
    for (let i = 0; i < CASES; i++) {
      try { body(r, i); } catch (e) { throw new Error(`${name} failed at case ${i} (SEED=${SEED}): ${(e as Error).message}`); }
    }
  });
}

const values = (s: Store) => Object.fromEntries(KEYS.map((k) => { const v = s.get(k); return [k, v.kind === "value" ? v.value : v.kind]; }));

function seeded(r: ReturnType<typeof rng>): { store: Store; before: Map<string, LocalValue> } {
  const store = new Store();
  for (const key of KEYS) {
    const v = genLocal(r);
    if (v.kind === "value") store.userWrite(key, v.value);
    else if (v.kind === "empty") store.userWrite(key, "");
  }
  return { store, before: store.snapshot() };
}

forAll("redacted, unknown and absent never change a populated value", (r) => {
  const adapter = r.pick(exampleAdapters);
  const { store } = seeded(r);
  const listing = genListing(r, adapter);
  const remote = classify(adapter, listing, KEYS);
  const before = values(store);
  const policy = { allowEmptyOverwrite: r.int(2) === 0, deleteWhenAbsent: r.int(2) === 0 };
  sync(store, adapter, listing, KEYS, policy);
  for (const key of KEYS) {
    const kind = remote.get(key)!.kind;
    if (kind === "redacted" || kind === "unknown" || kind === "absent") {
      // deleteWhenAbsent may only remove values sync itself created; these were written by the user.
      assert.equal(values(store)[key], before[key], `${key} changed on ${kind}`);
    }
  }
});

forAll("with the safe policy, only a readable value overwrites a value", (r) => {
  const local = genLocal(r);
  const kinds = ["value", "empty", "redacted", "absent", "unknown"] as const;
  const kind = r.pick(kinds);
  const remote = kind === "value" ? { kind, value: r.pick(["a", "b"]) } : kind === "unknown" ? { kind, reason: "x" } : { kind };
  const action = plan(local, remote as never, SAFE);
  if (local.kind === "value" && (action.op === "set" || action.op === "set_empty" || action.op === "delete")) {
    assert.equal(remote.kind, "value", `${action.op} on a populated value from ${remote.kind}`);
  }
});

forAll("sync is idempotent: running it twice changes nothing the second time", (r) => {
  const adapter = r.pick(exampleAdapters);
  const { store } = seeded(r);
  const listing = genListing(r, adapter);
  sync(store, adapter, listing, KEYS);
  const once = store.snapshot();
  sync(store, adapter, listing, KEYS);
  assert.deepEqual(store.snapshot(), once);
});

forAll("a sync that fails partway and is retried ends where a clean sync ends", (r) => {
  const adapter = r.pick(exampleAdapters);
  const seedNo = r.int(1_000_000);
  const listing = genListing(r, adapter);
  const build = () => { const s = seeded(rng(seedNo)).store; return s; };
  const clean = build();
  sync(clean, adapter, listing, KEYS);
  const flaky = build();
  flaky.failAfter = r.int(KEYS.length);
  try { sync(flaky, adapter, listing, KEYS); } catch { /* injected */ }
  flaky.failAfter = Infinity;
  sync(flaky, adapter, listing, KEYS);
  assert.deepEqual(values(flaky), values(clean));
});

forAll("a stale sync write loses to a user edit made after the read", (r) => {
  const store = new Store();
  store.userWrite("TOKEN", "old");
  const read = store.get("TOKEN");
  store.userWrite("TOKEN", r.pick(["new", "newer"]));
  const ok = store.apply("TOKEN", { op: "set", value: "from-sync" }, read.version, "sync");
  assert.equal(ok, false);
  assert.notEqual(store.get("TOKEN").kind === "value" && (store.get("TOKEN") as { value: string }).value, "from-sync");
});

forAll("restore repairs sync damage but never overwrites a later user edit", (r) => {
  const store = new Store();
  for (const key of KEYS) store.userWrite(key, `good-${key}`);
  const backup = store.snapshot();
  // Damage: an unsafe sync blanks some keys.
  for (const key of KEYS) if (r.int(2) === 0) store.apply(key, { op: "set_empty" }, store.get(key).version, "sync");
  // Some users fix things by hand before the restore runs.
  const edited = KEYS.filter(() => r.int(3) === 0);
  for (const key of edited) store.userWrite(key, `user-fix-${key}`);
  restore(store, backup);
  for (const key of KEYS) {
    const v = store.get(key);
    assert.equal(v.kind, "value", `${key} still damaged`);
    const expected = edited.includes(key) ? `user-fix-${key}` : `good-${key}`;
    assert.equal((v as { value: string }).value, expected);
  }
});

forAll("every key classifies into exactly one state; write-only blanks are redacted, never empty", (r) => {
  const adapter = r.pick(exampleAdapters);
  const listing = genListing(r, adapter);
  const remote = classify(adapter, listing, KEYS);
  assert.equal(remote.size, KEYS.length);
  if (listing.ok) for (const e of listing.entries) {
    if (adapter.writeOnlyTypes.has(e.type)) assert.equal(remote.get(e.key)!.kind, "redacted");
  }
});
