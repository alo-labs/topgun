---
adapter: vskill
registry: vskill
tier: skip
status: dead
auth_required: false
---

# vskill Adapter — SKIPPED (dead domain)

The domain `vskill.dev` is unreachable. Confirmed ECONNREFUSED on 2026-04-26 via live test.
This registry does not appear to be a real service.

## Execution Instructions

Return immediately without making any network call:

```json
{
  "registry": "vskill",
  "status": "unavailable",
  "reason": "vskill.dev domain does not exist (ECONNREFUSED — confirmed 2026-04-26)",
  "results": [],
  "latency_ms": 0
}
```

## Notes

- If vskill.dev becomes reachable in future, update this adapter with its real API endpoint.
