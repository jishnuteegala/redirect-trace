#!/usr/bin/env node

import { nodeRequirementMessage, supportsNode18 } from "./preflight.js";

if (!supportsNode18(process.versions.node)) {
  process.stderr.write(`${nodeRequirementMessage(process.versions.node)}\n`);
  process.exitCode = 2;
} else {
  import("./main.js").catch(function (error) {
    process.stderr.write(`redirect-trace failed to start: ${String(error)}\n`);
    process.exitCode = 2;
  });
}
