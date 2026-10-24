---
name: formal-verify-redirect-trace
description: "Exhaustively verify redirect-trace's exit-code contract (src/exit-code.ts) - the 18-cell trace precedence table and batch worst-of aggregation over every ordered row-class sequence. Run after any change to src/exit-code.ts or to the shape of what it reads (Assertion, Flag, BatchResult, outcome)."
---

# Formal verify: redirect-trace exit codes

## What it proves

The exit code is the whole reason the tool exists in CI: a gate job trusts that 0 means clean, 1 means flagged, 3 means infrastructure failure, and 4 means a contract (assertion) failure - and that precedence is exactly 3 > 4 > 1 > 0. The harm if it breaks: a contract failure reported as infra failure (a user retries a pipeline that can never pass), or a garbage batch row silently exiting 0 (a gate that green-lights input it never evaluated). Both failures are silent: the tool runs fine and prints plausible output.

`check.mts` runs the **real** `traceExitCode()` and `batchExitCode()` - not a hand model - over every input class: 3 outcomes x 3 assertion classes x 2 flag classes = 18 trace combos, all 584 ordered row sequences of length 1-3 over eight row classes (error, empty-error, skip, analyzed-without-outcome, clean, flagged, transport, assertion-fail), plus all 5040 permutations of a mixed multiset for order invariance. Each `FAIL` prints the first failing input plus a count of the rest.

Two of the 18 trace combos are unreachable by design today: `transport` rows never carry assertions (`shouldEvaluateAssertions` returns false for them), so the two transport+assertion cells exist only to pin the precedence - if either fails, read it as "precedence changed", not "class drifted".

## Run

```bash
node .agents/skills/formal-verify-redirect-trace/check.mts
```

Requires Node >= 22.18 (native TypeScript type-stripping; verified on v24). No install, no build - `exit-code.ts` has only type imports so the compiled `dist/` is not needed. Exits 0 with `ALL CHECKS HOLD`, exits 1 listing each `FAIL` line.

## Coverage record

| Covered | Functions | Notes |
| --- | --- | --- |
| `src/exit-code.ts` | `traceExitCode`, `batchExitCode` | the full precedence table and aggregation |

**Sync commit:** `68a8260` (committed 2026-10-10; verified in sync on 2026-10-24). Move this forward only after re-running the check and confirming the contract describes the code at the new commit.

`check.mts` sits outside every tsconfig (repo `tsc` covers `src/` and `test/` only), so type-level drift in its fixture types is caught by `oxlint`/the run itself, not the repo gate.

Not covered, on purpose: `assertions.ts` (what makes an assertion fail is policy, verified separately), `analyze.ts` (which flags get emitted), and `cli.ts` (that the computed code reaches `process.exit` - covered by the runtime drives in `verify-redirect-trace`).

## Reading a failure

A `FAIL` prints the inputs (`outcome=hop-limit asserts=1 flags=0: got 3 want 4`) - map them straight back to the guard in `src/exit-code.ts`. If the printed pair is legal input, the precedence or aggregation logic regressed; confirm against the contract table above and the runtime drive in `verify-redirect-trace`. If the input cannot occur (e.g. an outcome value outside the three), the check's class lists drifted from the types - update `outcomes`/`classes` in `check.mts`.

## Updating the verification

When a change is intended (a new exit code, a new outcome, reordered precedence - evidence in the change: tests, commit message, docs), update all of: `outcomes`, `assertionClasses`/`flagClasses`, the row `classes`, and both `refTrace`/`refBatch` reference tables. Then break the code the way the contract guards against (delete the error-row check or reorder precedence) and confirm a `FAIL` appears before restoring. Record the new sync commit above.
