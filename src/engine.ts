import type { HopRecord, Trace, TraceResult } from "./model.js";

export type TraceOptions = {
  initialMethod: string;
  maxHops: number;
  timeoutMs: number;
};

function originOf(url: URL) {
  return { scheme: url.protocol.slice(0, -1), host: url.hostname, port: url.port };
}

function failure(trace: Trace, hop: HopRecord, error: string): TraceResult {
  trace.hops.push({ ...hop, error });
  trace.truncated = true;
  return { trace, outcome: "transport" };
}

async function request(url: URL, timeoutMs: number) {
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (
    response.status === 405 ||
    response.status === 501 ||
    response.status < 200 ||
    response.status >= 400
  ) {
    return {
      response: await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      }),
      method: "GET" as const,
    };
  }
  return { response, method: "HEAD" as const };
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

  for (let index = 0; ; index += 1) {
    if (index >= options.maxHops) {
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
      return failure(trace, hop, `hop limit of ${options.maxHops} exceeded`);
    }

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
        resolvedUrl = new URL(location, url).href;
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
    url = new URL(resolvedUrl!);
  }
}
