import { createServer } from "node:http";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { traceRedirects } from "../src/engine.js";

const servers: ReturnType<typeof createServer>[] = [];
const execFile = promisify(execFileCallback);

async function serve(handler: Parameters<typeof createServer>[0]) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not start");
  return `http://127.0.0.1:${address.port}`;
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
    timeoutMs: 100,
    ...overrides,
  });
}

async function runCli(...args: string[]) {
  try {
    return { ...(await execFile(process.execPath, ["dist/cli.js", ...args])), code: 0 };
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
    const base = await serve((request, response) => {
      methods.push(request.method ?? "");
      response.writeHead(request.method === "HEAD" ? 405 : 200).end();
    });
    const result = await runCli(base);
    expect(result.code).toBe(0);
    expect(methods).toEqual(["HEAD", "GET"]);
  });

  it("returns a partial trace when a redirect lacks Location", async () => {
    const base = await serve((_request, response) => response.writeHead(302).end());
    const result = await trace(base);
    expect(result.outcome).toBe("transport");
    expect(result.trace.hops).toHaveLength(1);
    expect(result.trace.hops[0]?.error).toContain("Location");
  });

  it("exits 3 with a partial trace when the hop limit is exceeded", async () => {
    const base = await serve((_request, response) =>
      response.writeHead(302, { location: "/again" }).end(),
    );
    const result = await runCli(base, "--max-hops", "2");
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("hop limit of 2 exceeded");
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

  it("exits 3 and prints the partial trace on transport failures", async () => {
    const base = await serve((_request, response) => response.writeHead(302).end());
    const result = await runCli(base);
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("302");
    expect(result.stdout).toContain("redirect response has no Location header");
    expect(result.stderr).toBe("");
  });
});
