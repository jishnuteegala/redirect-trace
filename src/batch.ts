import { analyzeTrace } from "./analyze.js";
import { evaluateAssertions } from "./assertions.js";
import { traceRedirects, type TraceOptions } from "./engine.js";
import type { AnalyzedTrace } from "./model.js";

export const inputLineCap = 10_000;

export type BatchRow = {
  url: string;
  expectedFinal?: URL;
  error?: string;
  host?: string;
};

export type BatchResult = {
  row: BatchRow;
  analyzed?: AnalyzedTrace;
  outcome?: "complete" | "hop-limit" | "transport";
};

export function shouldEvaluateAssertions(
  outcome: BatchResult["outcome"],
  maxHopsSupplied: boolean,
): boolean {
  return outcome === "complete" || (outcome === "hop-limit" && maxHopsSupplied);
}

export function parseBatchInput(input: string): BatchRow[] {
  const lines = input === "" ? [] : input.replace(/\r?\n$/, "").split(/\r?\n/);
  if (lines.length > inputLineCap)
    throw new Error(`batch input exceeds the ${inputLineCap}-line cap`);
  const rows: BatchRow[] = [];
  for (const line of lines) {
    const columns = line.trim().split(/\s+/).filter(Boolean);
    if (columns.length === 0 || columns[0]?.startsWith("#")) continue;
    if (columns.length > 2) {
      rows.push({ url: columns[0]!, error: "input row has more than two columns" });
      continue;
    }
    let url: URL;
    try {
      url = new URL(columns[0]!);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError();
    } catch {
      rows.push({ url: columns[0]!, error: "URL must be valid and use http or https" });
      continue;
    }
    let expectedFinal: URL | undefined;
    if (columns[1] !== undefined) {
      try {
        expectedFinal = new URL(columns[1]);
        if (expectedFinal.protocol !== "http:" && expectedFinal.protocol !== "https:")
          throw new TypeError();
      } catch {
        rows.push({
          url: url.href,
          error: "expected-final column must be a valid http or https URL",
        });
        continue;
      }
    }
    rows.push({ url: url.href, expectedFinal, host: url.hostname.toLowerCase() });
  }
  return rows;
}

export async function traceBatch(
  rows: BatchRow[],
  options: TraceOptions & {
    expectStatus?: number;
    lax: boolean;
    ignoreParamsLoop: boolean;
    showSecrets: boolean;
    includeTiming: boolean;
    maxHopsSupplied: boolean;
  },
  concurrency: number,
  onComplete: (result: BatchResult) => void,
): Promise<BatchResult[]> {
  const results: BatchResult[] = rows.map((row) => ({ row }));
  const queues = new Map<string, number[]>();
  for (const [index, row] of rows.entries()) {
    if (row.host === undefined) continue;
    const queue = queues.get(row.host) ?? [];
    queue.push(index);
    queues.set(row.host, queue);
  }
  for (const [index, row] of rows.entries()) {
    if (row.error !== undefined) onComplete(results[index]!);
  }
  let running = 0;
  const activeHosts = new Set<string>();
  return new Promise((resolve) => {
    const start = () => {
      while (running < concurrency) {
        const entry = [...queues.entries()].find(
          ([host, queue]) => queue.length > 0 && !activeHosts.has(host),
        );
        if (entry === undefined) {
          if (running === 0) resolve(results);
          return;
        }
        const [host, queue] = entry;
        const index = queue.shift()!;
        activeHosts.add(host);
        running += 1;
        const row = rows[index]!;
        void traceRedirects(new URL(row.url), options)
          .then((result) => {
            const analyzed = {
              ...analyzeTrace(result.trace, options),
              assertions: shouldEvaluateAssertions(result.outcome, options.maxHopsSupplied)
                ? evaluateAssertions(result.trace, { ...options, expectFinal: row.expectedFinal })
                : [],
            };
            results[index] = { row, analyzed, outcome: result.outcome };
            onComplete(results[index]!);
          })
          .finally(() => {
            running -= 1;
            activeHosts.delete(host);
            if (queue.length === 0) queues.delete(host);
            start();
          });
      }
    };
    start();
  });
}

export function batchExitCode(results: BatchResult[]): number {
  let code = 0;
  for (const result of results) {
    if (
      result.row.error !== undefined ||
      result.outcome === "transport" ||
      (result.outcome === "hop-limit" &&
        !result.analyzed?.assertions.some((assertion) => !assertion.passed))
    )
      return 3;
    if (result.analyzed?.assertions.some((assertion) => !assertion.passed))
      code = Math.max(code, 4);
    else if (result.analyzed !== undefined && result.analyzed.flags.length > 0)
      code = Math.max(code, 1);
  }
  return code;
}
