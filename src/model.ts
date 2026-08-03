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
  loopDetected: boolean;
  failure?: string;
};

export type TraceResult =
  | { trace: Trace; outcome: "complete" }
  | { trace: Trace; outcome: "hop-limit" }
  | { trace: Trace; outcome: "transport" };

export type ParamValues = { key: string; values: string[] };

export type ParamDiff = {
  added: ParamValues[];
  dropped: ParamValues[];
  changed: { key: string; before: string[]; after: string[] }[];
};

export type FlagKind =
  | "loop"
  | "loop-ignoring-params"
  | "https-downgrade"
  | "cross-origin"
  | "host-change"
  | "port-change"
  | "method-semantic-transition"
  | "terminal-error-status";

export type Flag = { kind: FlagKind; hopIndex: number; reason: string };

export type AnalyzedHop = HopRecord & { paramDiff?: ParamDiff; flags: Flag[] };

export type AnalyzedTrace = {
  trace: Trace;
  hops: AnalyzedHop[];
  flags: Flag[];
  assertions: Assertion[];
  showSecrets: boolean;
  includeTiming: boolean;
};

export type Assertion = {
  kind: "expect-final" | "expect-status" | "max-hops";
  expected: string | number;
  actual: string | number | null;
  passed: boolean;
  normalization?: "trailing-slash" | "http-to-https" | "tracking-params";
  note?: string;
};
