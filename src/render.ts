import type { AnalyzedTrace, ParamDiff } from "./model.js";
import { sensitiveKeys } from "./analyze.js";

function maskValue(key: string, value: string, showSecrets: boolean): string {
  return !showSecrets && sensitiveKeys.has(key.toLowerCase()) ? "***" : value;
}

function params(values: { key: string; values: string[] }[], showSecrets: boolean): string {
  return values
    .map(
      ({ key, values: entries }) =>
        `${key}=${entries.map((value) => maskValue(key, value, showSecrets)).join(",")}`,
    )
    .join("; ");
}

function diff(diff: ParamDiff | undefined, showSecrets: boolean): string[] {
  if (diff === undefined) return [];
  return [
    ...diff.added.map((entry) => `added ${params([entry], showSecrets)}`),
    ...diff.changed.map(
      (entry) =>
        `changed ${entry.key}=${entry.before.map((value) => maskValue(entry.key, value, showSecrets)).join(",")} -> ${entry.after.map((value) => maskValue(entry.key, value, showSecrets)).join(",")}`,
    ),
    ...diff.dropped.map((entry) => `dropped ${params([entry], showSecrets)}`),
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
      return !showSecrets && sensitiveKeys.has(decodeURIComponent(key).toLowerCase())
        ? `${key}=***`
        : part;
    });
  url.search = query.length === 0 ? "" : `?${query.join("&")}`;
  return url.href;
}

function displayLocation(location: string, requestUrl: string, showSecrets: boolean): string {
  try {
    return displayUrl(new URL(location, requestUrl).href, showSecrets);
  } catch {
    return location;
  }
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
    result.push(...diff(hop.paramDiff, analyzed.showSecrets).map((item) => `   params: ${item}`));
    result.push(...hop.flags.map((flag) => `   flag: ${flag.kind}: ${flag.reason}`));
    if (hop.timingMs !== undefined) result.push(`   elapsed: ${hop.timingMs}ms`);
    return result;
  });
  if (analyzed.trace.failure !== undefined) lines.push(`ERROR: ${analyzed.trace.failure}`);
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
    lines.push(...diff(hop.paramDiff, analyzed.showSecrets).map((item) => `- Params: ${item}`));
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
  return `${lines.join("\n")}\n`;
}

export function renderJson(analyzed: AnalyzedTrace): string {
  return `${JSON.stringify({ startUrl: displayUrl(analyzed.trace.startUrl, analyzed.showSecrets), initialMethod: analyzed.trace.initialMethod, terminal: { status: analyzed.trace.terminal.status, url: displayUrl(analyzed.trace.terminal.url, analyzed.showSecrets) }, truncated: analyzed.trace.truncated, failure: analyzed.trace.failure ?? null, hops: analyzed.hops.map((hop) => jsonHop(analyzed, hop)), flags: analyzed.flags }, null, 2)}\n`;
}
