# Batch input

Trace many URLs in one run from a file or stdin, with a per-row expected destination and a summary table.

## Sub-features

- `batch-file` reads rows from `--input <file>`.
- `batch-stdin-flag` reads rows from `--input -`.
- `batch-stdin-piped` reads piped stdin with no flag at all.
- `batch-expected` uses a second whitespace-separated column as that row's expected final URL.
- `batch-summary` prints a `| URL | Final | Hops | Result | Detail |` table (also the markdown form).
- `batch-exit-precedence` returns 3 when any row is transport, parse, or unprompted hop-limit, else 4 on assertion failure (including a hop-limit row under a supplied `--max-hops`), else 1 on flags, else 0.
- `batch-bad-row` marks a malformed row `FAIL` in the table without aborting the rest.
- `batch-missing-file` exits 2 with `could not read batch input: <os error>` on stderr.

## How to get to it (user POV)

- `redirect-trace --input redirects.txt`, `redirect-trace --input -`, or `cat redirects.txt | redirect-trace`.

## Driving it with the CLI harness

Preconditions:

- Baseline preconditions hold; `BASE` is the fixture origin. Write a scratch rows file (e.g. `/tmp/rows-$VERIFY_RUN_ID.txt`):

```text
$BASE/r/0    $BASE/end
$BASE/loop
not-a-url
```

- **File.** Run `drive.mjs --name batch-file -- --input /tmp/rows-$VERIFY_RUN_ID.txt`. Exit 3; stdout ends with the table, row 3 marked `FAIL` with `URL must be valid and use http or https`.
- **Stdin flag.** Run `drive.mjs --name batch-stdin-flag --stdin-file /tmp/rows-$VERIFY_RUN_ID.txt -- --input -`. Same table, same exit.
- **Piped stdin.** Run `drive.mjs --name batch-stdin-piped --stdin-file /tmp/rows-$VERIFY_RUN_ID.txt -- `. No args; stdin alone triggers batch mode.
- **JSON.** Run `drive.mjs --name batch-json --stdin-file /tmp/rows-$VERIFY_RUN_ID.txt -- --input - --format json`. Exit 3; stdout is a JSON array of three objects, the parse-error row with `failure` set and empty `hops`.
- **Missing file.** Run `drive.mjs --name batch-missing-file -- --input /tmp/definitely-absent.txt`. Exit 2; stderr begins `could not read batch input:`.
- **Proof.** Transcripts show both the streamed per-row lines and the trailing table for the same run.

## Gotchas

- Terminal mode streams per-row completion lines before the summary; summary order follows input order, not completion order.
- A bad row does not abort the batch - it lands as a `FAIL` row and the exit code still reaches 3.
- `--expect-final` is rejected with batch input (exit 2); per-row expectations live in column 2.
- Same-host rows serialize; only distinct hosts run concurrently. Fixture batches are effectively serial.
