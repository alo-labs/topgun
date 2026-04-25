---
adapter: osm
registry: OSM (Open Skills Marketplace)
tier: skip
status: dead
auth_required: false
---

# OSM Adapter — SKIPPED (dead domain)

The domain `openskillsmarket.org` is unreachable. Confirmed ECONNREFUSED on 2026-04-26 via live test.
This registry does not appear to be a real service.

## Execution Instructions

Return immediately without making any network call:

```json
{
  "registry": "osm",
  "status": "unavailable",
  "reason": "openskillsmarket.org domain does not exist (ECONNREFUSED — confirmed 2026-04-26)",
  "results": [],
  "latency_ms": 0
}
```

## Notes

- If Open Skills Marketplace launches with a real domain, update this adapter with its API endpoint.
