import { createServer, type RequestListener } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { traceRedirects } from "../src/engine.js";

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
      return result;
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

  it("exits 3 with a partial trace when the hop limit is exceeded", async () => {
    const base = await serve((_request, response) =>
      response.writeHead(302, { location: "/again" }).end(),
    );
    const result = await runCli(base, "--max-hops", "2");
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("hop limit of 2 exceeded");
    expect(result.stdout).not.toContain("3. ERROR");
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
});
