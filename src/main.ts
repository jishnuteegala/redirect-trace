import { traceRedirects } from "./engine.js";
import { analyzeTrace } from "./analyze.js";
import { evaluateAssertions } from "./assertions.js";
import { renderJson, renderMarkdown, renderTerminal } from "./render.js";

const help = `Usage: redirect-trace <url> [options]

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
  --help             Show this help
  --version          Show version

Examples:
  redirect-trace https://example.com
  redirect-trace https://example.com --format markdown > trace.md

Exit codes:
  0 clean     resolved with no flags
  1 flagged   resolved with one or more observations
  2 usage or environment failure  bad arguments, invalid URL, unsupported Node, or startup failure
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
  if (format !== "terminal" && format !== "markdown" && format !== "json")
    usage("--format must be terminal, markdown, or json");
  if (lax && expectFinal === undefined) usage("--lax requires --expect-final");
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
  };
}

const options = parseArgs(process.argv.slice(2));
const result = await traceRedirects(options.url, options);
const analyzed = {
  ...analyzeTrace(result.trace, options),
  assertions:
    result.outcome === "complete" || (result.outcome === "hop-limit" && options.maxHopsSupplied)
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
if (result.outcome === "transport" || (result.outcome === "hop-limit" && !options.maxHopsSupplied))
  process.stderr.write(`${result.trace.failure ?? result.trace.hops.at(-1)?.error}\n`);
process.exitCode =
  result.outcome === "transport" || (result.outcome === "hop-limit" && !options.maxHopsSupplied)
    ? 3
    : analyzed.assertions.some((assertion) => !assertion.passed)
      ? 4
      : analyzed.flags.length > 0
        ? 1
        : 0;
