import type { AnalyzedTrace, Flag, HopRecord, Origin, Trace } from "./model.js";
import { diffParams } from "./param-diff.js";

export const sensitiveKeys = new Set([
  "token",
  "access_token",
  "refresh_token",
  "code",
  "secret",
  "client_secret",
  "key",
  "api_key",
  "password",
  "pwd",
  "sig",
  "signature",
  "auth",
  "session",
  "sid",
]);

function normalized(urlText: string, ignoreParams: boolean): string {
  const url = new URL(urlText);
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  )
    url.port = "";
  url.hash = "";
  if (ignoreParams) url.search = "";
  return url.href;
}

function changed(left: Origin, right: Origin): boolean {
  return left.scheme !== right.scheme || left.host !== right.host || left.port !== right.port;
}

function transitionFlag(hop: HopRecord, initialMethod: string): Flag | undefined {
  if (initialMethod.toUpperCase() === "GET") return undefined;
  if (hop.status === 303)
    return {
      kind: "method-semantic-transition",
      hopIndex: hop.index,
      reason: `303 changes ${initialMethod} to GET`,
    };
  if (hop.status === 301 || hop.status === 302)
    return {
      kind: "method-semantic-transition",
      hopIndex: hop.index,
      reason: `${hop.status} may historically change ${initialMethod} to GET`,
    };
  return undefined;
}

export function analyzeTrace(
  trace: Trace,
  options: { ignoreParamsLoop: boolean; showSecrets: boolean; includeTiming: boolean },
): AnalyzedTrace {
  const flags: Flag[] = [];
  const seen = new Set<string>();
  const seenWithoutParams = new Set<string>();
  const hops = trace.hops.map((hop, index) => {
    const hopFlags: Flag[] = [];
    const normal = normalized(hop.requestUrl, false);
    if (seen.has(normal))
      hopFlags.push({ kind: "loop", hopIndex: hop.index, reason: "URL repeats a previous hop" });
    seen.add(normal);
    if (options.ignoreParamsLoop) {
      const withoutParams = normalized(hop.requestUrl, true);
      if (seenWithoutParams.has(withoutParams))
        hopFlags.push({
          kind: "loop-ignoring-params",
          hopIndex: hop.index,
          reason: "URL path repeats when query parameters are ignored",
        });
      seenWithoutParams.add(withoutParams);
    }
    const previous = trace.hops[index - 1];
    if (previous !== undefined) {
      if (changed(previous.origin, hop.origin)) {
        hopFlags.push({
          kind: "cross-origin",
          hopIndex: hop.index,
          reason: "scheme, host, or port changed",
        });
        if (previous.origin.host !== hop.origin.host)
          hopFlags.push({
            kind: "host-change",
            hopIndex: hop.index,
            reason: `${previous.origin.host} to ${hop.origin.host}`,
          });
        if (previous.origin.port !== hop.origin.port)
          hopFlags.push({
            kind: "port-change",
            hopIndex: hop.index,
            reason: `${previous.origin.port} to ${hop.origin.port}`,
          });
      }
      if (previous.origin.scheme === "https" && hop.origin.scheme === "http")
        hopFlags.push({
          kind: "https-downgrade",
          hopIndex: hop.index,
          reason: "HTTPS redirects to HTTP",
        });
    }
    const transition = transitionFlag(hop, trace.initialMethod);
    if (transition !== undefined) hopFlags.push(transition);
    if (index === trace.hops.length - 1 && hop.status !== null && hop.status >= 400)
      hopFlags.push({
        kind: "terminal-error-status",
        hopIndex: hop.index,
        reason: `terminal status is ${hop.status}`,
      });
    flags.push(...hopFlags);
    return {
      ...hop,
      paramDiff:
        previous === undefined ? undefined : diffParams(previous.requestUrl, hop.requestUrl),
      flags: hopFlags,
    };
  });
  return {
    trace,
    hops,
    flags,
    showSecrets: options.showSecrets,
    includeTiming: options.includeTiming,
  };
}
