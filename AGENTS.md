# Architecture rules
- Apply application SQL and deploy functions to the active external database's phase1 schema, never the unused managed backend, because production data lives externally.
- Order SMS uses a private database outbox with unique order/kind keys and atomic claims to cover all payment and delivery paths without changing fulfillment.
- SMS remains disabled until an internal-only test passes and sending is activated explicitly; quarantine provider-ambiguous sends rather than automatically retrying them to avoid duplicate charges.
- Keep SMS eligibility and templates in a pure shared module with concrete status and segment-limit tests.