// Deterministic redirect fixture for verification drives.
// Prints "FIXTURE_BASE=http://127.0.0.1:<port>" once listening, then serves the
// menu documented in ../SKILL.md. Run it in the background and kill by PID.
import { createServer } from "node:http";

const server = createServer((request, response) => {
  const path = new URL(request.url, "http://fixture").pathname;

  if (request.method === "HEAD" && path === "/head-405") {
    response.writeHead(405).end();
    return;
  }
  if (path === "/head-405") {
    response.writeHead(302, { location: "/end" }).end();
    return;
  }

  const hop = /^\/r\/(\d+)$/.exec(path);
  if (hop) {
    const remaining = Number(hop[1]);
    response.writeHead(302, { location: remaining === 0 ? "/end" : `/r/${remaining - 1}` }).end();
    return;
  }

  const forward = /^\/to\/(\d+)(\/.*)$/.exec(path);
  if (forward) {
    response.writeHead(302, { location: `http://127.0.0.1:${forward[1]}${forward[2]}` }).end();
    return;
  }

  if (path === "/loop") {
    response.writeHead(302, { location: "/loop" }).end();
    return;
  }
  if (path === "/no-location") {
    response.writeHead(302).end();
    return;
  }
  if (path === "/bad-location") {
    response.writeHead(302, { location: "ht!tp://bad" }).end();
    return;
  }

  response.writeHead(200, { "content-type": "text/plain" }).end("ok\n");
});

server.listen(0, "127.0.0.1", () => {
  process.stdout.write(`FIXTURE_BASE=http://127.0.0.1:${server.address().port}\n`);
});
