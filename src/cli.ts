#!/usr/bin/env node
import { traceRedirects } from "./engine.js";
import { renderTerminal } from "./render-terminal.js";

const help = `Usage: redirect-trace <url> [options]

Options:
  --method <method>  Analysis label (default: GET)
  --max-hops <n>     Maximum redirect hops (default: 10)
  --timeout <ms>     Per-request timeout in milliseconds (default: 10000)
  --help             Show this help

Exit codes: 0 clean, 1 flagged, 2 usage, 3 transport failure
Example: redirect-trace https://example.com`;

function usage(message: string): never {
  process.stderr.write(`${message}\n${help}\n`);
  process.exit(2);
}

function numberOption(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) usage(`${name} must be a positive integer`);
  return parsed;
}

function parseArgs(args: string[]) {
  let url: string | undefined;
  let initialMethod = "GET";
  let maxHops = 10;
  let timeoutMs = 10_000;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      process.stdout.write(`${help}\n`);
      process.exit(0);
    }
    if (argument === "--method")
      initialMethod = args[++index] ?? usage("--method requires a value");
    else if (argument === "--max-hops") maxHops = numberOption(args[++index], "--max-hops");
    else if (argument === "--timeout") timeoutMs = numberOption(args[++index], "--timeout");
    else if (argument.startsWith("-")) usage(`unknown option: ${argument}`);
    else if (url === undefined) url = argument;
    else usage("only one URL may be supplied");
  }
  if (url === undefined) usage("a URL is required");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    usage("URL must be valid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    usage("URL must use http or https");
  return { url: parsed, initialMethod, maxHops, timeoutMs };
}

const options = parseArgs(process.argv.slice(2));
const result = await traceRedirects(options.url, options);
process.stdout.write(renderTerminal(result.trace));
process.exitCode =
  result.outcome === "transport"
    ? 3
    : result.trace.terminal.status !== null && result.trace.terminal.status >= 400
      ? 1
      : 0;
