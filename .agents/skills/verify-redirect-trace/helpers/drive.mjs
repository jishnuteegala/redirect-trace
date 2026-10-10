// Spawn the built CLI and capture a transcript (command, exit code, stdout,
// stderr) into the evidence directory. Prints the transcript path and
// "exit=<code>", and exits with the CLI's own code.
//
// Usage:
//   node helpers/drive.mjs --name <label> [--evidence <dir>] [--stdin-file <path>] -- <cli args>
import { spawn } from "node:child_process";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const separator = args.indexOf("--");
const cliArgs = separator === -1 ? [] : args.slice(separator + 1);
const flags = separator === -1 ? args : args.slice(0, separator);

const flagValue = (name) => {
  const index = flags.indexOf(name);
  return index === -1 ? undefined : flags[index + 1];
};

const name = flagValue("--name") ?? "run";
const stdinFile = flagValue("--stdin-file");
const runId = process.env.VERIFY_RUN_ID ?? `run-${Date.now()}`;
const evidenceDir = resolve(
  flagValue("--evidence") ?? join(tmpdir(), "verify-redirect-trace", runId),
);
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
mkdirSync(evidenceDir, { recursive: true });

const child = spawn(process.execPath, ["dist/cli.js", ...cliArgs], {
  cwd: repoRoot,
  stdio: [stdinFile === undefined ? "ignore" : "pipe", "pipe", "pipe"],
});
if (stdinFile !== undefined) createReadStream(resolve(stdinFile)).pipe(child.stdin);

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => (stdout += chunk));
child.stderr.on("data", (chunk) => (stderr += chunk));

child.on("close", (code) => {
  const transcript = [
    `$ redirect-trace ${cliArgs.join(" ")}${stdinFile === undefined ? "" : ` < ${stdinFile}`}`,
    `exit: ${code}`,
    "--- stdout ---",
    stdout.trimEnd(),
    "--- stderr ---",
    stderr.trimEnd(),
  ].join("\n");
  const file = join(evidenceDir, `${name}.txt`);
  writeFileSync(file, `${transcript}\n`);
  process.stdout.write(`${file}\nexit=${code}\n`);
  process.exitCode = code ?? 1;
});
