# redirect-trace

Trace HTTP redirects as an issue-ready diagnosis: see exactly where query parameters change and where loops, security downgrades, cross-origin hops, or method semantics become risky.

`redirect-trace <url> --format markdown|json` produces a deterministic redirect diagnosis.

Query keys and values are percent-decoded, duplicates and value order are preserved, and `+` is a literal plus (use `%20` for spaces). Fragments are displayed but never compared because they are not sent to the server.

Sensitive query values are masked by default for: `token`, `access_token`, `refresh_token`, `code`, `secret`, `client_secret`, `key`, `api_key`, `password`, `pwd`, `sig`, `signature`, `auth`, `session`, and `sid`. Use `--show-secrets` to expose them.

Exit codes: `0` clean, `1` flagged, `2` usage error, `3` transport failure.

MIT - see [LICENSE](LICENSE)
