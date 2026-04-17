# Adapter: MCP.so

**Registry:** MCP.so  
**Method:** WebFetch GET (best-guess — no confirmed public API)  
**Timeout:** 8 seconds

---

## Degradation Notice

MCP.so is a Next.js SPA. No documented REST API was confirmed during research. This adapter attempts a best-guess endpoint and gracefully skips on failure.

## Attempt

```
GET https://mcp.so/api/servers?q={query}&limit=20
```

Also try if above fails:

```
GET https://mcp.so/api/search?q={query}
```

- URL-encode query string.
- No authentication.

## Timeout + Retry

- **Timeout:** 8 seconds
- **Retry policy:** Do NOT retry on any failure. This adapter has no confirmed public API; any non-success response triggers immediate graceful skip (see Step 2).

## Execution Instructions

### Step 1 — Attempt WebFetch with timeout

If the response is valid JSON with a results array, parse and return results.

### Step 2 — Graceful skip on any failure

On 404, 403, timeout, or non-JSON response, return immediately:

```json
{
  "registry": "mcp-so",
  "status": "unavailable",
  "reason": "MCP.so has no confirmed REST API — endpoint returned <status code>",
  "results": [],
  "latency_ms": 0
}
```

Do NOT retry. Do NOT attempt browser-based scraping.

## Response Parsing (if successful)

| Response field | Unified schema field |
|----------------|----------------------|
| `name` or `title` | `name` |
| `description` or `summary` (truncate to 500 chars, strip markdown/HTML tags before storing) | `description` |
| `url` or `homepage` | `install_url` |
| `stars` or `starCount` | `stars` |
| `updatedAt` | `last_updated` |
| *(whole object)* | `raw_metadata` |

Set `source_registry: "mcp-so"` on every result.

## Future Activation

If MCP.so publishes a documented API, update this adapter following the standard pattern (see `smithery.md` as reference).
