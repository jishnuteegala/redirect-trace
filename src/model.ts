export type Origin = {
  scheme: string;
  host: string;
  port: string;
};

export type HopRecord = {
  index: number;
  requestMethod: "HEAD" | "GET";
  requestUrl: string;
  status: number | null;
  location: string | null;
  resolvedUrl: string | null;
  origin: Origin;
  fragment: string | null;
  timingMs?: number;
  error?: string;
};

export type Trace = {
  startUrl: string;
  initialMethod: string;
  hops: HopRecord[];
  terminal: { status: number | null; url: string };
  hopLimit: number;
  timeoutMs: number;
  truncated: boolean;
  failure?: string;
};

export type TraceResult =
  | { trace: Trace; outcome: "complete" }
  | { trace: Trace; outcome: "transport" };
