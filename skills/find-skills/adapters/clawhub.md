---
adapter: clawhub
registry: ClawHub
tier: 2
status: skip
auth_required: false
timeout_ms: 0
max_retries: 0
degradation_reason: "No confirmed REST API exists — research phase confirmed no queryable endpoint"
---

# ClawHub Adapter

ClawHub does not expose a confirmed REST API for programmatic skill search. Research during Phase 1 confirmed no queryable endpoint exists. This adapter immediately returns unavailable without making any network call.

## Execution Instructions

### Step 1 — Return immediately (no network call)

Do NOT perform any WebFetch. Return the following result immediately:

```json
{
  "status": "unavailable",
  "reason": "ClawHub has no confirmed REST API — skipped per research findings",
  "results": [],
  "registry": "ClawHub",
  "latency_ms": 0
}
```

That is the complete execution of this adapter. No further steps.

## Why This Adapter Exists

This file serves three purposes:

1. **Completeness** — ClawHub is a known registry in the ecosystem. Its absence from results is documented, not accidental.
2. **Future activation** — If ClawHub publishes a REST API, this file can be updated to implement the full adapter contract (endpoint, auth, field mapping, timeout/backoff).
3. **Audit trail** — Operators reviewing pipeline output can confirm ClawHub was considered and intentionally skipped, not missed.

## Future Activation

If a ClawHub API becomes available:

1. Update `status: skip` to `status: active`
2. Add `endpoint` to the frontmatter
3. Implement Steps 1–6 following the standard adapter pattern (see `npm.md` as a reference)
4. Test that 403/5xx/timeout all return `status: "unavailable"`

## Threat Mitigations

- **T-02-05 (Spoofing):** Not applicable — no network call is made.
- **T-02-06 (DoS):** Not applicable — immediate return with zero latency; cannot stall the pipeline.
