# Trace a redirect chain

The core feature: follow a URL's redirect chain hop by hop and report each status, destination, and the terminal response.

## Sub-features

- `chain-follow` follows each redirect and lists hops numbered from 1.
- `chain-terminal` reports the final non-redirect status and URL.
- `chain-loop` detects a repeated URL, flags `loop`, and stops.
- `chain-hop-limit` stops at the engine limit (10 hops unprompted) and exits 3.
- `chain-no-location` exits 3 when a redirect response has no `Location`.
- `chain-bad-location` exits 3 when `Location` is invalid.
- `chain-head-fallback` retries with GET when HEAD throws a non-timeout error or returns 405/501 (other HTTP error statuses are returned as HEAD results, not retried).
- `chain-offline` exits 3 when the host cannot be reached.

## How to get to it (user POV)

- Run `redirect-trace <url>` in a terminal - the only entry point.

## Driving it with the CLI harness

Preconditions:

- Baseline preconditions hold; `BASE` is the fixture origin.

- **Chain.** Run `drive.mjs --name chain-follow -- "$BASE/r/2"`. Exit 0; stdout lists three `->` hops ending at a `200` line for `/end`.
- **Loop.** Run `drive.mjs --name chain-loop -- "$BASE/loop"`. Exit 1; stdout contains `flag: loop` and stops at the repeat.
- **Hop limit.** Run `drive.mjs --name chain-hop-limit -- "$BASE/r/20"`. Exit 3; stdout ends with `ERROR: hop limit of 10 exceeded` and stderr carries the same message without the `ERROR:` prefix.
- **Missing Location.** Run `drive.mjs --name chain-no-location -- "$BASE/no-location"`. Exit 3; stdout hop shows `redirect response has no Location header`.
- **Invalid Location.** Run `drive.mjs --name chain-bad-location -- "$BASE/bad-location"`. Exit 3; stdout hop shows `invalid Location header`.
- **HEAD fallback.** Run `drive.mjs --name chain-head-fallback -- --format json "$BASE/head-405"`. Exit 0 or 1; hop 0 has `"requestMethod": "GET"` - the engine fell back after the 405.
- **Unreachable host.** Run `drive.mjs --name chain-offline -- "http://127.0.0.1:1/end"`. Exit 3; stderr carries the failure line.
- **Proof.** Each transcript is the proof: it pairs the invocation with stdout/stderr/exit.

## Gotchas

- `/r/<n>` counts down: `/r/0` itself redirects to `/end`, so `/r/2` is a 3-redirect chain. Pick `n` accordingly for hop-limit proofs.
- The unprompted limit is 10 hops (requests), not 10 redirects - a completed chain can contain at most 9 redirects under it.
- Transports print the error to stderr AND as the terminal hop detail on stdout; check both.
- Windows process spawn is slow; do not mistake spawn latency for a hang.
