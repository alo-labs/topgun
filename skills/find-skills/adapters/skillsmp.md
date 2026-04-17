---
adapter: skillsmp
registry: SkillsMP
tier: 2
status: degraded
auth_required: unknown
timeout_ms: 8000
max_retries: 3
degradation_reason: "API returned 403 during research phase — access may be restricted"
---

# SkillsMP Adapter

Searches the SkillsMP registry for skills. During research, the API endpoint returned 403 (Forbidden). This adapter attempts the request but gracefully degrades on 403.

## Degradation Notice

The endpoint `https://skillsmp.com/api/v1/skills/search` returned 403 (Forbidden) during research — API access may be restricted or require registration. This adapter attempts the request but returns `status: "unavailable"` on 403 or any other non-200 response. The pipeline continues without SkillsMP results.

## Endpoint

```
GET https://skillsmp.com/api/v1/skills/search?q={query}
```

Auth status unknown — no API key available.

## Execution Instructions

### Step 1 — Build request URL

```
https://skillsmp.com/api/v1/skills/search?q={url_encode(query)}
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

### Step 4 — Handle 403 (expected)

If the response status is `403 Forbidden`, **do not retry**. Return immediately:

```json
{
  "status": "unavailable",
  "reason": "SkillsMP API returned 403 — access restricted",
  "results": [],
  "registry": "SkillsMP",
  "latency_ms": {elapsed_ms}
}
```

### Step 5 — Handle other non-200 and errors

On any `5xx` status, timeout, or network error:

```json
{
  "status": "unavailable",
  "reason": "SkillsMP API returned {status_code} or timed out",
  "results": [],
  "registry": "SkillsMP",
  "latency_ms": {elapsed_ms}
}
```

### Step 6 — Parse success response (if 200)

If the API returns 200 (access restored), map results to unified schema:

| response field | unified field | notes |
|---------------|---------------|-------|
| `name` or `title` | `name` | use whichever is present |
| `description` (truncate to 500 chars, strip markdown/HTML tags before storing) | `description` | |
| `"SkillsMP"` | `source_registry` | hardcoded |
| `downloads` or `installs` | `install_count` | null if absent |
| `stars` or `rating` | `stars` | null if absent |
| `null` | `security_score` | computed by SecureSkills |
| `updated_at` or `last_updated` | `last_updated` | ISO-8601 if available |
| `null` | `content_sha` | computed by SecureSkills |
| `install_url` or constructed | `install_url` | construct from identifier if needed |
| full response item | `raw_metadata` | preserve entire object |

### Step 7 — Return success result

```json
{
  "status": "ok",
  "reason": null,
  "results": [ /* mapped array */ ],
  "registry": "SkillsMP",
  "latency_ms": {elapsed_ms}
}
```

## Threat Mitigations

- **T-02-05 (Spoofing):** All raw response data is stored in `raw_metadata`. The topgun-finder orchestrator applies structural envelope before downstream processing.
- **T-02-06 (DoS):** 403 returns immediately without retry. 8-second timeout + exponential backoff on 429 prevents stalling.

## Notes

- Research (Phase 1) confirmed this endpoint returned 403 on all probe attempts. The adapter is included for completeness and future activation if SkillsMP provides API access.
- If an API key becomes available, add it as `Authorization: Bearer {key}` and retrieve it via `$CLAUDE_PLUGIN_ROOT/bin/topgun-tools.cjs keychain-get skillsmp_api_key`.
