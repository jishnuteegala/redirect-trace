import type { Trace } from "./model.js";

export function renderTerminal(trace: Trace): string {
  const lines = trace.hops.map((hop) => {
    const result = hop.error
      ? hop.status === null
        ? hop.error
        : `ERROR: ${hop.error}`
      : hop.resolvedUrl
        ? `-> ${hop.resolvedUrl}`
        : "completed";
    return `${hop.index + 1}. ${hop.status ?? "ERROR"} ${hop.requestUrl} ${result}`;
  });
  const terminal = trace.hops.at(-1);
  if (terminal?.timingMs !== undefined) lines.push(`Terminal elapsed: ${terminal.timingMs}ms`);
  if (trace.failure !== undefined) lines.push(`ERROR: ${trace.failure}`);
  return `${lines.join("\n")}\n`;
}
