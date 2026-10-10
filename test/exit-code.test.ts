import { describe, expect, it } from "vitest";
import type { BatchResult } from "../src/batch.js";
import { batchExitCode, traceExitCode } from "../src/exit-code.js";
import type { AnalyzedTrace } from "../src/model.js";

const failedAssertion = {
  kind: "expect-status" as const,
  expected: 200,
  actual: 500,
  passed: false,
};
const passedAssertion = {
  kind: "expect-status" as const,
  expected: 200,
  actual: 200,
  passed: true,
};
const flag = { kind: "loop" as const, hopIndex: 0, reason: "url repeats" };

const row = (
  outcome?: BatchResult["outcome"],
  assertions: (typeof failedAssertion)[] = [],
  flags: (typeof flag)[] = [],
  error?: string,
): BatchResult => ({
  row: { url: "http://x/", ...(error === undefined ? {} : { error }) },
  ...(outcome === undefined
    ? {}
    : {
        outcome,
        analyzed: { assertions, flags } as AnalyzedTrace,
      }),
});

describe("traceExitCode", () => {
  it("returns 3 for a transport failure", () => {
    expect(traceExitCode({ outcome: "transport", assertions: [], flags: [] })).toBe(3);
  });

  it("returns 3 for a transport failure even beside a failed assertion", () => {
    expect(traceExitCode({ outcome: "transport", assertions: [failedAssertion], flags: [] })).toBe(
      3,
    );
  });

  it("returns 3 for a hop limit with no evaluated assertions", () => {
    expect(traceExitCode({ outcome: "hop-limit", assertions: [], flags: [] })).toBe(3);
  });

  it("returns 4 for a hop limit whose assertion failed", () => {
    expect(traceExitCode({ outcome: "hop-limit", assertions: [failedAssertion], flags: [] })).toBe(
      4,
    );
  });

  it("returns 4 for a failed assertion on a completed trace", () => {
    expect(
      traceExitCode({ outcome: "complete", assertions: [failedAssertion], flags: [flag] }),
    ).toBe(4);
  });

  it("returns 1 for flags on a clean trace", () => {
    expect(
      traceExitCode({ outcome: "complete", assertions: [passedAssertion], flags: [flag] }),
    ).toBe(1);
  });

  it("returns 0 for a clean trace", () => {
    expect(traceExitCode({ outcome: "complete", assertions: [passedAssertion], flags: [] })).toBe(
      0,
    );
  });
});

describe("batchExitCode", () => {
  it("returns 3 when any row has a parse error", () => {
    expect(batchExitCode([row("complete"), row(undefined, [], [], "URL must be valid")])).toBe(3);
  });

  it("returns 3 when any row is a transport failure, over assertion failures", () => {
    expect(batchExitCode([row("complete", [failedAssertion]), row("transport")])).toBe(3);
  });

  it("returns 3 when any row hit the hop limit without a failed assertion", () => {
    expect(batchExitCode([row("complete", [passedAssertion]), row("hop-limit")])).toBe(3);
  });

  it("returns 4 when the worst rows are assertion failures", () => {
    expect(
      batchExitCode([
        row("complete", [passedAssertion], [flag]),
        row("hop-limit", [failedAssertion]),
      ]),
    ).toBe(4);
  });

  it("returns 1 when the worst rows only carry flags", () => {
    expect(batchExitCode([row("complete", [], [flag]), row("complete")])).toBe(1);
  });

  it("returns 0 when every row is clean", () => {
    expect(batchExitCode([row("complete"), row("complete", [passedAssertion])])).toBe(0);
  });
});
