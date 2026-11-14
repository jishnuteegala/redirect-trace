# Masking and flags

Sensitive query values are masked by default, and noteworthy chain observations surface as named flags.

## Sub-features

- `mask-default` renders values of sensitive keys (`token`, `code`, `session`, ...) as `***`.
- `mask-reveal` shows real values under `--show-secrets`.
- `mask-diff` masks values inside params diff lines too.
- `flag-loop` reports `loop` on a repeated URL.
- `flag-port-change` reports `port-change` when a redirect crosses ports on one host.
- `flag-cross-origin` reports `cross-origin` alongside port-change for a port-cross; a hostname change also adds `host-change`, and an https->http move adds `https-downgrade`.
- `flag-exit` sets exit 1 when any flag fires and nothing worse happened.
- `flag-method-transition` reports `method-semantic-transition` when `--method` names a non-GET method and a 301/302/303 hop would drop it to GET (analysis label only; the wire method is always HEAD).
- `flag-loop-ignoring-params` reports `loop-ignoring-params` under `--ignore-params-loop` when URLs repeat modulo query.
- `flag-terminal-error` reports `terminal-error-status` when the last hop is >= 400 - unreachable through the fixture (every chain that terminates ends 200); source-verified only.

## How to get to it (user POV)

- `redirect-trace '<url>?token=secret'` masks by default; add `--show-secrets` to reveal. Flags appear automatically on the trace.

## Driving it with the CLI harness

Preconditions:

- Baseline preconditions hold; `BASE` is the fixture origin. For cross-port flags, start a second fixture and record its port as `BASE2_PORT`.

- **Mask.** Run `drive.mjs --name mask-default -- "$BASE/end?token=abc123&keep=1"`. Exit 0; stdout shows `token=***` and `keep=1`, never `abc123`.
- **Reveal.** Run `drive.mjs --name mask-reveal -- --show-secrets "$BASE/end?token=abc123"`. Exit 0; stdout shows `token=abc123`.
- **Loop flag.** Run `drive.mjs --name flag-loop -- "$BASE/loop"`. Exit 1; stdout contains `flag: loop`.
- **Port cross.** Run `drive.mjs --name flag-port-change -- "$BASE/to/$BASE2_PORT/end"`. Exit 1; stdout contains `flag: cross-origin` and `flag: port-change`.
- **Proof.** Pair mask-default and mask-reveal transcripts: identical query except masked vs revealed values.

## Gotchas

- Masking keys are case-insensitive on the decoded key; `Token=` masks too.
- `+` in a query is a literal plus, not a space - fixture URLs do not need `%20` tricks.
- A second fixture is required for port/cross-origin flags; a single origin cannot produce them.
- Flags coexist with masking; a flagged hop still masks its URL.
- Loop detection normalizes scheme/host case, default ports, and fragments before comparing - a loop modulo those counts.
- `--method` changes only the analysis label (it feeds `method-semantic-transition` and JSON `initialMethod`); the wire request is always HEAD (GET fallback on 405/501/transport error) regardless of --method.
