# Output formats

The same trace renders as human terminal output, a Markdown document, or machine-readable JSON.

## Sub-features

- `format-terminal` renders numbered hops with `->` destinations (default).
- `format-markdown` renders a `# Redirect trace` document with Hops, Flags, and Assertions sections.
- `format-json` renders a single JSON object with `hops`, `flags`, `assertions`, `terminal`.
- `format-invalid` rejects an unknown `--format` with exit 2.
- `format-timing` adds `timingMs`/`elapsed` fields only under `--include-timing`.

## How to get to it (user POV)

- Run `redirect-trace <url>` (terminal default), `redirect-trace <url> --format markdown`, or `--format json`.

## Driving it with the CLI harness

Preconditions:

- Baseline preconditions hold; `BASE` is the fixture origin.

- **Terminal.** Run `drive.mjs --name format-terminal -- "$BASE/r/1"`. Exit 0; stdout lines look like `1. 302 <url> -> <url>`.
- **Markdown.** Run `drive.mjs --name format-markdown -- --format markdown "$BASE/r/1"`. Exit 0; stdout starts `# Redirect trace` and contains `## Hops` and `## Flags`.
- **JSON.** Run `drive.mjs --name format-json -- --format json "$BASE/r/1"`. Exit 0; stdout parses as JSON (pipe through `node -e "JSON.parse(require('fs').readFileSync(0))"` or check `"hops": [`) with `terminal.status` 200.
- **Invalid.** Run `drive.mjs --name format-invalid -- --format yaml "$BASE/r/1"`. Exit 2; stderr says `--format must be terminal, markdown, or json` and prints help.
- **Timing.** Run `drive.mjs --name format-timing -- --format json --include-timing "$BASE/r/0"`. Exit 0; terminal hop carries `timingMs`.
- **Proof.** Diff the three transcripts of the same chain: identical hop sequence, three renderings.

## Gotchas

- `--include-timing` output is not deterministic; assert on presence, never on values.
- JSON renders masked URLs; query secrets appear as `***` unless `--show-secrets`.
- Markdown is a document, not lines - match headings, not prefixes.
