# Adapter: agentskill.sh

**Registry:** agentskill.sh  
**Method:** Bash CLI (`ags` command)  
**Timeout:** 8 seconds

---

## Pre-flight Check

Before running the search, verify `ags` is available:

```bash
which ags 2>/dev/null
```

If the command returns no output (exit code non-zero or empty), return immediately:

```json
{
  "registry": "agentskill.sh",
  "status": "unavailable",
  "reason": "ags CLI not found",
  "results": [],
  "latency_ms": 0
}
```

Do NOT attempt to install `ags` automatically.

---

## Request

```bash
ags search "{query}" --json
```

- Shell-quote the query string.
- Enforce an 8-second timeout on this Bash call.

---

## Timeout + Retry

- On timeout: return `status: "unavailable"`, `reason: "ags search timed out"`.
- On non-zero exit code: return `status: "error"`, `reason: "<stderr output>"`.
- On HTTP 429 from underlying ags call (if surfaced in output): wait 1s, retry;
  wait 2s, retry; wait 4s, retry. After 3 retries return `status: "unavailable"`,
  `reason: "rate limited by agentskill.sh"`.

---

## Response Parsing

Parse the JSON output from stdout. Expected shape is an array of skill objects.
Extract the following fields from each entry (use `null` if absent):

| Response field | Unified schema field |
|----------------|----------------------|
| `name` | `name` |
| `description` | `description` |
| `install_url` or `url` | `install_url` |
| `contentSha` or `ecosystem.contentSha` | `content_sha` |
| `stars` | `stars` |
| `updated_at` | `last_updated` |
| *(whole object)* | `raw_metadata` |

Set `source_registry: "agentskill.sh"` on every result.

---

## Return Value

```json
{
  "registry": "agentskill.sh",
  "status": "ok",
  "reason": null,
  "results": [ /* unified schema objects */ ],
  "latency_ms": 0
}
```

On failure:

```json
{
  "registry": "agentskill.sh",
  "status": "unavailable",
  "reason": "<reason string>",
  "results": [],
  "latency_ms": 0
}
```
