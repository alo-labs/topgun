# Adapter: skills.sh

**Registry:** skills.sh  
**Method:** WebFetch GET  
**Timeout:** 8 seconds

---

## Request

```
GET https://skills.sh/api/skills?q={query}
```

- URL-encode the query string before inserting it.
- No authentication required.

---

## Timeout + Retry

- Set fetch timeout to 8 seconds.
- On HTTP 429: wait 1s, retry; wait 2s, retry; wait 4s, retry. After 3 retries
  return `status: "unavailable"`, `reason: "rate limited by skills.sh"`.
- On timeout or HTTP 5xx: return `status: "unavailable"`, `reason: "<error detail>"`.

---

## Response Parsing

Parse the JSON response body. The expected shape is an array of skill objects.
Extract the following fields from each entry (use `null` if absent):

| Response field | Unified schema field |
|----------------|----------------------|
| `name` | `name` |
| `description` | `description` |
| `install_url` or `url` | `install_url` |
| `stars` or `installs` | `stars` |
| `updated_at` or `last_updated` | `last_updated` |
| *(whole object)* | `raw_metadata` |

Set `source_registry: "skills.sh"` on every result.  
Set `content_sha: null` (not available from this registry).

---

## Return Value

```json
{
  "registry": "skills.sh",
  "status": "ok",
  "reason": null,
  "results": [ /* unified schema objects */ ],
  "latency_ms": 0
}
```

On failure:

```json
{
  "registry": "skills.sh",
  "status": "unavailable",
  "reason": "<reason string>",
  "results": [],
  "latency_ms": 0
}
```
