// What a provider told us about one key. Five states, never collapsed:
//   VALUE    the provider returned a readable value
//   EMPTY    the provider returned a readable value that is deliberately ""
//   REDACTED the key exists but the provider will not show the value (write-only / sensitive)
//   ABSENT   the provider says the key does not exist
//   UNKNOWN  we could not find out (request failed, page missing, timeout)
export type RemoteValue =
  | { kind: "value"; value: string }
  | { kind: "empty" }
  | { kind: "redacted" }
  | { kind: "absent" }
  | { kind: "unknown"; reason: string };

// What we hold locally. `writer` records who last set it, so a restore can tell its own
// damage apart from a user's later edit.
export type Writer = "user" | "sync" | "restore";
export type LocalValue =
  | { kind: "value"; value: string; version: number; writer: Writer }
  | { kind: "empty"; version: number; writer: Writer }
  | { kind: "none"; version: number };

export const NONE: LocalValue = { kind: "none", version: 0 };
