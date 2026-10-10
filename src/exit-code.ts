import type { Assertion, Flag, TraceResult } from "./model.js";
import type { BatchResult } from "./batch.js";

// Precedence: transport or unresolved hop limit (3) dominates, then assertion
// failure (4), then flags (1), then clean (0).
export function traceExitCode(trace: {
  outcome: TraceResult["outcome"];
  assertions: Assertion[];
  flags: Flag[];
}): number {
  if (trace.outcome === "transport") return 3;
  if (trace.assertions.some((assertion) => !assertion.passed)) return 4;
  if (trace.outcome === "hop-limit") return 3;
  return trace.flags.length > 0 ? 1 : 0;
}

export function batchExitCode(results: BatchResult[]): number {
  let code = 0;
  for (const result of results) {
    if (result.row.error !== undefined) return 3;
    if (result.outcome === undefined) continue;
    const rowCode = traceExitCode({
      outcome: result.outcome,
      assertions: result.analyzed?.assertions ?? [],
      flags: result.analyzed?.flags ?? [],
    });
    if (rowCode === 3) return 3;
    code = Math.max(code, rowCode);
  }
  return code;
}
