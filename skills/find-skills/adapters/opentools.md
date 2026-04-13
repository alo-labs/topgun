# Adapter: OpenTools.ai

**Registry:** OpenTools.ai  
**Method:** WebFetch GET (best-guess — no confirmed public API)  
**Timeout:** 8 seconds

---

## Degradation Notice

OpenTools.ai is a Next.js app. No documented REST API was confirmed during research. This adapter attempts a best-guess endpoint and gracefully skips on failure.

## Attempt

```
GET https://opentools.ai/api/tools?q={query}&limit=20
```

Also try if above fails:

```
GET https://opentools.ai/api/search?query={query}
```

- URL-encode query string.
- No authentication.

## Execution Instructions

### Step 1 — Attempt WebFetch with timeout

If the response is valid JSON with a results or tools array, parse and return results.

### Step 2 — Graceful skip on any failure

On 404, 403, timeout, or non-JSON response, return immediately:

```json
{
  "registry": "opentools",
  "status": "unavailable",
  "reason": "OpenTools.ai has no confirmed REST API — endpoint returned <status code>",
  "results": [],
  "latency_ms": 0
}
```

Do NOT retry. Do NOT attempt browser-based scraping.

## Response Parsing (if successful)

| Response field | Unified schema field |
|----------------|----------------------|
| `name` or `title` | `name` |
| `description` or `tagline` | `description` |
| `url` or `website` | `install_url` |
| `stars` or `upvotes` | `stars` |
| `updatedAt` or `createdAt` | `last_updated` |
| *(whole object)* | `raw_metadata` |

Set `source_registry: "opentools"` on every result.

## Future Activation

If OpenTools.ai publishes a documented API, update this adapter following the standard pattern (see `smithery.md` as reference).
