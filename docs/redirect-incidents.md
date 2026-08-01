# Redirect Diagnosis Incidents

## OAuth callback lost its authorization code

An OAuth callback began at a marketing vanity URL and reached the application
without the `code` parameter. Inspecting the chain showed an intermediate 302
that rebuilt the query string from an allowlist and omitted `code`. Updating
that redirect to preserve the complete query restored login completion.

## HTTP migration loop behind a load balancer

A site migration intermittently looped between HTTP and HTTPS. The origin
redirected HTTP to HTTPS, while the load balancer sent the origin HTTP because
the forwarded protocol header was not trusted. Trusting the proxy header at the
origin stopped the loop.
