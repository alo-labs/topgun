---
adapter: vskill
registry: vskill
tier: 2
status: unconfirmed
auth_required: false
timeout_ms: 8000
max_retries: 3
degradation_reason: "API endpoint is best-guess — not officially documented"
---

# vskill Adapter

Searches the vskill registry. The API endpoint is a best-guess based on observed domain patterns; it is not officially documented. This adapter gracefully skips on any failure.

## Endpoint

```
GET https://vskill.dev/api/skills?search={query}
```

No authentication required (assumed).

## Execution Instructions

### Step 1 — Build request URL

```
https://vskill.dev/api/skills?search={url_encode(query)}
```

### Step 2 — WebFetch with timeout

Perform a WebFetch GET to the constructed URL.

- Timeout: **8 seconds**
- On timeout: return unavailable (see Step 4)

### Step 3 — Retry on 429

If the response status is `429 Too Many Requests`:

| Attempt | Wait before retry |
|---------|-------------------|
| 1st retry | 1 second |
| 2nd retry | 2 seconds |
| 3rd retry | 4 seconds |

After 3 retries with no success, return unavailable result.

### Step 4 — Handle any non-200

On any non-200 status code, timeout, or network error, return immediately:

```json
{
  "status": "unavailable",
  "reason": "vskill API not reachable or endpoint unconfirmed",
  "results": [],
  "registry": "vskill",
  "latency_ms": {elapsed_ms}
}
```

Do not attempt to parse partial responses.

### Step 5 — Parse success response (if 200)

If the API returns 200, attempt to map results to unified schema:

| response field | unified field | notes |
|---------------|---------------|-------|
| `name` or `skill_name` or `id` | `name` | use first present field |
| `description` or `about` (truncate to 500 chars, strip markdown/HTML tags before storing) | `description` | |
| `"vskill"` | `source_registry` | hardcoded |
| `downloads` or `installs` | `install_count` | null if absent |
| `stars` or `likes` | `stars` | null if absent |
| `null` | `security_score` | computed by SecureSkills |
| `updated_at` or `last_updated` | `last_updated` | ISO-8601 if available |
| `null` | `content_sha` | computed by SecureSkills |
| `install_url` or `source_url` | `install_url` | null if absent |
| full response item | `raw_metadata` | preserve entire object |

If the response is not a parseable JSON array or object with results (unexpected format), treat as unavailable:

```json
{
  "status": "unavailable",
  "reason": "vskill API response format unexpected",
  "results": [],
  "registry": "vskill",
  "latency_ms": {elapsed_ms}
}
```

### Step 6 — Return success result

```json
{
  "status": "ok",
  "reason": null,
  "results": [ /* mapped array */ ],
  "registry": "vskill",
  "latency_ms": {elapsed_ms}
}
```

## Threat Mitigations

- **T-02-05 (Spoofing):** All raw response data is stored in `raw_metadata`. The topgun-finder orchestrator applies structural envelope before downstream processing.
- **T-02-06 (DoS):** Any non-200 triggers immediate unavailable return. 8-second hard timeout + exponential backoff on 429 prevents stalling.

## Notes

- The endpoint `https://vskill.dev/api/skills?search=...` is a best-guess. If vskill publishes official API docs, update this file with the confirmed endpoint and schema.
- This adapter is designed for future activation — current graceful-skip behavior ensures pipeline continuity.
