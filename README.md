# redaction-safe-sync

A small TypeScript model for syncing values (env vars, secrets, config) from a provider that hides some of them. The rule it enforces: **a value you can't read can never erase a value you already have.**

## The failure class

Many provider APIs list write-only or "sensitive" values with a blank where the value should be. If a sync path reads that blank as a real empty string, the first time empty values become legal, it starts overwriting populated secrets with `""`. Nothing errors. The customer finds out when their app breaks.

Trigger.dev's [6 October 2026 incident report](https://trigger.dev/blog/incident-report-oct-6-2026) is a clear, honest write-up of exactly this: Sensitive variables came back as `""`, one sync path saved them, and allowing empty values removed the accidental guard. Their follow-ups (receiving-side protection, full-path tests) are the right ones. This repo is an independent sketch of how to make the whole class impossible, not affiliated with them.

## Five states, never collapsed

| Remote state | Meaning | May it overwrite a populated local value? |
|---|---|---|
| `VALUE` | provider returned a readable value | yes |
| `EMPTY` | provider returned a readable, deliberate `""` | only with `allowEmptyOverwrite`; otherwise a **conflict** for a human |
| `REDACTED` | key exists, provider won't show the value | **never** |
| `ABSENT` | key doesn't exist upstream | never, unless `deleteWhenAbsent` and sync created the value |
| `UNKNOWN` | we couldn't find out (error, timeout) | **never** |

Each provider gets an adapter that declares which types are write-only (`src/adapters.ts`). Classification happens in one place, so a new provider can't invent its own meaning for `""`.

Writes are compare-and-set on a version, so a sync planned from an old read loses to a user edit made in between. A restore only repairs values that sync damaged; it never overwrites a fix a user made after the incident.

## Properties tested (3,000 random cases each; replay any failure with `SEED=...`)

- redacted, unknown and absent never change a populated value
- with the safe policy, only a readable value overwrites a value
- sync is idempotent
- a sync that fails partway and is retried ends where a clean sync ends
- a stale sync write loses to a user edit made after the read
- restore repairs sync damage but never overwrites a later user edit
- every key classifies into exactly one state; write-only blanks are redacted, never empty

Plus a regression test that reproduces the overwrite with a naive sync, and shows the five-state sync keeping every secret even with empty values allowed.

The tests were checked by breaking the code on purpose: making write-only blanks classify as empty fails 2 tests, and letting redacted values blank a secret fails 4.

## Run

Node 23.6 or newer; no dependencies.

```bash
npm test
SEED=42 CASES=20000 npm test
```

## Scope

A reference model, about 160 lines of source. In production the store is a database row with a version column (`UPDATE ... WHERE key = $1 AND version = $2`), and conflicts go to whoever owns the integration.

MIT licensed. Volodymyr Shkarban.
