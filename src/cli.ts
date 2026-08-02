#!/usr/bin/env node
import { traceRedirects } from "./engine.js";
import { analyzeTrace } from "./analyze.js";
import { evaluateAssertions } from "./assertions.js";
import {
  batchExitCode,
  inputLineCap,
  parseBatchInput,
  shouldEvaluateAssertions,
  traceBatch,
} from "./batch.js";
import {
  renderBatchJson,
  renderBatchMarkdown,
  renderBatchTerminal,
  renderBatchTerminalLine,
  renderJson,
  renderMarkdown,
  renderTerminal,
} from "./render.js";
import { readFile } from "node:fs/promises";

const help = `Usage: redirect-trace <url> [options]
       redirect-trace --input <file> [options]

Options:
  --method <method>  Analysis label: GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS, TRACE, CONNECT (default: GET)
  --format <format>  terminal, markdown, or json (default: terminal)
  --max-hops <n>     Assert at most n redirects (default engine limit: 10)
  --expect-final <url>  Require the terminal URL
  --expect-status <code>  Require the terminal status
  --lax              Allow fixed final-URL normalizations
  --timeout <ms>     Per-request timeout in milliseconds (default: 10000)
  --show-secrets     Render sensitive query values
  --ignore-params-loop  Detect loops with query parameters removed
  --include-timing   Include timing in markdown/json (not deterministic)
  --input <file>     Trace URL rows from a file (use - for stdin)
  --concurrency <n>  Batch traces across hosts (default: 2)
  --help             Show this help
  --version          Show version

Examples:
  redirect-trace https://example.com
  redirect-trace https://example.com --format markdown > trace.md

Exit codes:
  0 clean     resolved with no flags
  1 flagged   resolved with one or more observations
  2 usage     bad arguments or invalid URL
  3 transport timeout, connection error, engine hop limit, or malformed redirect
  4 assertion final URL, status, or chain-shape (max hops) expectation did not match

Sensitive values are masked by default for: token, access_token, refresh_token, code,
secret, client_secret, key, api_key, password, pwd, sig, signature, auth, session, sid.
Query '+' is a literal plus; use %20 for a space.`;

function usage(message: string): never {
  process.stderr.write(`${message}\n${help}\n`);
  process.exit(2);
}

function numberOption(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) usage(`${name} must be a positive integer`);
  return parsed;
}

async function readStdin(): Promise<string> {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

function parseArgs(args: string[]) {
  let url: string | undefined;
  let initialMethod = "GET";
  let maxHops = 10;
  let maxHopsSupplied = false;
  let timeoutMs = 10_000;
  let expectFinal: URL | undefined;
  let expectStatus: number | undefined;
  let lax = false;
  let format = "terminal";
  let showSecrets = false;
  let ignoreParamsLoop = false;
  let includeTiming = false;
  let input: string | undefined;
  let concurrency = 2;
  let concurrencySupplied = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      process.stdout.write(`${help}\n`);
      process.exit(0);
    }
    if (argument === "--version") {
      process.stdout.write("0.1.0\n");
      process.exit(0);
    }
    if (argument === "--method")
      initialMethod = args[++index] ?? usage("--method requires a value");
    else if (argument === "--max-hops") {
      maxHops = numberOption(args[++index], "--max-hops");
      maxHopsSupplied = true;
    } else if (argument === "--expect-final") {
      const value = args[++index] ?? usage("--expect-final requires a value");
      try {
        expectFinal = new URL(value);
      } catch {
        usage("--expect-final must be a valid URL");
      }
      if (expectFinal.protocol !== "http:" && expectFinal.protocol !== "https:")
        usage("--expect-final must use http or https");
    } else if (argument === "--expect-status") {
      expectStatus = numberOption(args[++index], "--expect-status");
    } else if (argument === "--lax") lax = true;
    else if (argument === "--timeout") timeoutMs = numberOption(args[++index], "--timeout");
    else if (argument === "--format") format = args[++index] ?? usage("--format requires a value");
    else if (argument === "--show-secrets") showSecrets = true;
    else if (argument === "--ignore-params-loop") ignoreParamsLoop = true;
    else if (argument === "--include-timing") includeTiming = true;
    else if (argument === "--input") input = args[++index] ?? usage("--input requires a value");
    else if (argument === "--concurrency") {
      concurrency = numberOption(args[++index], "--concurrency");
      concurrencySupplied = true;
    } else if (argument.startsWith("-")) usage(`unknown option: ${argument}`);
    else if (url === undefined) url = argument;
    else usage("only one URL may be supplied");
  }
  if (input !== undefined && url !== undefined)
    usage("a positional URL cannot be combined with batch input");
  if (url === undefined && input === undefined && !process.stdin.isTTY) input = "-";
  if (concurrencySupplied && input === undefined) usage("--concurrency requires batch input");
  if (input !== undefined && expectFinal !== undefined)
    usage("batch expectations are per-row-only; --expect-final cannot be used with batch input");
  if (url === undefined && input === undefined) usage("a URL or --input is required");
  let parsed: URL | undefined;
  if (url !== undefined) {
    try {
      parsed = new URL(url);
    } catch {
      usage("URL must be valid");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      usage("URL must use http or https");
  }
  if (format !== "terminal" && format !== "markdown" && format !== "json")
    usage("--format must be terminal, markdown, or json");
  if (lax && expectFinal === undefined && input === undefined)
    usage("--lax requires --expect-final");
  initialMethod = initialMethod.toUpperCase();
  if (
    !new Set(["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "TRACE", "CONNECT"]).has(
      initialMethod,
    )
  )
    usage("--method must be a standard HTTP method");
  return {
    url: parsed,
    initialMethod,
    maxHops,
    maxHopsSupplied,
    timeoutMs,
    expectFinal,
    expectStatus,
    lax,
    format,
    showSecrets,
    ignoreParamsLoop,
    includeTiming,
    input,
    concurrency,
  };
}

const options = parseArgs(process.argv.slice(2));
if (options.input !== undefined) {
  let input: string;
  try {
    input = options.input === "-" ? await readStdin() : await readFile(options.input, "utf8");
  } catch {
    usage(`could not read batch input: ${options.input}`);
  }
  let rows;
  try {
    rows = parseBatchInput(input);
  } catch (error) {
    usage(
      error instanceof Error ? error.message : `batch input exceeds the ${inputLineCap}-line cap`,
    );
  }
  if (rows.length === 0) usage("batch input contains no usable rows");
  const results = await traceBatch(rows, options, options.concurrency, (result) => {
    if (options.format === "terminal")
      process.stdout.write(`${renderBatchTerminalLine(result, options.showSecrets)}\n`);
  });
  process.stdout.write(
    options.format === "markdown"
      ? renderBatchMarkdown(results, options.showSecrets)
      : options.format === "json"
        ? renderBatchJson(results, options.showSecrets, options.initialMethod)
        : renderBatchTerminal(results, options.showSecrets),
  );
  process.exitCode = batchExitCode(results);
} else {
  const result = await traceRedirects(options.url!, options);
  const analyzed = {
    ...analyzeTrace(result.trace, options),
    assertions: shouldEvaluateAssertions(result.outcome, options.maxHopsSupplied)
      ? evaluateAssertions(result.trace, options)
      : [],
  };
  const output =
    options.format === "markdown"
      ? renderMarkdown(analyzed)
      : options.format === "json"
        ? renderJson(analyzed)
        : renderTerminal(analyzed);
  process.stdout.write(output);
  if (
    result.outcome === "transport" ||
    (result.outcome === "hop-limit" && !options.maxHopsSupplied)
  )
    process.stderr.write(`${result.trace.failure ?? result.trace.hops.at(-1)?.error}\n`);
  process.exitCode =
    result.outcome === "transport" || (result.outcome === "hop-limit" && !options.maxHopsSupplied)
      ? 3
      : analyzed.assertions.some((assertion) => !assertion.passed)
        ? 4
        : analyzed.flags.length > 0
          ? 1
          : 0;
}
