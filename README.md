# redirect-trace

[![CI](https://github.com/jishnuteegala/redirect-trace/actions/workflows/ci.yml/badge.svg)](https://github.com/jishnuteegala/redirect-trace/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/redirect-trace)](https://www.npmjs.com/package/redirect-trace)

`curl -IL` shows headers, but it does not explain which redirect dropped a query parameter, changed origin, or introduced a risk. `redirect-trace` is a local CLI for the searches people actually make: "compare redirect query params" and "why did my OAuth redirect drop the code param". It follows one HTTP(S) chain, explains each hop, and provides a CI-safe verdict without sending your URL to a hosted viewer.

It traces redirects with safe HEAD-then-GET requests, preserves duplicate query keys and value order, percent-decodes keys and values, and treats `+` as a literal plus (`%20` is a space). It flags loops, HTTPS-to-HTTP downgrades, origin changes, method-semantic transitions, and terminal error responses.

## Install and run

```sh
npx redirect-trace https://example.com
pnpm dlx redirect-trace https://example.com --format markdown
pnpm add --global redirect-trace
redirect-trace https://example.com
```

Requires Node 18 or newer. `npx` and `pnpm dlx` users on a current Node need do nothing. The CLI only makes the requests needed to trace the URL you provide; it has no telemetry or hosted service.

## Agent and script use

Use exit status as a CI gate. Output remains on stdout, while request failures are reported on stderr.

```sh
redirect-trace "$REDIRECT_URL" --format markdown > redirect-trace.md
case $? in
  0) echo "redirect chain is clean" ;;
  1) echo "redirect chain has observations"; exit 1 ;;
  2) echo "redirect-trace usage or environment failure"; exit 2 ;;
  3) echo "redirect request could not complete"; exit 3 ;;
  4) echo "redirect assertion failed"; exit 4 ;;
esac
```

For scripts and agents, parse the deterministic JSON model. Timing is omitted unless explicitly requested.

```sh
redirect-trace "$REDIRECT_URL" --format json > trace.json
node --input-type=module -e 'import { readFileSync } from "node:fs"; const trace = JSON.parse(readFileSync("trace.json", "utf8")); console.log(trace.flags.map(({ kind }) => kind).join(", ") || "clean");'
```

## Exit-code contract v2

| Code | Meaning |
| --- | --- |
| `0` | Clean: the chain reached a terminal response with no flags. |
| `1` | Flagged: the chain resolved, but one or more risks were found, including a terminal 4xx or 5xx response. |
| `2` | Usage or environment failure: arguments or the URL are invalid, Node is unsupported, or the CLI could not start. |
| `3` | Transport/request failure: timeout, connection error, the engine hop limit, or a 3xx response without `Location`. |
| `4` | Assertion failure: a supplied chain-shape expectation did not match. |

On a mid-chain transport failure, redirect-trace still renders the partial trace and marks the failed hop.

Exit precedence is usage (`2`), transport (`3`), assertion (`4`), flagged (`1`), then clean (`0`). Scripts that previously treated every status above `1` as an infrastructure failure must add an explicit `4` branch for a redirect-contract failure.

## Assertions

Use assertions to make a redirect chain a CI gate:

```sh
redirect-trace https://old.example.com/docs --expect-final https://example.com/docs --expect-status 200 --max-hops 2
```

Final URL comparison is strict by default: both URLs are parsed and serialised, then compared exactly. `--lax` is only valid with `--expect-final` and applies exactly these fixed normalisations: strip trailing path slashes, treat HTTP and HTTPS as equivalent only with the same host and path, and remove `utm_*`, `gclid`, and `fbclid` query parameters. It does not tolerate `www.` changes, patterns, globs, or configurable rules.

Terminal and Markdown output report failed expectations as `expected X, got Y`. If masked query values are the only difference, they say so rather than implying the URLs are identical. When a chain does not terminate (for example, an asserted hop cap is exceeded or a redirect loop is found), terminal URL and status assertions are reported as failed but not evaluated: their `actual` value is `null` and their additive `note` explains why. A loop always fails a supplied `--max-hops` assertion, with `actual: "loop"`. JSON adds an `assertions` array with `kind`, `expected`, `actual`, `passed`, and, where relevant, `normalization` or `note`. A lax pass that requires multiple combined normalizations has no single `normalization` value, so that field is absent.

## What this will never assert

Assertions describe chain shape only: terminal URL, terminal status, and hop count. They will never assert headers, response bodies, or timing. Use an HTTP test framework such as hurl for those checks.

## Secrets and determinism

Query values are masked by default when their case-insensitive key is one of:

`token`, `access_token`, `refresh_token`, `code`, `secret`, `client_secret`, `key`, `api_key`, `password`, `pwd`, `sig`, `signature`, `auth`, `session`, `sid`.

Pass `--show-secrets` only when raw values are safe to display or store.

Markdown and JSON are deterministic for the same captured trace: they omit timing by default and use stable rendering. Remote servers can still return different redirects between requests. `--include-timing` adds per-hop timing to Markdown and JSON and intentionally breaks byte-identical output; terminal output always shows live timing.

## Flags

| Flag | Meaning |
| --- | --- |
| `loop` | A normalized URL repeats in the chain. |
| `loop-ignoring-params` | A URL repeats after removing its query string; enabled with `--ignore-params-loop`. |
| `https-downgrade` | A redirect moves from HTTPS to HTTP. |
| `cross-origin` | Scheme, host, or port changes. |
| `host-change` | Host changes between hops. |
| `port-change` | Port changes between hops. |
| `method-semantic-transition` | The selected initial method has notable redirect semantics for this status. |
| `terminal-error-status` | The terminal response is 4xx or 5xx. |

Flags are observations for review, not assertions that a redirect is wrong.

## Reference

| Flag | Default | Meaning |
| --- | --- | --- |
| `<url>` | required | One `http` or `https` URL to trace. |
| `--method <M>` | `GET` | Method label for redirect-semantic analysis. Requests remain safe HEAD-then-GET with no body. |
| `--format <fmt>` | `terminal` | `terminal`, `markdown`, or `json`. |
| `--max-hops <n>` | `10` | When supplied, assert that the chain has at most `<n>` redirects; an exceeded assertion exits `4`. Without it, the default engine limit is 10 redirects and an exceeded limit exits `3`. |
| `--expect-final <url>` | | Require an exact terminal HTTP(S) URL. |
| `--expect-status <code>` | | Require the terminal integer HTTP status. |
| `--lax` | off | Apply the three fixed opt-in normalisations to `--expect-final`. |
| `--timeout <ms>` | `10000` | Per-request timeout in milliseconds. |
| `--show-secrets` | off | Show raw sensitive query values. |
| `--ignore-params-loop` | off | Also detect repeated URLs with query strings removed. |
| `--include-timing` | off | Include timing in Markdown/JSON; breaks deterministic output. |
| `--help` | | Print usage, examples, and exit codes. |
| `--version` | | Print the CLI version. |

## First release

Before merging the first release PR, configure npm trusted publishing for `redirect-trace` with this repository as its trusted publisher. This one-time npmjs setup is required before the workflow can publish with OIDC.

## License

MIT - see [LICENSE](LICENSE)
