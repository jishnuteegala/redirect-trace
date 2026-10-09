# Assertions and exit codes

CI-facing expectations: assert the final URL, terminal status, or chain length and get exit 4 (not 0/1) when they fail.

## Sub-features

- `expect-final-pass` exits 0 when the terminal URL matches.
- `expect-final-fail` exits 4 and prints `expect-final: expected ..., got ...`.
- `expect-status-fail` exits 4 on a terminal-status mismatch.
- `max-hops-fail` exits 4 when the chain exceeds the asserted redirect count.
- `lax-normalization` turns a strict-only failure (trailing slash, http->https, tracking params) into a pass under `--lax`.
- `lax-requires-expect` rejects bare `--lax` with exit 2.

## How to get to it (user POV)

- `redirect-trace <url> --expect-final <url> [--lax] [--expect-status <code>] [--max-hops <n>]`.

## Driving it with the CLI harness

Preconditions:

- Baseline preconditions hold; `BASE` is the fixture origin.

- **Final pass.** Run `drive.mjs --name expect-final-pass -- --expect-final "$BASE/end" "$BASE/r/0"`. Exit 0.
- **Final fail.** Run `drive.mjs --name expect-final-fail -- --expect-final "$BASE/elsewhere" "$BASE/r/0"`. Exit 4; stdout contains `expect-final: expected`.
- **Status fail.** Run `drive.mjs --name expect-status-fail -- --expect-status 201 "$BASE/end"`. Exit 4; stdout contains `expect-status: expected 201, got 200`.
- **Max hops fail.** Run `drive.mjs --name max-hops-fail -- --max-hops 1 "$BASE/r/2"`. Exit 4; stdout contains a failing `max-hops` assertion.
- **Lax pass.** Run `drive.mjs --name lax-normalization -- --format json --expect-final "$BASE/end/" "$BASE/r/0"`. Exit 4 strict; rerun adding `--lax` exits 0 and the `expect-final` assertion carries `"normalization": "trailing-slash"`. Terminal format prints only failed assertions - use JSON to observe the pass.
- **Lax without expect.** Run `drive.mjs --name lax-requires-expect -- --lax "$BASE/r/0"`. Exit 2; stderr says `--lax requires --expect-final`.
- **Proof.** Transcripts pair each invocation with exit code and the assertion line.

## Gotchas

- With `--max-hops` supplied, exceeding it is an assertion failure (4); without it, the engine limit is transport-class (3). Same chain, different exit.
- `--expect-final` is single-trace only; batch rows carry their own expected column instead.
- `--lax` relaxes only final-URL comparison, not status or hops.
