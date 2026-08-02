import { createServer, type RequestListener } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateAssertions } from "../src/assertions.js";
import { traceRedirects } from "../src/engine.js";
import type { Trace } from "../src/model.js";

const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDydZV6tnIP4QyB
0u81+Hok3dyXrfpou/arxVzbbC+nt7JPwJjgmMNMesDpqMzlV+AAKmkrR+F6rHlW
urSDdsb2QYCkHY4aQfwOcZhwswe5hM9fsYmwH6/eHIIrYNTBoOSvCM8P97beys4u
5HRAu2ZbYgvVL2QPHV+umKVU8aL7kaV3q6jAuGvgTpn/zcPitrCa9Y+dbHmgQCHL
a6goXk92Uy6N02atiuUVecqnFVR/ytp0Mw6HimJWB/fVLIHzzbTfPMkBeRx1gxFk
aGnjDhyfja96iyv0dARy1GABYbFcM2EJPYTjkh3q0//HAGQIMTzFySARgyzLzjLS
S1EQKH43AgMBAAECggEAA2mAz7swklhvvuxgHgmf3AcpR9/7Ba1OtK69Q0zbxAfG
re7Y1+3rPBczW5za1IfVKOHWUA8dzuzaQLLo8zt6ylPN3FsA7HRGq7ddvO983Nec
vLNSOKHOU+X7ApXexW84hXdH+E9B1uA4xzOQDt2N4ukkbHzs8txOQ+lCOzAZXWJY
BzDRCZwA28qsMTZItJyYje6IlrXC9RK5XkbcfrV/yvwhxZhmWwmcczpphDiZ7oFE
kImIaXXvxmWxwhe17inQeXB4Px8k4k0ZTVunXOTXuOM4VBB1RpgYGGdVhufXUV52
pwcKLL8fR2kGh6QF+TdWuTTkW9cZmatUfqzArEaVDQKBgQD8WK8P97YuXCuS5VrU
W/2X0fLnzqkFQG/x2AvZywUv7n6WibJeS+H1vTK21Z3kunjeA5Cydg54ZInbmF2B
OxUT+zHB6wz5t22/KQ1wrhVWv02IzOpytpXMSoLbNwTf/1lszE44y6eQg7/FK0cZ
bP/ozJ8EYMZhItE8hUz+/OL+OwKBgQD1+ED0Jy0FsuXwkbLFa6jsj6P/3hlXxUZw
PCTi8MsXdTLlMy8642dnoaYo0iC1xXyoFgJiV9VycPzU/V2OCcIjeJzIMXzfFj5K
ByEmhTb/vYPml6X1YD07xDg5TxqckREg35A63D17dnuVcAUeaBbWTl+MprN1QxW7
Jl7mkNPUNQKBgQDJNW1hLgL1tEiKOJbT/QWXqLAmZYIfztPZ4oqQfnEEZwZIwkKX
LapeZx2o62ualZUKcY1OvxOKq5/AmRz1jkagSArEtMcD1l6LrhApaKVbJe6Mxdeq
4CtRWZg9cwFQGisTtVQptTlG4cZnULrAa0kiNwYUV5XWngx4VVGvf7T/QQKBgQCe
2g5w3+AmvwvbWu0+rLHy3S2IMJLjaWd9Uopr+iDfbHRLK8xD1ttQRUh/Mn2nhvxj
vZsakikqeKgAkgTal5jGub1fWP6RQNdHjeUt8Hi9n1JRGP04REgnkijRcjH4jYOn
XFrUeKpIUxOrRiY4Jfchvonc10gs4f9l13kQpNX5RQKBgQCG299SSZFHv7AgHmdv
wNfBVJA3AQstIpT8TugVz0zbA6IS1hIIE0YAJCqCYRqeVDZWF3J72n4FMCAX0wKt
Jjss0WZSJeVpKLDI+iP6CBVEzf1tulS1Q1/EElyvqoyxDBUBge1eek7hbSlNiF/c
PCgDYDaKjVx8j8zcEhsHzQS02Q==
-----END PRIVATE KEY-----`;
const certificate = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUUkl7btz4+zWLW2gWcygYGYl0WWMwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDgwMTE0MTIzMloXDTM2MDcy
OTE0MTIzMlowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEA8nWVerZyD+EMgdLvNfh6JN3cl636aLv2q8Vc22wvp7ey
T8CY4JjDTHrA6ajM5VfgACppK0fheqx5Vrq0g3bG9kGApB2OGkH8DnGYcLMHuYTP
X7GJsB+v3hyCK2DUwaDkrwjPD/e23srOLuR0QLtmW2IL1S9kDx1frpilVPGi+5Gl
d6uowLhr4E6Z/83D4rawmvWPnWx5oEAhy2uoKF5PdlMujdNmrYrlFXnKpxVUf8ra
dDMOh4piVgf31SyB88203zzJAXkcdYMRZGhp4w4cn42veosr9HQEctRgAWGxXDNh
CT2E45Id6tP/xwBkCDE8xckgEYMsy84y0ktRECh+NwIDAQABo1MwUTAdBgNVHQ4E
FgQUmrBVW9bUj2OfFsP15v+liRdaDXIwHwYDVR0jBBgwFoAUmrBVW9bUj2OfFsP1
5v+liRdaDXIwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAxlxD
sjnLjNodUJ+KMtUuWOlUwp0v7dNXt7SDlQCLScb4C5uF0I1dlnVCaLHzz4aHKFNJ
dA1poMvMnX4SopeTaWDZN+cMMW8icw2RDq8NY9fDxtGCujyx4adPmO1BN4gOXNH3
mwWohBNDh4r4pjHAIfq73JaH7fZ3Uz7dg4r4WEPnMj/2dHvRfJW4ZvB8tM2cwbcG
dvqIiCmgM97gMGAcWgXT2xOcTMZ0UanphNxHnjiUR23jZyx/2QHUOXkOpMDmNy8V
a15b62jUxgEV9dI68IJKolVBCrk2FYK6XANUwI6RVIr8ydDwADUFpGbQiaA02ljw
8ArsrMbUy7WO6Wfhcw==
-----END CERTIFICATE-----`;
const servers: { close(callback: () => void): void }[] = [];
const execFile = promisify(execFileCallback);

async function serve(handler: RequestListener, host = "127.0.0.1") {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not start");
  return `http://${host}:${address.port}`;
}

async function serveHttps(handler: RequestListener) {
  const server = createSecureServer({ key: privateKey, cert: certificate }, handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not start");
  return `https://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

function trace(url: string, overrides = {}) {
  return traceRedirects(new URL(url), {
    initialMethod: "GET",
    maxHops: 10,
    timeoutMs: 1_000,
    ...overrides,
  });
}

function finalAssertion(actual: string, expected: string) {
  return evaluateAssertions({ terminal: { status: 200, url: actual } } as Trace, {
    expectFinal: new URL(expected),
    maxHopsSupplied: false,
    maxHops: 10,
    lax: true,
  })[0];
}

async function runCli(...args: string[]) {
  try {
    return {
      ...(await execFile(process.execPath, ["dist/cli.js", ...args], {
        env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" },
      })),
      code: 0,
    };
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && "stdout" in error) {
      const result = error as { code: number; stdout: string; stderr: string };
      return { code: result.code, stdout: result.stdout, stderr: result.stderr };
    }
    throw error;
  }
}

describe("redirect engine", () => {
  it("follows resolved relative locations to a terminal response", async () => {
    const base = await serve((request, response) => {
      if (request.url === "/start") response.writeHead(301, { location: "next" }).end();
      else if (request.url === "/next") response.writeHead(302, { location: "/done" }).end();
      else response.writeHead(200).end();
    });
    const result = await trace(`${base}/start`);
    expect(result.outcome).toBe("complete");
    expect(result.trace.hops.map((hop) => [hop.status, hop.resolvedUrl])).toEqual([
      [301, `${base}/next`],
      [302, `${base}/done`],
      [200, null],
    ]);
    expect(result.trace.hops[2]?.timingMs).toBeTypeOf("number");
  });

  it("falls back to GET when HEAD is unsupported", async () => {
    const methods: string[] = [];
    const bodies: string[] = [];
    const base = await serve((request, response) => {
      methods.push(request.method ?? "");
      let body = "";
      request.on("data", (chunk: Buffer) => (body += chunk));
      request.on("end", () => bodies.push(body));
      response.writeHead(request.method === "HEAD" ? 405 : 200).end();
    });
    const result = await runCli(base);
    expect(result.code).toBe(0);
    expect(methods).toEqual(["HEAD", "GET"]);
    expect(bodies).toEqual(["", ""]);
  });

  it("does not fall back from a terminal error response or send a request body", async () => {
    const methods: string[] = [];
    const bodies: string[] = [];
    const base = await serve((request, response) => {
      methods.push(request.method ?? "");
      let body = "";
      request.on("data", (chunk: Buffer) => (body += chunk));
      request.on("end", () => bodies.push(body));
      response.writeHead(404).end();
    });
    const result = await runCli(base);
    expect(result.code).toBe(1);
    expect(methods).toEqual(["HEAD"]);
    expect(bodies).toEqual([""]);
  });

  it("returns a partial trace when a redirect lacks Location", async () => {
    const base = await serve((_request, response) => response.writeHead(302).end());
    const result = await trace(base);
    expect(result.outcome).toBe("transport");
    expect(result.trace.hops).toHaveLength(1);
    expect(result.trace.hops[0]?.error).toContain("Location");
  });

  it("exits 3 for a malformed absolute-looking Location", async () => {
    const base = await serve((_request, response) =>
      response.writeHead(302, { location: "ht!tp://x" }).end(),
    );
    const result = await runCli(base);
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("invalid Location header");
    expect(result.stdout).not.toContain("hop limit");
    expect(result.stderr).toContain("invalid Location header");
  });

  it("exits 3 with a partial trace when the default engine hop limit is exceeded", async () => {
    let requests = 0;
    const base = await serve((request, response) => {
      requests += 1;
      const index = Number(request.url?.slice(1) ?? 0);
      response.writeHead(302, { location: `/${index + 1}` }).end();
    });
    const result = await runCli(`${base}/0`);
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("hop limit of 10 exceeded");
    expect(result.stdout).not.toContain("11. ERROR");
    expect(requests).toBe(10);
  });

  it("exits 3 with a partial trace on request timeout", async () => {
    const base = await serve((_request, response) =>
      setTimeout(() => response.writeHead(200).end(), 200),
    );
    const result = await runCli(base, "--timeout", "20");
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("request timed out");
  });

  it("prints a clean multi-hop trace from the CLI", async () => {
    const base = await serve((request, response) => {
      if (request.url === "/start") response.writeHead(301, { location: "/next" }).end();
      else if (request.url === "/next") response.writeHead(308, { location: "/done" }).end();
      else response.writeHead(200).end();
    });
    const result = await runCli(`${base}/start`);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`301 ${base}/start -> ${base}/next`);
    expect(result.stdout).toContain(`308 ${base}/next -> ${base}/done`);
    expect(result.stdout).toContain("200");
    expect(result.stdout).toContain("Terminal elapsed:");
    expect(result.stderr).toBe("");
  });

  it("flags an HTTPS to HTTP downgrade", async () => {
    const http = await serve((_request, response) => response.writeHead(200).end());
    const https = await serveHttps((_request, response) =>
      response.writeHead(302, { location: http }).end(),
    );
    const result = await runCli(https);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("flag: https-downgrade");
  });

  it("flags cross-origin host and port changes", async () => {
    const target = await serve((_request, response) => response.writeHead(200).end(), "localhost");
    const source = await serve((_request, response) =>
      response.writeHead(302, { location: target }).end(),
    );
    const result = await runCli(source);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("flag: cross-origin");
    expect(result.stdout).toContain("flag: host-change");
    expect(result.stdout).toContain("flag: port-change");
  });

  it("flags a repeated URL loop without becoming a transport failure", async () => {
    const base = await serve((request, response) => {
      if (request.url === "/a") response.writeHead(302, { location: "/b" }).end();
      else if (request.url === "/b") response.writeHead(302, { location: "/a" }).end();
      else response.writeHead(200).end();
    });
    const result = await runCli(`${base}/a`);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("flag: loop");
  });

  it("preserves the repeated response as the terminal in loop JSON output", async () => {
    const base = await serve((request, response) => {
      if (request.url === "/a") response.writeHead(302, { location: "/b" }).end();
      else response.writeHead(302, { location: "/a" }).end();
    });
    const result = await runCli(`${base}/a`, "--format", "json");
    const json = JSON.parse(result.stdout);
    expect(result.code).toBe(1);
    expect(json.terminal).toEqual({ status: 302, url: `${base}/a` });
    expect(json.loopDetected).toBe(true);
  });

  it("fails an asserted max-hops limit for a self-loop", async () => {
    const base = await serve((_request, response) =>
      response.writeHead(302, { location: "/self" }).end(),
    );
    const result = await runCli(`${base}/self`, "--max-hops", "2", "--format", "json");
    expect(result.code).toBe(4);
    expect(JSON.parse(result.stdout).assertions).toContainEqual({
      kind: "max-hops",
      expected: 2,
      actual: "loop",
      passed: false,
      note: "chain did not terminate: redirect loop",
    });
  });

  it("fails an asserted max-hops limit for a multi-node cycle", async () => {
    const base = await serve((request, response) => {
      if (request.url === "/a") response.writeHead(302, { location: "/b" }).end();
      else response.writeHead(302, { location: "/a" }).end();
    });
    const result = await runCli(`${base}/a`, "--max-hops", "3", "--format", "json");
    expect(result.code).toBe(4);
    expect(JSON.parse(result.stdout).assertions).toContainEqual({
      kind: "max-hops",
      expected: 3,
      actual: "loop",
      passed: false,
      note: "chain did not terminate: redirect loop",
    });
  });

  it("renders masked deterministic markdown and json artifacts", async () => {
    const base = await serve((request, response) => {
      if (request.url?.startsWith("/start"))
        response.writeHead(302, { location: "/done?code=secret&plus=a+b" }).end();
      else response.writeHead(200).end();
    });
    const args = [`${base}/start?token=private#fragment`, "--format", "json"];
    const first = await runCli(...args);
    const second = await runCli(...args);
    expect(first.code).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    expect(first.stdout).toContain("token=***");
    expect(first.stdout).toContain("code=***");
    expect(first.stdout).not.toContain("private");
    expect(first.stdout).not.toContain("secret");
    expect(first.stdout).toContain("fragment");
    expect((await runCli(...args, "--show-secrets")).stdout).toContain("token=private");
    const markdownArgs = [`${base}/start?token=private`, "--format", "markdown"];
    const markdown = await runCli(...markdownArgs);
    expect(markdown.stdout).toBe((await runCli(...markdownArgs)).stdout);
    expect(markdown.stdout).toContain("token=***");
  });

  it("renders malformed percent keys without crashing", async () => {
    const base = await serve((_request, response) => response.writeHead(200).end());
    const result = await runCli(`${base}/start?%ZZ=v`);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("%ZZ=v");
    expect(result.stderr).toBe("");
  });

  it("evaluates final URL, terminal status, and hop count assertions", async () => {
    const base = await serve((request, response) => {
      if (request.url === "/start") response.writeHead(302, { location: "/done" }).end();
      else response.writeHead(201).end();
    });
    const args = [
      `${base}/start`,
      "--expect-final",
      `${base}/done`,
      "--expect-status",
      "201",
      "--max-hops",
      "2",
    ];
    expect((await runCli(...args)).code).toBe(0);
    const failed = await runCli(
      `${base}/start`,
      "--expect-final",
      `${base}/other`,
      "--expect-status",
      "200",
    );
    expect(failed.code).toBe(4);
    expect(failed.stdout).toContain(`expected ${base}/other, got ${base}/done`);
    expect((await runCli(`${base}/start`, "--expect-status", "200")).code).toBe(4);
    expect((await runCli(`${base}/start`, "--max-hops", "2")).code).toBe(0);
  });

  it("fails a max-hops assertion after tracing one redirect beyond the expectation", async () => {
    const base = await serve((request, response) => {
      if (request.url === "/start") response.writeHead(302, { location: "/one" }).end();
      else if (request.url === "/one") response.writeHead(302, { location: "/two" }).end();
      else if (request.url === "/two") response.writeHead(302, { location: "/done" }).end();
      else response.writeHead(200).end();
    });
    const failed = await runCli(`${base}/start`, "--max-hops", "2", "--format", "json");
    expect(failed.code).toBe(4);
    expect(JSON.parse(failed.stdout).assertions).toContainEqual({
      kind: "max-hops",
      expected: 2,
      actual: 3,
      passed: false,
    });
    expect((await runCli(`${base}/start`, "--max-hops", "3")).code).toBe(0);
  });

  it("reports terminal assertions as indeterminate when an asserted hop cap overflows", async () => {
    const base = await serve((request, response) => {
      const index = Number(request.url?.slice(1) ?? 0);
      response.writeHead(302, { location: `/${index + 1}` }).end();
    });
    const result = await runCli(
      `${base}/0`,
      "--max-hops",
      "2",
      "--expect-final",
      `${base}/done`,
      "--expect-status",
      "200",
      "--format",
      "json",
    );
    expect(result.code).toBe(4);
    expect(JSON.parse(result.stdout).assertions).toEqual([
      {
        kind: "expect-final",
        expected: `${base}/done`,
        actual: null,
        passed: false,
        note: "not evaluated: chain did not terminate",
      },
      {
        kind: "expect-status",
        expected: 200,
        actual: null,
        passed: false,
        note: "not evaluated: chain did not terminate",
      },
      { kind: "max-hops", expected: 2, actual: 3, passed: false },
    ]);
  });

  it("masks indeterminate final URL assertions in every output format", async () => {
    const base = await serve((request, response) => {
      const index = Number(request.url?.slice(1) ?? 0);
      response.writeHead(302, { location: `/${index + 1}` }).end();
    });
    const expected = `${base}/done?token=super-secret`;
    for (const format of ["terminal", "markdown", "json"]) {
      const result = await runCli(
        `${base}/0`,
        "--max-hops",
        "2",
        "--expect-final",
        expected,
        "--format",
        format,
      );
      expect(result.code).toBe(4);
      expect(result.stdout).toContain("token=***");
      expect(result.stdout).not.toContain("super-secret");
    }
  });

  it("uses strict final URL comparison unless lax permits a fixed normalization", async () => {
    const base = await serve((_request, response) => response.writeHead(200).end());
    const cases = [
      [`${base}/done`, `${base}/done/`, "trailing-slash"],
      [`${base}/done?utm_source=test&keep=yes`, `${base}/done?keep=yes`, "tracking-params"],
    ];
    for (const [actual, expected, rule] of cases) {
      const strict = await runCli(actual, "--expect-final", expected);
      expect(strict.code).toBe(4);
      expect(strict.stdout).toContain(`would pass under lax rule: ${rule}`);
      expect((await runCli(actual, "--expect-final", expected, "--lax")).code).toBe(0);
    }
    const https = await serveHttps((_request, response) => response.writeHead(200).end());
    const httpExpected = https.replace("https:", "http:");
    const strict = await runCli(https, "--expect-final", httpExpected);
    expect(strict.code).toBe(4);
    expect(strict.stdout).toContain("would pass under lax rule: http-to-https");
    expect((await runCli(https, "--expect-final", httpExpected, "--lax")).code).toBe(0);
    expect(
      (
        await runCli(
          `${base}/done`,
          "--expect-final",
          `http://localhost:${new URL(base).port}/done`,
          "--lax",
        )
      ).code,
    ).toBe(4);
    expect(finalAssertion(`${base}/done?q=a+b`, `${base}/done?q=a%20b`).passed).toBe(false);
    expect(finalAssertion("http://www.example.test/done", "http://example.test/done").passed).toBe(
      false,
    );
  });

  it("prioritizes usage, transport, and assertions and renders assertion artifacts", async () => {
    const target = await serve((_request, response) => response.writeHead(404).end(), "localhost");
    const source = await serve((_request, response) =>
      response.writeHead(302, { location: target }).end(),
    );
    expect((await runCli(source, "--expect-status", "200")).code).toBe(4);
    const partial = await serve((_request, response) => response.writeHead(302).end());
    expect((await runCli(partial, "--expect-status", "200")).code).toBe(3);
    expect((await runCli(source, "--lax")).code).toBe(2);
    const args = [source, "--expect-status", "200", "--format", "json"];
    const json = JSON.parse((await runCli(...args)).stdout);
    expect(json.assertions).toEqual([
      { kind: "expect-status", expected: 200, actual: 404, passed: false },
    ]);
    expect(JSON.parse((await runCli(source, "--format", "json")).stdout).assertions).toEqual([]);
    const finalPass = JSON.parse(
      (await runCli(source, "--expect-final", target, "--format", "json")).stdout,
    );
    expect(finalPass.assertions).toEqual([
      { kind: "expect-final", expected: `${target}/`, actual: `${target}/`, passed: true },
    ]);
    const laxPass = JSON.parse(
      (
        await runCli(
          `${target}/?utm_source=test`,
          "--expect-final",
          `${target}/`,
          "--lax",
          "--format",
          "json",
        )
      ).stdout,
    );
    expect(laxPass.assertions).toEqual([
      {
        kind: "expect-final",
        expected: `${target}/`,
        actual: `${target}/?utm_source=test`,
        passed: true,
        normalization: "tracking-params",
      },
    ]);
    const strictNearMiss = JSON.parse(
      (await runCli(`${target}/done/`, "--expect-final", `${target}/done`, "--format", "json"))
        .stdout,
    );
    expect(strictNearMiss.assertions).toEqual([
      {
        kind: "expect-final",
        expected: `${target}/done`,
        actual: `${target}/done/`,
        passed: false,
        normalization: "trailing-slash",
      },
    ]);
    const markdownArgs = [source, "--expect-status", "200", "--format", "markdown"];
    const markdown = await runCli(...markdownArgs);
    expect(markdown.stdout).toBe((await runCli(...markdownArgs)).stdout);
    expect(markdown.stdout).toContain("expected 200, got 404");
  });

  it("masks final URL assertion values in every output format", async () => {
    const base = await serve((_request, response) => response.writeHead(200).end());
    const args = [
      `${base}/done?token=actual-secret`,
      "--expect-final",
      `${base}/done?token=expected-secret`,
    ];
    for (const format of ["terminal", "markdown", "json"]) {
      const result = await runCli(...args, "--format", format);
      expect(result.code).toBe(4);
      expect(result.stdout).toContain("token=***");
      expect(result.stdout).not.toContain("expected-secret");
      expect(result.stdout).not.toContain("actual-secret");
    }
    expect((await runCli(...args)).stdout).toContain(
      "values differ only in masked query parameters",
    );
    const json = JSON.parse((await runCli(...args, "--format", "json")).stdout);
    expect(json.assertions).toEqual([
      {
        kind: "expect-final",
        expected: `${base}/done?token=***`,
        actual: `${base}/done?token=***`,
        passed: false,
      },
    ]);
  });

  it("rejects non-standard method labels", async () => {
    const result = await runCli("https://example.test", "--method", "FOO");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--method must be a standard HTTP method");
  });

  it("surfaces method, loop, and opt-in rotating-parameter observations", async () => {
    const base = await serve((request, response) => {
      if (request.url === "/start") response.writeHead(303, { location: "/cycle?a=1" }).end();
      else if (request.url === "/cycle?a=1")
        response.writeHead(307, { location: "/cycle?a=2" }).end();
      else response.writeHead(200).end();
    });
    const result = await runCli(base + "/start", "--method", "POST", "--ignore-params-loop");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("method-semantic-transition");
    expect(result.stdout).toContain("loop-ignoring-params");
  });

  it("exits 3 and prints the partial trace on transport failures", async () => {
    const base = await serve((_request, response) => response.writeHead(302).end());
    const result = await runCli(base);
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("302");
    expect(result.stdout).toContain("redirect response has no Location header");
    expect(result.stderr).toContain("redirect response has no Location header");
  });

  it("traces batch rows from files with assertions, parse failures, loops, and masked summaries", async () => {
    const base = await serve((request, response) => {
      if (request.url?.startsWith("/start"))
        response.writeHead(302, { location: "/done?token=secret" }).end();
      else if (request.url === "/loop-a") response.writeHead(302, { location: "/loop-b" }).end();
      else if (request.url === "/loop-b") response.writeHead(302, { location: "/loop-a" }).end();
      else response.writeHead(200).end();
    });
    const directory = await mkdtemp(join(tmpdir(), "redirect-trace-"));
    const input = join(directory, "map.txt");
    await writeFile(
      input,
      `# redirect map\n\n${base}/start?token=private ${base}/done?token=secret\n${base}/loop-a\nnot-a-url?token=hush\n${base}/done extra column\n`,
    );
    const result = await runCli("--input", input, "--format", "json");
    const json = JSON.parse(result.stdout);
    expect(result.code).toBe(3);
    expect(json).toHaveLength(4);
    expect(json[0].assertions).toEqual([
      {
        kind: "expect-final",
        expected: `${base}/done?token=***`,
        actual: `${base}/done?token=***`,
        passed: true,
      },
    ]);
    expect(json[1].flags).toContainEqual(expect.objectContaining({ kind: "loop" }));
    expect(json[2]).toMatchObject({
      startUrl: "not-a-url?token=***",
      initialMethod: "GET",
      terminal: { status: null, url: "not-a-url?token=***" },
      failure: expect.stringContaining("URL must be valid"),
      hops: [],
      flags: [],
      assertions: [],
    });
    expect(result.stdout).not.toContain("hush");
    expect(json[3].failure).toContain("more than two columns");
    const markdown = await runCli("--input", input, "--format", "markdown");
    expect(markdown.stdout).toContain("token=***");
    expect(markdown.stdout).not.toContain("private");
    expect(markdown.stdout).not.toContain("secret");
    const terminal = await runCli("--input", input);
    expect(
      terminal.stdout
        .split("\n")
        .filter((line) => line === `PASS ${base}/start?token=*** -> ${base}/done?token=*** (-)`),
    ).toHaveLength(1);
  });

  it("masks sensitive query values in invalid batch JSON rows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "redirect-trace-"));
    const input = join(directory, "map.txt");
    await writeFile(input, "https://example.test/?token=hush expected extra\n");
    const result = await runCli("--input", input, "--format", "json");
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("token=***");
    expect(result.stdout).not.toContain("hush");
  });

  it("continues batch rows after a request timeout", async () => {
    const base = await serve((request, response) => {
      if (request.url === "/slow") setTimeout(() => response.writeHead(200).end(), 100);
      else response.writeHead(200).end();
    });
    const directory = await mkdtemp(join(tmpdir(), "redirect-trace-"));
    const input = join(directory, "map.txt");
    await writeFile(input, `${base}/slow\n${base}/done\n`);
    const result = await runCli("--input", input, "--timeout", "20", "--format", "json");
    const json = JSON.parse(result.stdout);
    expect(result.code).toBe(3);
    expect(json[0].hops.at(-1).error).toContain("request timed out");
    expect(json[1].terminal).toEqual({ status: 200, url: `${base}/done` });
  });

  it("keeps batch Markdown and JSON byte-identical despite different completion orders", async () => {
    let requestCount = 0;
    const completionOrders: string[][] = [];
    let currentCompletionOrder: string[] = [];
    const base = await serve((request, response) => {
      const run = Math.floor(requestCount / 2);
      requestCount += 1;
      const delay = request.url === "/slow" ? (run % 2 === 0 ? 50 : 0) : run % 2 === 0 ? 0 : 50;
      setTimeout(() => {
        currentCompletionOrder.push(request.url!);
        if (currentCompletionOrder.length === 2) {
          completionOrders.push(currentCompletionOrder);
          currentCompletionOrder = [];
        }
        response.writeHead(200).end();
      }, delay);
    });
    const directory = await mkdtemp(join(tmpdir(), "redirect-trace-"));
    const input = join(directory, "map.txt");
    await writeFile(input, `${base}/slow\nhttp://localhost:${new URL(base).port}/fast\n`);
    const json = await runCli("--input", input, "--concurrency", "2", "--format", "json");
    const nextJson = await runCli("--input", input, "--concurrency", "2", "--format", "json");
    const markdown = await runCli("--input", input, "--concurrency", "2", "--format", "markdown");
    const nextMarkdown = await runCli(
      "--input",
      input,
      "--concurrency",
      "2",
      "--format",
      "markdown",
    );
    expect(completionOrders).toHaveLength(4);
    expect(completionOrders[0]).not.toEqual(completionOrders[1]);
    expect(json.stdout).toBe(nextJson.stdout);
    expect(completionOrders[2]).not.toEqual(completionOrders[3]);
    expect(markdown.stdout).toBe(nextMarkdown.stdout);
    expect(JSON.parse(json.stdout).map((entry: { startUrl: string }) => entry.startUrl)).toEqual([
      `${base}/slow`,
      `http://localhost:${new URL(base).port}/fast`,
    ]);
    expect(markdown.stdout.indexOf(`${base}/slow`)).toBeLessThan(
      markdown.stdout.indexOf("localhost"),
    );
  });

  it("serializes batch requests for one host and bounds distinct-host concurrency", async () => {
    let active = 0;
    let peak = 0;
    const order: string[] = [];
    const base = await serve((request, response) => {
      active += 1;
      peak = Math.max(peak, active);
      order.push(request.url!);
      setTimeout(() => {
        active -= 1;
        response.writeHead(200).end();
      }, 25);
    });
    const directory = await mkdtemp(join(tmpdir(), "redirect-trace-"));
    const sameHost = join(directory, "same.txt");
    await writeFile(sameHost, `${base}/one\n${base}/two\n`);
    await runCli("--input", sameHost, "--concurrency", "4");
    expect(peak).toBe(1);
    expect(order).toEqual(["/one", "/two"]);
    active = 0;
    peak = 0;
    const other = await serve((request, response) => {
      active += 1;
      peak = Math.max(peak, active);
      setTimeout(() => {
        active -= 1;
        response.writeHead(200).end();
      }, 25);
    }, "localhost");
    const distinctHosts = join(directory, "distinct.txt");
    await writeFile(distinctHosts, `${base}/three\n${other}/four\n`);
    await runCli("--input", distinctHosts, "--concurrency", "2");
    expect(peak).toBeGreaterThanOrEqual(2);
  });

  it("rejects invalid batch combinations and the input cap before tracing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "redirect-trace-"));
    const input = join(directory, "map.txt");
    await writeFile(input, "http://example.test\n".repeat(10_001));
    expect((await runCli("http://example.test", "--input", input)).code).toBe(2);
    const expectations = await runCli("--input", input, "--expect-final", "http://example.test");
    expect(expectations.code).toBe(2);
    expect(expectations.stderr).toContain("per-row-only");
    const cap = await runCli("--input", input);
    expect(cap.code).toBe(2);
    expect(cap.stderr).toContain("10000-line cap");
    const nonBatchConcurrency = await runCli("http://example.test", "--concurrency", "2");
    expect(nonBatchConcurrency.code).toBe(2);
    expect(nonBatchConcurrency.stderr).toContain("requires batch input");
    const empty = join(directory, "empty.txt");
    await writeFile(empty, "# no rows\n\n");
    const emptyInput = await runCli("--input", empty);
    expect(emptyInput.code).toBe(2);
    expect(emptyInput.stderr).toContain("no usable rows");
    const invalidExpected = join(directory, "invalid-expected.txt");
    await writeFile(invalidExpected, "https://example.test not-a-url\n");
    const invalidExpectedResult = await runCli("--input", invalidExpected, "--format", "json");
    expect(invalidExpectedResult.code).toBe(3);
    expect(JSON.parse(invalidExpectedResult.stdout)[0].failure).toContain("expected-final column");
  });

  it("accepts stdin input and gives assertion failures precedence over flags", async () => {
    const target = await serve((_request, response) => response.writeHead(200).end(), "localhost");
    const source = await serve((_request, response) =>
      response.writeHead(302, { location: target }).end(),
    );
    const result = await new Promise<{ code: number; stdout: string }>((resolve, reject) => {
      const child = execFileCallback(
        process.execPath,
        ["dist/cli.js", "--format", "json"],
        { env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" } },
        (error, stdout) => {
          if (error !== null && "code" in error) resolve({ code: error.code as number, stdout });
          else if (error !== null) reject(error);
          else resolve({ code: 0, stdout });
        },
      );
      child.stdin?.end(`${source} ${target}/wrong\n`);
    });
    expect(result.code).toBe(4);
    expect(JSON.parse(result.stdout)[0].flags).toContainEqual(
      expect.objectContaining({ kind: "cross-origin" }),
    );
  });
});
