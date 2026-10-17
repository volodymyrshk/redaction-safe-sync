import type { LocalValue, RemoteValue } from "./states.ts";

export type Action =
  | { op: "keep"; why: string }
  | { op: "set"; value: string }
  | { op: "set_empty" }
  | { op: "delete" }
  | { op: "conflict"; why: string };   // needs a human or an explicit flag

export type Policy = {
  // An EMPTY from the provider may replace a populated local value only when this is true.
  allowEmptyOverwrite: boolean;
  // An ABSENT key may delete the local value only when this is true AND sync created it.
  deleteWhenAbsent: boolean;
};
export const SAFE: Policy = { allowEmptyOverwrite: false, deleteWhenAbsent: false };

// The rule in one line: only a readable VALUE (or an explicitly allowed EMPTY) may overwrite a VALUE.
export function plan(local: LocalValue, remote: RemoteValue, policy: Policy = SAFE): Action {
  switch (remote.kind) {
    case "unknown":
      return { op: "keep", why: `unknown: ${remote.reason}` };
    case "redacted":
      return local.kind === "none"
        ? { op: "conflict", why: "provider has a value we cannot read" }
        : { op: "keep", why: "redacted values never overwrite" };
    case "absent":
      if (local.kind !== "none" && policy.deleteWhenAbsent && local.writer === "sync") return { op: "delete" };
      return { op: "keep", why: "absent upstream; not deleting" };
    case "empty":
      if (local.kind === "value" && !policy.allowEmptyOverwrite) {
        return { op: "conflict", why: "empty would replace a populated value" };
      }
      return local.kind === "empty" ? { op: "keep", why: "already empty" } : { op: "set_empty" };
    case "value":
      return local.kind === "value" && local.value === remote.value
        ? { op: "keep", why: "unchanged" }
        : { op: "set", value: remote.value };
  }
}
