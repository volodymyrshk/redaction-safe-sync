import { NONE, type LocalValue, type Writer } from "./states.ts";
import type { Action } from "./plan.ts";

// Writes are compare-and-set on `version`: a write planned from an old read loses to anything
// written in between (a user edit, another sync). In a database:
//   UPDATE vars SET value = $1, version = version + 1 WHERE key = $2 AND version = $3
export class Store {
  private data = new Map<string, LocalValue>();
  failAfter = Infinity;   // test hook: throw after this many successful writes
  private writes = 0;

  get(key: string): LocalValue { return this.data.get(key) ?? NONE; }
  snapshot(): Map<string, LocalValue> { return new Map([...this.data].map(([k, v]) => [k, { ...v }])); }

  // Returns false when the version moved (someone else wrote first).
  apply(key: string, action: Action, expectedVersion: number, writer: Writer): boolean {
    if (action.op === "keep" || action.op === "conflict") return true;
    const current = this.get(key);
    if (current.version !== expectedVersion) return false;
    if (this.writes >= this.failAfter) throw new Error("injected write failure");
    const version = current.version + 1;
    if (action.op === "set") this.data.set(key, { kind: "value", value: action.value, version, writer });
    else if (action.op === "set_empty") this.data.set(key, { kind: "empty", version, writer });
    else this.data.set(key, { kind: "none", version });
    this.writes += 1;
    return true;
  }

  // A user edit always lands (it bumps the version, which makes stale sync writes fail).
  userWrite(key: string, value: string): void {
    const version = this.get(key).version + 1;
    this.data.set(key, value === "" ? { kind: "empty", version, writer: "user" } : { kind: "value", value, version, writer: "user" });
  }
}
