import type { Trace } from "./model.js";

export function renderTerminal(trace: Trace): string {
  const lines = trace.hops.map((hop) => {
    const result = hop.error
      ? `ERROR: ${hop.error}`
      : hop.resolvedUrl
        ? `-> ${hop.resolvedUrl}`
        : "terminal";
    return `${hop.index + 1}. ${hop.status ?? "ERROR"} ${hop.requestUrl} ${result}`;
  });
  const terminal = trace.hops.at(-1);
  if (terminal?.timingMs !== undefined) lines.push(`Terminal elapsed: ${terminal.timingMs}ms`);
  return `${lines.join("\n")}\n`;
}
