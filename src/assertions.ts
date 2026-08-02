import type { Assertion, Trace } from "./model.js";
import { decode } from "./param-diff.js";

export type AssertionOptions = {
  expectFinal?: URL;
  expectStatus?: number;
  maxHopsSupplied: boolean;
  maxHops: number;
  lax: boolean;
};

type Normalization = NonNullable<Assertion["normalization"]>;

function normalize(url: URL, rule: Normalization): string {
  const normalized = new URL(url.href);
  if (rule === "trailing-slash" && normalized.pathname.length > 1)
    normalized.pathname = normalized.pathname.replace(/\/+$/, "");
  if (rule === "http-to-https" && normalized.protocol === "http:") normalized.protocol = "https:";
  if (rule === "tracking-params") {
    const params = normalized.search
      .slice(1)
      .split("&")
      .filter((part) => {
        const equals = part.indexOf("=");
        const key = decode(equals < 0 ? part : part.slice(0, equals)).toLowerCase();
        return !key.startsWith("utm_") && !["gclid", "fbclid"].includes(key);
      });
    normalized.search = params.join("&");
  }
  return normalized.href;
}

function finalAssertion(expected: URL, actual: URL, lax: boolean): Assertion {
  if (expected.href === actual.href)
    return { kind: "expect-final", expected: expected.href, actual: actual.href, passed: true };
  const rules: Normalization[] = ["trailing-slash", "http-to-https", "tracking-params"];
  const matchingRule = rules.find((rule) => normalize(expected, rule) === normalize(actual, rule));
  if (lax) {
    const expectedLax = rules.reduce((url, rule) => new URL(normalize(url, rule)), expected);
    const actualLax = rules.reduce((url, rule) => new URL(normalize(url, rule)), actual);
    const normalization = rules.find(
      (rule) => normalize(expected, rule) === normalize(actual, rule),
    );
    return {
      kind: "expect-final",
      expected: expected.href,
      actual: actual.href,
      passed: expectedLax.href === actualLax.href,
      ...(normalization === undefined ? {} : { normalization }),
    };
  }
  return {
    kind: "expect-final",
    expected: expected.href,
    actual: actual.href,
    passed: false,
    ...(matchingRule === undefined ? {} : { normalization: matchingRule }),
  };
}

function indeterminateAssertion(
  kind: "expect-final" | "expect-status",
  expected: URL | number,
): Assertion {
  return {
    kind,
    expected: expected instanceof URL ? expected.href : expected,
    actual: null,
    passed: false,
    note: "not evaluated: chain did not terminate",
  };
}

export function evaluateAssertions(trace: Trace, options: AssertionOptions): Assertion[] {
  const assertions: Assertion[] = [];
  const terminated = trace.terminal.status !== null && !trace.loopDetected;
  if (options.expectFinal !== undefined)
    assertions.push(
      terminated
        ? finalAssertion(options.expectFinal, new URL(trace.terminal.url), options.lax)
        : indeterminateAssertion("expect-final", options.expectFinal),
    );
  if (options.expectStatus !== undefined)
    assertions.push({
      ...(terminated
        ? {
            kind: "expect-status" as const,
            expected: options.expectStatus,
            actual: trace.terminal.status,
            passed: options.expectStatus === trace.terminal.status,
          }
        : indeterminateAssertion("expect-status", options.expectStatus)),
    });
  if (options.maxHopsSupplied) {
    const redirects = trace.hops.filter(
      (hop) => hop.status !== null && hop.status >= 300 && hop.status < 400,
    ).length;
    assertions.push({
      kind: "max-hops",
      expected: options.maxHops,
      actual: trace.loopDetected ? "loop" : redirects,
      passed: !trace.loopDetected && redirects <= options.maxHops,
      ...(trace.loopDetected ? { note: "chain did not terminate: redirect loop" } : {}),
    });
  }
  return assertions;
}
