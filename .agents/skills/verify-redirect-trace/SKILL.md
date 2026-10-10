---
name: verify-redirect-trace
description: Drive the redirect-trace CLI end to end against a local redirect fixture and capture proof transcripts. Use when a change touches CLI behavior, exit codes, output formats, batch mode, or release packaging and you need executable evidence, not a claim.
---

# Verify redirect-trace

redirect-trace is a short-lived CLI. There is no server to keep alive: verification means building once, then spawning `node dist/cli.js` per drive and capturing its stdout, stderr, and exit code. A local fixture server (`helpers/fixture-server.mjs`) supplies deterministic redirect chains so no drive needs external network.

## Launch

One-time setup per verification run:

```bash
pnpm install      # only if node_modules is missing
pnpm run build    # tsc -b -> dist/
```

The app is ready when `dist/cli.js` exists and answers `--version`. Then start the fixture in the background and keep its PID:

```bash
node .agents/skills/verify-redirect-trace/helpers/fixture-server.mjs > /tmp/fixture-$RUN_ID.log &
FIXTURE_PID=$!
# ready when the log contains FIXTURE_BASE=http://127.0.0.1:<port>
```

Pick a `RUN_ID` (e.g. `run-$(date +%s)`) and export it as `VERIFY_RUN_ID` so every transcript lands in one directory. For a second origin (port-change/cross-origin flags), start a second fixture and use its port in `/to/<port>/...` URLs.

## Doctor

Run this first whenever anything looks off; all three checks are read-only:

```bash
node --version                                    # must be >= 18
node dist/cli.js --version                        # must equal package.json "version"
pnpm run build                                    # must exit 0 (build is stale or broken otherwise)
```

If `--version` disagrees with `package.json`, `src/version.ts` drifted (release-please owns it). If the fixture log has no `FIXTURE_BASE`, the port bind failed; check the log before driving anything.

## Drive

The harness is `helpers/drive.mjs`. Each invocation spawns a fresh `node dist/cli.js` process from the repo root and writes a transcript. Processes are isolated by construction; two runs can share one fixture server but nothing else is shared.

```bash
node .agents/skills/verify-redirect-trace/helpers/drive.mjs --name <label> -- <cli args>
node .agents/skills/verify-redirect-trace/helpers/drive.mjs --name batch --stdin-file rows.txt -- --input -
```

The helper prints the transcript path and `exit=<code>`, and exits with the CLI's own code so `&&`/`||` work.

The fixture menu (all paths on `FIXTURE_BASE`):

| Path | Behavior |
| --- | --- |
| `/r/<n>` | 302 to `/r/<n-1>`; `/r/0` lands on `/end`. `/r/2` yields 3 redirects then 200. |
| `/end` | 200 `ok` (terminal). Any unmatched path also returns 200. |
| `/loop` | 302 to itself (loop detection). |
| `/no-location` | 302 with no `Location` (malformed redirect, exit 3). |
| `/bad-location` | 302 with `Location: ht!tp://bad` (invalid target, exit 3). |
| `/head-405` | HEAD gets 405, GET gets 302 to `/end` (proves HEAD->GET fallback). |
| `/to/<port>/<path>` | 302 to `http://127.0.0.1:<port><path>` (cross-port/cross-origin flags). |

Query strings on the start URL survive into rendered hops, so `?token=abc` exercises masking.

## Evidence

Transcripts go to `<os.tmpdir()>/verify-redirect-trace/<RUN_ID>/<label>.txt` and contain the command line, exit code, stdout, and stderr - the full action and resulting state in one file.

Proof standards:

- Exercise the real user path: invoke the built `dist/cli.js`, never `src/` internals or test-only shims.
- Assert on exit code plus output content, not output alone. The exit-code contract (0/1/2/3/4) is the product's CI contract.
- For batch drives, capture both the streamed terminal lines and the final summary.
- Cleanup never deletes `<RUN_ID>` evidence; a proof that dies with teardown is not proof.

## Cleanup

Kill only what this run started, by PID:

```bash
kill "$FIXTURE_PID"   # or: powershell.exe Stop-Process -Id $FIXTURE_PID
```

Remove any scratch input files you created (batch row files, temp configs). Do not remove the evidence directory. `dist/` and `node_modules/` are gitignored build state; leave them.

## Helpers

- `helpers/fixture-server.mjs` - deterministic HTTP redirect fixture on `127.0.0.1:<ephemeral>`; prints `FIXTURE_BASE=...` when ready; run it in the background and kill by PID.
- `helpers/drive.mjs` - spawns `node dist/cli.js <args>` from the repo root, captures the transcript, prints its path and `exit=<code>`. Options: `--name <label>` (transcript name), `--stdin-file <path>` (pipe a file to stdin), `--evidence <dir>` (override the evidence root).

## Feature map

Read `features/README.md` before driving; it indexes the user-facing features and the per-feature recipes.
