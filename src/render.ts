import type { BatchResult } from "./batch.js";
import type { AnalyzedTrace, Assertion, ParamDiff } from "./model.js";
import { sensitiveKeys } from "./analyze.js";
import { decode } from "./param-diff.js";

function maskValue(key: string, value: string, showSecrets: boolean): string {
  return !showSecrets && sensitiveKeys.has(key.toLowerCase()) ? "***" : value;
}

function renderParamList(
  values: { key: string; values: string[] }[],
  showSecrets: boolean,
): string {
  return values
    .map(
      ({ key, values: entries }) =>
        `${key}=${entries.map((value) => maskValue(key, value, showSecrets)).join(",")}`,
    )
    .join("; ");
}

function renderDiffLines(paramDiff: ParamDiff | undefined, showSecrets: boolean): string[] {
  if (paramDiff === undefined) return [];
  return [
    ...paramDiff.added.map((entry) => `added ${renderParamList([entry], showSecrets)}`),
    ...paramDiff.changed.map(
      (entry) =>
        `changed ${entry.key}=${entry.before.map((value) => maskValue(entry.key, value, showSecrets)).join(",")} -> ${entry.after.map((value) => maskValue(entry.key, value, showSecrets)).join(",")}`,
    ),
    ...paramDiff.dropped.map((entry) => `dropped ${renderParamList([entry], showSecrets)}`),
  ];
}

function displayUrl(urlText: string, showSecrets: boolean): string {
  const url = new URL(urlText);
  const query = url.search
    .slice(1)
    .split("&")
    .filter(Boolean)
    .map((part) => {
      const equals = part.indexOf("=");
      const key = equals < 0 ? part : part.slice(0, equals);
      return !showSecrets && sensitiveKeys.has(decode(key).toLowerCase()) ? `${key}=***` : part;
    });
  url.search = query.length === 0 ? "" : `?${query.join("&")}`;
  return url.href;
}

function displayBatchUrl(urlText: string, showSecrets: boolean): string {
  try {
    return displayUrl(urlText, showSecrets);
  } catch {
    const queryStart = urlText.indexOf("?");
    if (showSecrets || queryStart < 0) return urlText;
    const prefix = urlText.slice(0, queryStart + 1);
    return `${prefix}${urlText
      .slice(queryStart + 1)
      .split("&")
      .map((part) => {
        const equals = part.indexOf("=");
        const key = equals < 0 ? part : part.slice(0, equals);
        return sensitiveKeys.has(decode(key).toLowerCase()) ? `${key}=***` : part;
      })
      .join("&")}`;
  }
}

function displayLocation(location: string, requestUrl: string, showSecrets: boolean): string {
  try {
    return displayUrl(new URL(location, requestUrl).href, showSecrets);
  } catch {
    return location;
  }
}

function displayedAssertion(assertion: Assertion, showSecrets: boolean): Assertion {
  if (assertion.kind !== "expect-final") return assertion;
  return {
    ...assertion,
    expected: displayUrl(assertion.expected as string, showSecrets),
    ...(assertion.actual === null
      ? {}
      : { actual: displayUrl(assertion.actual as string, showSecrets) }),
  };
}

function assertionLine(assertion: Assertion, showSecrets: boolean): string {
  const displayed = displayedAssertion(assertion, showSecrets);
  const detail = `expected ${displayed.expected}, got ${displayed.actual}`;
  const maskedDifference =
    assertion.kind === "expect-final" &&
    !assertion.passed &&
    assertion.expected !== assertion.actual &&
    displayed.expected === displayed.actual
      ? " (values differ only in masked query parameters)"
      : "";
  return `${displayed.kind}: ${detail}${maskedDifference}${displayed.normalization === undefined ? "" : ` (would pass under lax rule: ${displayed.normalization})`}${displayed.note === undefined ? "" : ` (${displayed.note})`}`;
}

function jsonHop(analyzed: AnalyzedTrace, hop: AnalyzedTrace["hops"][number]) {
  return {
    index: hop.index,
    requestMethod: hop.requestMethod,
    requestUrl: displayUrl(hop.requestUrl, analyzed.showSecrets),
    status: hop.status,
    location:
      hop.location === null
        ? null
        : displayLocation(hop.location, hop.requestUrl, analyzed.showSecrets),
    resolvedUrl:
      hop.resolvedUrl === null ? null : displayUrl(hop.resolvedUrl, analyzed.showSecrets),
    origin: hop.origin,
    fragment: hop.fragment,
    ...(hop.paramDiff === undefined
      ? {}
      : { paramDiff: maskedDiff(hop.paramDiff, analyzed.showSecrets) }),
    flags: hop.flags,
    ...(analyzed.includeTiming && hop.timingMs !== undefined ? { timingMs: hop.timingMs } : {}),
    ...(hop.error === undefined ? {} : { error: hop.error }),
  };
}

function maskedDiff(diff: ParamDiff, showSecrets: boolean): ParamDiff {
  const values = (entries: { key: string; values: string[] }[]) =>
    entries.map(({ key, values }) => ({
      key,
      values: values.map((value) => maskValue(key, value, showSecrets)),
    }));
  return {
    added: values(diff.added),
    dropped: values(diff.dropped),
    changed: diff.changed.map(({ key, before, after }) => ({
      key,
      before: before.map((value) => maskValue(key, value, showSecrets)),
      after: after.map((value) => maskValue(key, value, showSecrets)),
    })),
  };
}

export function renderTerminal(analyzed: AnalyzedTrace): string {
  const lines = analyzed.hops.flatMap((hop) => {
    const details =
      hop.error ??
      (hop.resolvedUrl === null
        ? "completed"
        : `-> ${displayUrl(hop.resolvedUrl, analyzed.showSecrets)}`);
    const result = [
      `${hop.index + 1}. ${hop.status ?? "ERROR"} ${displayUrl(hop.requestUrl, analyzed.showSecrets)} ${details}`,
    ];
    if (hop.fragment !== null) result.push(`   fragment: ${hop.fragment} (not sent to server)`);
    result.push(
      ...renderDiffLines(hop.paramDiff, analyzed.showSecrets).map((item) => `   params: ${item}`),
    );
    result.push(...hop.flags.map((flag) => `   flag: ${flag.kind}: ${flag.reason}`));
    if (hop.timingMs !== undefined) result.push(`   elapsed: ${hop.timingMs}ms`);
    return result;
  });
  if (analyzed.trace.failure !== undefined) lines.push(`ERROR: ${analyzed.trace.failure}`);
  lines.push(
    ...analyzed.assertions
      .filter((assertion) => !assertion.passed)
      .map((assertion) => assertionLine(assertion, analyzed.showSecrets)),
  );
  const terminal = analyzed.hops.at(-1);
  if (terminal?.timingMs !== undefined) lines.push(`Terminal elapsed: ${terminal.timingMs}ms`);
  return `${lines.join("\n")}\n`;
}

export function renderMarkdown(analyzed: AnalyzedTrace): string {
  const lines = [
    "# Redirect trace",
    "",
    `Start: ${displayUrl(analyzed.trace.startUrl, analyzed.showSecrets)}`,
    "",
    "## Hops",
  ];
  for (const hop of analyzed.hops) {
    lines.push(
      "",
      `### ${hop.index + 1}. ${hop.status ?? "ERROR"}`,
      "",
      `- URL: ${displayUrl(hop.requestUrl, analyzed.showSecrets)}`,
    );
    if (hop.resolvedUrl !== null)
      lines.push(`- Destination: ${displayUrl(hop.resolvedUrl, analyzed.showSecrets)}`);
    if (hop.fragment !== null) lines.push(`- Fragment: ${hop.fragment} (not sent to server)`);
    lines.push(
      ...renderDiffLines(hop.paramDiff, analyzed.showSecrets).map((item) => `- Params: ${item}`),
    );
    lines.push(...hop.flags.map((flag) => `- Flag: ${flag.kind} (${flag.reason})`));
    if (analyzed.includeTiming && hop.timingMs !== undefined)
      lines.push(`- Timing: ${hop.timingMs}ms`);
    if (hop.error !== undefined) lines.push(`- Error: ${hop.error}`);
  }
  lines.push(
    "",
    "## Flags",
    "",
    ...(analyzed.flags.length === 0
      ? ["None."]
      : analyzed.flags.map((flag) => `- Hop ${flag.hopIndex + 1}: ${flag.kind} - ${flag.reason}`)),
  );
  if (analyzed.assertions.length > 0)
    lines.push(
      "",
      "## Assertions",
      "",
      ...analyzed.assertions.map((assertion) =>
        assertion.passed
          ? `- ${assertion.kind}: passed`
          : `- ${assertionLine(assertion, analyzed.showSecrets)}`,
      ),
    );
  return `${lines.join("\n")}\n`;
}

export function renderJson(analyzed: AnalyzedTrace): string {
  return `${JSON.stringify(jsonTrace(analyzed), null, 2)}\n`;
}

function jsonTrace(analyzed: AnalyzedTrace) {
  return {
    startUrl: displayUrl(analyzed.trace.startUrl, analyzed.showSecrets),
    initialMethod: analyzed.trace.initialMethod,
    terminal: {
      status: analyzed.trace.terminal.status,
      url: displayUrl(analyzed.trace.terminal.url, analyzed.showSecrets),
    },
    truncated: analyzed.trace.truncated,
    loopDetected: analyzed.trace.loopDetected,
    failure: analyzed.trace.failure ?? null,
    hops: analyzed.hops.map((hop) => jsonHop(analyzed, hop)),
    flags: analyzed.flags,
    assertions: analyzed.assertions.map((assertion) =>
      displayedAssertion(assertion, analyzed.showSecrets),
    ),
  };
}

function batchDetails(result: BatchResult) {
  if (result.row.error !== undefined)
    return { final: result.row.error, hops: "-", verdict: "FAIL", reason: result.row.error };
  const analyzed = result.analyzed!;
  const failed = analyzed.assertions.find((assertion) => !assertion.passed);
  const flag = analyzed.flags[0];
  const failure = analyzed.trace.failure ?? analyzed.hops.at(-1)?.error;
  return {
    final: displayBatchUrl(analyzed.trace.terminal.url, analyzed.showSecrets),
    hops: String(
      analyzed.hops.filter((hop) => hop.status !== null && hop.status >= 300 && hop.status < 400)
        .length,
    ),
    verdict:
      failure === undefined && failed === undefined
        ? flag === undefined
          ? "PASS"
          : "FLAG"
        : "FAIL",
    reason: failure ?? failed?.kind ?? flag?.kind ?? "-",
  };
}

export function renderBatchTerminalLine(result: BatchResult, showSecrets: boolean): string {
  const details = batchDetails(result);
  return `${details.verdict} ${displayBatchUrl(result.row.url, showSecrets)} -> ${details.final} (${details.reason})`;
}

export function renderBatchTerminal(results: BatchResult[], showSecrets: boolean): string {
  return renderBatchSummary(results, showSecrets);
}

export function renderBatchMarkdown(results: BatchResult[], showSecrets: boolean): string {
  return renderBatchSummary(results, showSecrets);
}

function renderBatchSummary(results: BatchResult[], showSecrets: boolean): string {
  const lines = ["| URL | Final | Hops | Result | Detail |", "| --- | --- | --- | --- | --- |"];
  for (const result of results) {
    const details = batchDetails(result);
    lines.push(
      `| ${displayBatchUrl(result.row.url, showSecrets)} | ${details.final} | ${details.hops} | ${details.verdict} | ${details.reason} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderBatchJson(
  results: BatchResult[],
  showSecrets: boolean,
  initialMethod: string,
): string {
  return `${JSON.stringify(
    results.map((result) =>
      result.analyzed === undefined
        ? {
            startUrl: displayBatchUrl(result.row.url, showSecrets),
            initialMethod,
            terminal: { status: null, url: displayBatchUrl(result.row.url, showSecrets) },
            loopDetected: false,
            failure: result.row.error,
            hops: [],
            flags: [],
            assertions: [],
          }
        : jsonTrace(result.analyzed),
    ),
    null,
    2,
  )}\n`;
}
