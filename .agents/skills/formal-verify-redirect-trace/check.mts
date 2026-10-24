import { traceExitCode, batchExitCode } from "../../../src/exit-code.ts";
import type { Assertion, AnalyzedTrace, Flag, Trace } from "../../../src/model.ts";
import type { BatchResult } from "../../../src/batch.ts";

// Exhaustive verifier for src/exit-code.ts.
// Runs the real traceExitCode/batchExitCode over every input class the
// domain allows and asserts the exit-code contract in SKILL.md.
// Any failure prints the inputs and exits 1.

const outcomes = ["complete", "hop-limit", "transport"] as const;
type Outcome = (typeof outcomes)[number];

const passA: Assertion = { kind: "expect-final", expected: "e", actual: "e", passed: true };
const failA: Assertion = { kind: "expect-final", expected: "e", actual: "a", passed: false };
const flag: Flag = { kind: "loop", hopIndex: 0, reason: "r" };

const assertionClasses: Assertion[][] = [[], [passA], [passA, failA]];
const flagClasses: Flag[][] = [[], [flag]];

let failures = 0;
function check(label: string, bad: string[]) {
  if (bad.length === 0) {
    console.log(`PASS ${label}`);
    return;
  }
  failures++;
  console.log(`FAIL ${label} - ${bad[0]}${bad.length > 1 ? ` (+${bad.length - 1} more)` : ""}`);
}

// Reference contract: 3 infra (transport, unresolved hop-limit) dominates,
// then 4 assertion failure, then 1 flags, then 0 clean.
function refTrace(outcome: Outcome, assertFail: boolean, flagCount: number): number {
  if (outcome === "transport") return 3;
  if (assertFail) return 4;
  if (outcome === "hop-limit") return 3;
  return flagCount > 0 ? 1 : 0;
}

// T1: all 18 (outcome, assertion-class, flag-class) combos.
const t1: string[] = [];
for (const outcome of outcomes)
  for (const assertions of assertionClasses)
    for (const flags of flagClasses) {
      const got = traceExitCode({ outcome, assertions, flags });
      const want = refTrace(
        outcome,
        assertions.some((a) => !a.passed),
        flags.length,
      );
      if (got !== want)
        t1.push(
          `outcome=${outcome} asserts=${assertions.length} flags=${flags.length}: got ${got} want ${want}`,
        );
    }
check("T1 traceExitCode: all 18 input classes produce the documented code", t1);

// Batch row classes, labeled by the code they contribute.
const emptyTrace: Trace = {
  startUrl: "https://example.com",
  initialMethod: "HEAD",
  hops: [],
  terminal: { status: null, url: "https://example.com" },
  hopLimit: 0,
  timeoutMs: 0,
  truncated: false,
  loopDetected: false,
};
const analyzed = (assertions: Assertion[], flags: Flag[]): AnalyzedTrace => ({
  trace: emptyTrace,
  hops: [],
  flags,
  assertions,
  showSecrets: false,
  includeTiming: false,
});
const E = (): BatchResult => ({ row: { url: "u", error: "bad url" } });
const E0 = (): BatchResult => ({ row: { url: "u", error: "" } }); // defined-but-empty: still an error row
const S = (): BatchResult => ({ row: { url: "u" } }); // no outcome: skipped
const U = (): BatchResult => ({
  // analyzed present but outcome undefined: the outcome===undefined skip must
  // fire before assertions/flags are read, else this contributes 4 not 0.
  row: { url: "u" },
  analyzed: analyzed([failA], [flag]),
});
const C0 = (): BatchResult => ({
  row: { url: "u" },
  outcome: "complete",
  analyzed: analyzed([passA], []),
});
const F1 = (): BatchResult => ({
  row: { url: "u" },
  outcome: "complete",
  analyzed: analyzed([passA], [flag]),
});
const X3 = (): BatchResult => ({
  row: { url: "u" },
  outcome: "transport",
  analyzed: analyzed([failA], [flag]),
});
const A4 = (): BatchResult => ({
  row: { url: "u" },
  outcome: "complete",
  analyzed: analyzed([failA], [flag]),
});
const classes = { E, E0, S, U, C0, F1, X3, A4 } as const;
type ClassName = keyof typeof classes;

// Reference: any 3-class row (error, or traceExitCode 3) forces 3;
// otherwise worst-of over 4 > 1 > 0, skips contribute nothing.
function refBatch(names: ClassName[]): number {
  if (names.some((n) => n === "E" || n === "E0" || n === "X3")) return 3;
  if (names.includes("A4")) return 4;
  if (names.includes("F1")) return 1;
  return 0;
}

// B1-B3: edge cases - empty batch, all-skip batch, error row.
const b: string[] = [];
if (batchExitCode([]) !== 0) b.push(`[] -> ${batchExitCode([])} want 0`);
if (batchExitCode([S(), S()]) !== 0) b.push(`[S,S] -> ${batchExitCode([S(), S()])} want 0`);
if (batchExitCode([A4(), E()]) !== 3) b.push(`[A4,E] -> ${batchExitCode([A4(), E()])} want 3`);
check("B1-B3 edge cases: empty -> 0, all-skip -> 0, error row -> 3", b);

// B4: every ordered sequence of length 1..3 over the eight classes.
const b4: string[] = [];
const names: ClassName[] = ["E", "E0", "S", "U", "C0", "F1", "X3", "A4"];
function* seqs(len: number, prefix: ClassName[] = []): Generator<ClassName[]> {
  if (prefix.length === len) {
    yield prefix;
    return;
  }
  for (const n of names) yield* seqs(len, [...prefix, n]);
}
let seqCount = 0;
for (const len of [1, 2, 3])
  for (const seq of seqs(len)) {
    seqCount++;
    const got = batchExitCode(seq.map((n) => classes[n]()));
    const want = refBatch(seq);
    if (got !== want) b4.push(`[${seq.join(",")}] -> ${got} want ${want}`);
  }
check(`B4 batchExitCode: all ${seqCount} ordered row-class sequences aggregate worst-of`, b4);

// B5: order invariance on the full mixed multiset.
const multiset: ClassName[] = ["S", "U", "C0", "F1", "A4", "E", "X3"];
const perms: ClassName[][] = [];
function* permsOf(rest: ClassName[], prefix: ClassName[] = []): Generator<ClassName[]> {
  if (rest.length === 0) {
    yield prefix;
    return;
  }
  for (const [i, item] of rest.entries())
    yield* permsOf([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, item]);
}
for (const p of permsOf(multiset)) perms.push(p);
const b5 = perms
  .map((p) => [p.join(","), batchExitCode(p.map((n) => classes[n]()))] as const)
  .filter(([, got]) => got !== 3)
  .map(([p, got]) => `[${p}] -> ${got} want 3`);
check(`B5 order invariance: all ${perms.length} permutations of the mixed multiset -> 3`, b5);

// B6: analyzed === undefined still honors the outcome (?? [] fallback).
const b6: string[] = [];
const noAnalysis = (outcome: Outcome): BatchResult => ({ row: { url: "u" }, outcome });
const b6cases: [Outcome, number][] = [
  ["complete", 0],
  ["hop-limit", 3],
  ["transport", 3],
];
for (const [outcome, want] of b6cases) {
  const got = batchExitCode([noAnalysis(outcome)]);
  if (got !== want) b6.push(`outcome=${outcome} analyzed=undefined -> ${got} want ${want}`);
}
check("B6 analyzed=undefined rows still honor their outcome", b6);

if (failures === 0) {
  console.log(`\nALL CHECKS HOLD: 18 trace combos, ${seqCount + perms.length + 6} batch runs`);
} else {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
