# Adapter: MCP.so

**Registry:** MCP.so
**Method:** WebSearch (API returns 403 as of 2026-04-26)
**Timeout:** N/A (WebSearch)

---

## Status

`https://mcp.so/api/servers` returns 403 Forbidden. MCP.so is a Next.js SPA with no
public REST API. This adapter uses WebSearch to find MCP servers relevant to the query.

Note: MCP.so lists MCP (Model Context Protocol) servers, which are tools/integrations
usable with Claude Code via `--mcp`. Results are adjacent to Claude Code skills.

---

## Execution Instructions

### Step 1 — WebSearch

Run a WebSearch with the following query:

```
site:mcp.so {query}
```

### Step 2 — Parse results

For each search result with a URL starting with `https://mcp.so/`:

| Search result field | Unified schema field |
|---------------------|----------------------|
| Page title (strip " - MCP.so" suffix) | `name` |
| Snippet (truncate to 500 chars) | `description` |
| Result URL | `install_url` |
| `null` | `stars` |
| `null` | `last_updated` |
| `null` | `content_sha` |
| `"mcp-so"` | `source_registry` |
| `{ "search_result": { "title": "...", "url": "...", "snippet": "..." } }` | `raw_metadata` |

Filter out results whose URLs don't start with `https://mcp.so/`. Skip results with
missing names.

### Step 3 — Handle no results

If 0 results found, return:

```json
{
  "registry": "mcp-so",
  "status": "ok",
  "reason": "no results found",
  "results": [],
  "latency_ms": 0
}
```

### Step 4 — Return success

```json
{
  "registry": "mcp-so",
  "status": "ok",
  "reason": null,
  "results": [ /* mapped array */ ],
  "latency_ms": 0
}
```

## Notes

- If MCP.so publishes a documented REST API, replace this adapter with a WebFetch approach.
- Confirmed 403 on 2026-04-26: `GET https://mcp.so/api/servers?q=test`.
