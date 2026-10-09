# redirect-trace verification map

This directory is the maintained source for verifying redirect-trace's user-facing behavior. Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- `pnpm run build` has produced `dist/` in this checkout.
- `node dist/cli.js --version` equals the `version` field in `package.json`.
- The fixture server (`../helpers/fixture-server.mjs`) is running in the background; its `FIXTURE_BASE` line names the origin. Export it as `BASE` in recipes below.
- `VERIFY_RUN_ID` is set so all transcripts land under one directory.
- Never claim a result from `src/` or a test shim - drives run the built `dist/cli.js` only.

## Driving conventions

- Drive every recipe through `../helpers/drive.mjs` so each run leaves a transcript; label transcripts after the sub-feature ID they prove.
- CLI proof requires the command, exit code, stdout, and stderr - the transcript captures all four.
- Exit codes are the assertion channel: 0 clean, 1 flagged, 2 usage/environment, 3 transport/malformed/hop-limit, 4 assertion failure.
- Restore nothing after a drive: the CLI is stateless and the fixture has no mutable state.

## Proof and skip reporting

- Record the feature file and the fixture path used with every artifact.
- A drive that cannot run (fixture down, build stale) is reported as blocked with the doctor output, not skipped silently.
- Do not report an entry point as verified through a different path (e.g. batch covered does not prove single-URL covered).

## Features

- [Trace a redirect chain](./trace-redirect-chain.md) covers chain following, loop detection, terminal status, and transport/malformed failures.
- [Output formats](./output-formats.md) covers terminal, markdown, and JSON rendering of the same trace.
- [Assertions and exit codes](./assertions-and-exit-codes.md) covers `--expect-final`, `--expect-status`, `--max-hops`, and `--lax`.
- [Batch input](./batch-input.md) covers `--input <file>`, `--input -`, piped stdin, per-row expectations, and batch exit precedence.
- [Masking and flags](./masking-and-flags.md) covers sensitive-value masking, `--show-secrets`, and the observation flags.
