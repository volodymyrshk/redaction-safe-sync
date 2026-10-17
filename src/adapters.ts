import type { RemoteValue } from "./states.ts";

// One provider's raw listing entry, shaped like a typical env-var API.
export type RawEntry = { key: string; value?: string | null; type: string };
export type RawListing = { ok: true; entries: RawEntry[] } | { ok: false; error: string };

export type Adapter = {
  name: string;
  // Types whose values the provider never returns (they come back as "" or null).
  writeOnlyTypes: ReadonlySet<string>;
};

// Classify every key we care about into exactly one of the five states.
// The bug class this prevents: treating a write-only type's "" as a real empty string.
export function classify(adapter: Adapter, listing: RawListing, keys: string[]): Map<string, RemoteValue> {
  const out = new Map<string, RemoteValue>();
  if (!listing.ok) {
    for (const key of keys) out.set(key, { kind: "unknown", reason: listing.error });
    return out;
  }
  const byKey = new Map(listing.entries.map((e) => [e.key, e]));
  for (const key of keys) {
    const entry = byKey.get(key);
    if (!entry) out.set(key, { kind: "absent" });
    else if (adapter.writeOnlyTypes.has(entry.type)) out.set(key, { kind: "redacted" });
    else if (entry.value === undefined || entry.value === null) out.set(key, { kind: "unknown", reason: "no value field" });
    else if (entry.value === "") out.set(key, { kind: "empty" });
    else out.set(key, { kind: "value", value: entry.value });
  }
  return out;
}

// Example adapters. Type names are illustrative; check each provider's API docs.
export const exampleAdapters: Adapter[] = [
  { name: "provider-a", writeOnlyTypes: new Set(["sensitive", "secret"]) },
  { name: "provider-b", writeOnlyTypes: new Set(["secret"]) },
];
