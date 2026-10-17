import { test } from "node:test";
import assert from "node:assert/strict";
import type { Adapter, RawListing } from "../src/adapters.ts";
import { Store } from "../src/store.ts";
import { sync } from "../src/sync.ts";

// The failure class described in a public postmortem (6 Oct 2026): a provider returns sensitive
// variables with value "", a sync path treats that as a real empty string, and once empty values
// become legal the sync overwrites populated secrets.
const adapter: Adapter = { name: "provider-a", writeOnlyTypes: new Set(["sensitive"]) };
const listing: RawListing = { ok: true, entries: [
  { key: "STRIPE_SECRET", type: "sensitive", value: "" },
  { key: "DATABASE_URL", type: "sensitive", value: "" },
  { key: "FEATURE_FLAG", type: "plain", value: "" },
] };

function seededStore() {
  const s = new Store();
  s.userWrite("STRIPE_SECRET", "sk_live_x");
  s.userWrite("DATABASE_URL", "postgres://x");
  return s;
}

// What a naive sync does: every "" is an empty value.
function naiveSync(store: Store) {
  for (const e of (listing as { entries: { key: string; value: string }[] }).entries) {
    store.apply(e.key, e.value === "" ? { op: "set_empty" } : { op: "set", value: e.value }, store.get(e.key).version, "sync");
  }
}

test("naive sync reproduces the overwrite", () => {
  const s = seededStore();
  naiveSync(s);
  assert.equal(s.get("STRIPE_SECRET").kind, "empty");
  assert.equal(s.get("DATABASE_URL").kind, "empty");
});

test("five-state sync keeps every secret, even with empty values allowed", () => {
  const s = seededStore();
  const report = sync(s, adapter, listing, ["STRIPE_SECRET", "DATABASE_URL", "FEATURE_FLAG"],
    { allowEmptyOverwrite: true, deleteWhenAbsent: true });
  assert.equal(s.get("STRIPE_SECRET").kind, "value");
  assert.equal(s.get("DATABASE_URL").kind, "value");
  assert.equal(s.get("FEATURE_FLAG").kind, "empty");          // a readable plain "" is a real empty
  assert.deepEqual(report.conflicts, []);
});

test("without the allow flag, a readable empty over a populated value is a conflict, not a write", () => {
  const s = new Store();
  s.userWrite("FEATURE_FLAG", "on");
  const report = sync(s, adapter, listing, ["FEATURE_FLAG"]);
  assert.deepEqual(report.conflicts, ["FEATURE_FLAG"]);
  assert.equal(s.get("FEATURE_FLAG").kind, "value");
});
