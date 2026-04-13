# Adapter: Claude Plugins Official

**Registry:** Claude Plugins Official (Anthropic)  
**Method:** WebFetch GET (static manifest)  
**Timeout:** 8 seconds

---

## Request

Fetch the static marketplace manifest directly from GitHub:

```
GET https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json
```

No authentication required.

## Filtering

The manifest contains all ~133 plugins. Filter client-side: include entries where `name`, `description`, `keywords`, or `tags` contain the query string (case-insensitive substring match).

## Timeout + Retry

- On timeout or 5xx: return `status: "unavailable"`.
- No retry — static file; failure is likely a network issue.

## Response Parsing

Expected shape: array or object with plugin entries.

| Response field | Unified schema field |
|----------------|----------------------|
| `name` | `name` |
| `description` | `description` |
| `homepage` or `repository` | `install_url` |
| `version` | `last_updated` (use as proxy) |
| `keywords` or `tags` | included in `raw_metadata` |
| *(whole object)* | `raw_metadata` |

Set `source_registry: "claude-plugins-official"` on every result.  
Set `content_sha: null` (not available from this manifest).

## Return Value

```json
{
  "registry": "claude-plugins-official",
  "status": "ok",
  "reason": null,
  "results": [ /* unified schema objects — filtered to query */ ],
  "latency_ms": 0
}
```
