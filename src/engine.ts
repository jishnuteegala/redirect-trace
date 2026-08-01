import type { HopRecord, Trace, TraceResult } from "./model.js";

export type TraceOptions = {
  initialMethod: string;
  maxHops: number;
  timeoutMs: number;
};

function originOf(url: URL) {
  return {
    scheme: url.protocol.slice(0, -1),
    host: url.hostname,
    port: url.port || (url.protocol === "https:" ? "443" : "80"),
  };
}

function failure(trace: Trace, hop: HopRecord, error: string): TraceResult {
  trace.hops.push({ ...hop, error });
  trace.truncated = true;
  return { trace, outcome: "transport" };
}

function limitFailure(trace: Trace, error: string): TraceResult {
  trace.failure = error;
  trace.truncated = true;
  return { trace, outcome: "transport" };
}

function resolveLocation(location: string, base: URL): string {
  const resolved = new URL(location, base);
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    throw new TypeError("Location must resolve to HTTP(S)");
  }

  // Invalid schemes (such as ht!tp://x) are otherwise treated as relative paths.
  if (/^[^/?#]*:\/\//.test(location)) {
    const standalone = new URL(location);
    if (standalone.protocol !== "http:" && standalone.protocol !== "https:") {
      throw new TypeError("Location must use HTTP(S)");
    }
  }

  return resolved.href;
}

function normalizedUrl(url: URL): string {
  const normalized = new URL(url);
  normalized.protocol = normalized.protocol.toLowerCase();
  normalized.hostname = normalized.hostname.toLowerCase();
  if (
    (normalized.protocol === "http:" && normalized.port === "80") ||
    (normalized.protocol === "https:" && normalized.port === "443")
  )
    normalized.port = "";
  normalized.hash = "";
  return normalized.href;
}

async function request(url: URL, timeoutMs: number) {
  const deadline = performance.now() + timeoutMs;
  const fetchWithTimeout = (method: "HEAD" | "GET") => {
    const remainingMs = Math.ceil(deadline - performance.now());
    if (remainingMs <= 0) throw new DOMException("request timed out", "TimeoutError");
    return fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(remainingMs) });
  };

  try {
    const response = await fetchWithTimeout("HEAD");
    if (response.status !== 405 && response.status !== 501)
      return { response, method: "HEAD" as const };
    return {
      response: await fetchWithTimeout("GET"),
      method: "GET" as const,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "TimeoutError") throw error;
    return { response: await fetchWithTimeout("GET"), method: "GET" as const };
  }
}

export async function traceRedirects(startUrl: URL, options: TraceOptions): Promise<TraceResult> {
  const trace: Trace = {
    startUrl: startUrl.href,
    initialMethod: options.initialMethod,
    hops: [],
    terminal: { status: null, url: startUrl.href },
    hopLimit: options.maxHops,
    timeoutMs: options.timeoutMs,
    truncated: false,
  };
  let url = startUrl;
  const seen = new Set<string>();

  for (let index = 0; ; index += 1) {
    if (index >= options.maxHops) {
      return limitFailure(trace, `hop limit of ${options.maxHops} exceeded`);
    }
    const repeatsUrl = seen.has(normalizedUrl(url));
    seen.add(normalizedUrl(url));

    let response: Response;
    let requestMethod: "HEAD" | "GET";
    const startedAt = performance.now();
    try {
      ({ response, method: requestMethod } = await request(url, options.timeoutMs));
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.name === "TimeoutError"
          ? "request timed out"
          : "request failed";
      const hop: HopRecord = {
        index,
        requestMethod: "HEAD",
        requestUrl: url.href,
        status: null,
        location: null,
        resolvedUrl: null,
        origin: originOf(url),
        fragment: url.hash || null,
      };
      return failure(trace, hop, message);
    }

    const location = response.headers.get("location");
    const isRedirect = response.status >= 300 && response.status < 400;
    let resolvedUrl: string | null = null;
    if (location !== null) {
      try {
        resolvedUrl = resolveLocation(location, url);
      } catch {
        const hop: HopRecord = {
          index,
          requestMethod,
          requestUrl: url.href,
          status: response.status,
          location,
          resolvedUrl: null,
          origin: originOf(url),
          fragment: url.hash || null,
        };
        return failure(trace, hop, "invalid Location header");
      }
    }
    const hop: HopRecord = {
      index,
      requestMethod,
      requestUrl: url.href,
      status: response.status,
      location,
      resolvedUrl,
      origin: originOf(url),
      fragment: url.hash || null,
    };

    if (isRedirect && location === null) {
      return failure(trace, hop, "redirect response has no Location header");
    }
    if (!isRedirect) {
      trace.hops.push({ ...hop, timingMs: Math.round(performance.now() - startedAt) });
      trace.terminal = { status: response.status, url: url.href };
      return { trace, outcome: "complete" };
    }
    trace.hops.push(hop);
    if (repeatsUrl) {
      trace.terminal = { status: response.status, url: url.href };
      return { trace, outcome: "complete" };
    }
    url = new URL(resolvedUrl!);
  }
}
