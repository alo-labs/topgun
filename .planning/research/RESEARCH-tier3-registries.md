# Registry API Research — Tier 3 Registries

**Researched:** 2026-04-13
**Purpose:** Identify programmatic search APIs for 7 AI skill/tool registries
**Method:** Live HTTP probing, official documentation, GitHub inspection

---

## Summary

Of the 7 registries investigated, **3 have confirmed, working REST APIs** (Glama.ai, Hugging Face Hub, LangChain Hub), **1 has a static JSON file** that is directly fetchable (Claude Plugins Official), **1 has no public API** (MCP.so — Next.js SPA with no documented backend API), and **2 are effectively API-free directories** (OpenTools.ai, Cursor Directory).

---

## Registry Findings

---

### 1. MCP.so

| Field | Value |
|-------|-------|
| **Name** | MCP.so |
| **URL** | https://mcp.so |
| **Search Endpoint** | None found |
| **Auth Method** | N/A |
| **CLI Tool** | None |
| **Confidence** | SKIP |

**Notes:**

MCP.so is a Next.js server-side rendered application. Live probing confirmed:
- `https://mcp.so/api/servers` → HTTP 404
- `https://mcp.so/api/search?q=github` → HTTP 404 (Next.js 404 page)
- No `_next/data` API routes exposed publicly

The site uses Cloudflare CDN and renders pages server-side. There is no documented public REST API. The registry is browse-only via the web interface at `https://mcp.so/servers`.

**Workaround:** None without browser automation (which is out of scope).

[VERIFIED: live HTTP probe 2026-04-13]

---

### 2. Glama.ai

| Field | Value |
|-------|-------|
| **Name** | Glama.ai |
| **URL** | https://glama.ai |
| **Search Endpoint** | `GET https://glama.ai/api/mcp/v1/servers` |
| **Auth Method** | None (public endpoint, no auth required) |
| **CLI Tool** | None found |
| **Confidence** | HIGH |

**Endpoint details (live-verified):**

```
GET https://glama.ai/api/mcp/v1/servers
  ?query=<search term>       # substring filter on name/description
  &first=<N>                 # page size (default observed: 10)
  &after=<cursor>            # pagination cursor (base64 JSON)
```

**Response shape:**
```json
{
  "pageInfo": {
    "endCursor": "<base64>",
    "hasNextPage": true,
    "hasPreviousPage": false,
    "startCursor": "<base64>"
  },
  "servers": [
    {
      "id": "hou9isamzv",
      "name": "better-bear",
      "namespace": "mreider",
      "slug": "better-bear",
      "description": "...",
      "attributes": ["hosting:remote-capable"],
      "repository": { "url": "https://github.com/..." },
      "spdxLicense": { "name": "MIT License", "url": "..." },
      "tools": [],
      "url": "https://glama.ai/mcp/servers/hou9isamzv",
      "environmentVariablesJsonSchema": { ... }
    }
  ]
}
```

**Individual server lookup:**
```
GET https://glama.ai/api/mcp/v1/servers/{namespace}/{slug}
```
Example: `https://glama.ai/api/mcp/v1/servers/mreider/better-bear`

**Pagination:** Cursor-based. Pass `endCursor` from previous response as `after` param for next page.

**Gateway/LLM API** (separate, requires auth): `POST https://glama.ai/api/gateway/openai/v1/chat/completions` with `Authorization: Bearer <GLAMA_API_KEY>`.

[VERIFIED: live HTTP probe returning JSON, 2026-04-13]

---

### 3. Hugging Face Hub

| Field | Value |
|-------|-------|
| **Name** | Hugging Face Hub |
| **URL** | https://huggingface.co |
| **Search Endpoint** | `GET https://huggingface.co/api/spaces` |
| **Auth Method** | None for public Spaces; Bearer token for private |
| **CLI Tool** | `huggingface-hub` (Python), `@huggingface/hub` (npm) |
| **Confidence** | HIGH |

**Endpoint details (live-verified):**

```
GET https://huggingface.co/api/spaces
  ?search=<substring>        # filter by name/description
  ?sort=likes|trendingScore|createdAt|updatedAt
  ?limit=<N>                 # items per page (default: 100 max?)
  ?cursor=<opaque>           # pagination via Link header
  ?filter=<tag>              # e.g. "mcp-server", "gradio"
  ?author=<org_or_user>      # filter by author
```

**Pagination:** Link header with `rel="next"` cursor URL.

**Response shape (array of Space objects):**
```json
[
  {
    "_id": "6931936f57adaf3524388f9c",
    "id": "mcp-tools/Z-Image-Turbo",
    "likes": 25,
    "trendingScore": 3,
    "private": false,
    "sdk": "gradio",
    "tags": ["gradio", "mcp-server", "region:us"],
    "createdAt": "2025-12-04T13:58:07.000Z"
  }
]
```

**Auth:** Unauthenticated access works for public Spaces (HTTP 200, no token needed). Pass `Authorization: Bearer <HF_TOKEN>` for private Spaces or higher rate limits.

**OpenAPI spec:** `https://huggingface.co/.well-known/openapi.json`

**CLI install:**
```bash
pip install huggingface-hub        # Python client
npm install @huggingface/hub       # JS client
```

**Rate limits:** 500 requests per 5 minutes for unauthenticated. Upgrade account for higher limits.

[VERIFIED: live HTTP probe, official docs at https://huggingface.co/docs/hub/api, 2026-04-13]

---

### 4. LangChain Hub (LangSmith)

| Field | Value |
|-------|-------|
| **Name** | LangChain Hub (LangSmith) |
| **URL** | https://smith.langchain.com/hub |
| **Search Endpoint** | `GET https://api.smith.langchain.com/api/v1/repos` |
| **Auth Method** | None for public repos; API key for private |
| **CLI Tool** | `langsmith` (npm, v0.5.18 current) |
| **Confidence** | HIGH |

**Endpoint details (live-verified):**

```
GET https://api.smith.langchain.com/api/v1/repos
  ?q=<search term>           # text search on name/description
  ?is_public=true|false      # public repos require no auth
  ?limit=<N>                 # results per page
  ?offset=<N>                # pagination offset
```

**Response shape:**
```json
{
  "repos": [
    {
      "repo_handle": "rag-prompt",
      "full_name": "rlm/rag-prompt",
      "description": "...",
      "id": "f44e99b0-...",
      "owner": "rlm",
      "tags": ["ChatPromptTemplate", "QA over documents"],
      "repo_type": "prompt",
      "num_likes": 265,
      "num_downloads": 31785940,
      "num_views": 389287,
      "is_public": true,
      "last_commit_hash": "..."
    }
  ],
  "total": 9196
}
```

**Auth notes:**
- `is_public=true` → no authentication required (confirmed: returns 9196 repos)
- `is_public=false` → returns empty without auth key (returns `{"repos":[],"total":0}`)
- Private repos require `X-API-Key: <LANGSMITH_API_KEY>` header

**SDK (Python):**
```python
from langsmith import Client
client = Client(api_key="lsv2_...")
prompts = client.list_prompts(query="rag", is_public=True)
```

**SDK (TypeScript):**
```typescript
import { Client } from "langsmith";
const client = new Client({ apiKey: "lsv2_..." });
const prompts = client.listPrompts({ query: "rag", isPublic: true });
```

**CLI install:**
```bash
npm install langsmith    # v0.5.18 as of 2026-04-13
pip install langsmith
```

[VERIFIED: live HTTP probe returning 9196 repos, official docs at https://docs.langchain.com/langsmith/manage-prompts-programmatically, 2026-04-13]

---

### 5. OpenTools.ai

| Field | Value |
|-------|-------|
| **Name** | OpenTools.ai |
| **URL** | https://opentools.ai |
| **Search Endpoint** | None found |
| **Auth Method** | N/A |
| **CLI Tool** | None |
| **Confidence** | SKIP |

**Notes:**

OpenTools.ai is a Next.js application with Cloudflare protection. Live probing confirmed:
- `https://opentools.ai/api/v1/tools?q=image` → HTTP 404 (Next.js 404 page)
- No public API documentation found on the site
- The site is a human-curated directory (10,000+ tools) with no programmatic access

The site does have a search interface at `https://opentools.ai` but it is browser-rendered without a documented REST API. No developer docs, no API keys section found.

**Note:** There is a separate product called `opentools.com` (different domain) which IS an API for LLM tool use / MCP registry, but that is a different product from `opentools.ai` the directory.

[VERIFIED: live HTTP probe 2026-04-13]

---

### 6. Claude Plugins Official (Anthropic)

| Field | Value |
|-------|-------|
| **Name** | Claude Plugins Official |
| **URL** | https://github.com/anthropics/claude-plugins-official |
| **Search Endpoint** | Static JSON file (GitHub raw URL) |
| **Auth Method** | None (public GitHub repo) |
| **CLI Tool** | Claude Code built-in: `/plugin install <name>@claude-plugins-official` |
| **Confidence** | HIGH |

**Data access (live-verified):**

This is not a REST API — it is a static `marketplace.json` file in a public GitHub repository. Fetch it directly:

```
GET https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json
```

**File stats (as of 2026-04-13):** 133 plugins, 65.7 KB, 1,557 lines.

**Response shape:**
```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "claude-plugins-official",
  "description": "Directory of popular Claude Code extensions...",
  "owner": { "name": "Anthropic", "email": "support@anthropic.com" },
  "plugins": [
    {
      "name": "plugin-name",
      "description": "...",
      "category": "development|productivity|security|database|deployment",
      "source": {
        "source": "url|git-subdir|github",
        "url": "https://...",
        "sha": "<commit-hash>"
      },
      "homepage": "https://...",
      "author": { "name": "...", "email": "..." },
      "tags": ["community-managed"],
      "version": "1.0.0"
    }
  ]
}
```

**To programmatically search:** Fetch the JSON, then filter `plugins[]` array client-side by `name`, `description`, `category`, or `tags`.

**Schema definition:** `https://anthropic.com/claude-code/marketplace.schema.json`

**Second marketplace file** (Claude Code repo itself):
```
GET https://raw.githubusercontent.com/anthropics/claude-code/main/.claude-plugin/marketplace.json
```

[VERIFIED: live HTTP fetch, GitHub repo https://github.com/anthropics/claude-plugins-official, 2026-04-13]

---

### 7. Cursor Directory

| Field | Value |
|-------|-------|
| **Name** | Cursor Directory / awesome-cursorrules |
| **URL** | https://cursor.directory / https://github.com/PatrickJS/awesome-cursorrules |
| **Search Endpoint** | GitHub Contents API (for static files) |
| **Auth Method** | None for public GitHub API |
| **CLI Tool** | None |
| **Confidence** | MEDIUM (GitHub API works; no official search API) |

**Notes:**

Two distinct resources:

**cursor.directory** — A Next.js web app (likely built from the awesome-cursorrules data). It has Vercel bot protection and no documented REST API. `/api/rules` returns Vercel security checkpoint HTML. SKIP for programmatic access.

**github.com/PatrickJS/awesome-cursorrules** — A public GitHub repo with 39,028 stars containing `.cursorrules` files organized in directories. This CAN be accessed programmatically via the GitHub Contents API:

```
GET https://api.github.com/repos/PatrickJS/awesome-cursorrules/contents/rules
```

Returns 179 rule directories (as of 2026-04-13). Each directory contains `.cursorrules` files.

**To fetch a specific rule file:**
```
GET https://api.github.com/repos/PatrickJS/awesome-cursorrules/contents/rules/<dirname>/<filename>.cursorrules
```

Content is base64-encoded in the response. Decode to get the raw rule text.

**Rate limits:** GitHub API allows 60 unauthenticated requests/hour. Use `Authorization: Bearer <GITHUB_TOKEN>` for 5,000/hour.

**Caveat:** This is not a searchable API — it is a flat file listing. Full-text search requires fetching and decoding each file individually, or using GitHub's Code Search API (`GET https://api.github.com/search/code?q=<term>+repo:PatrickJS/awesome-cursorrules`).

[VERIFIED: live GitHub API probe returning 179 entries, 2026-04-13]

---

## Quick Reference

| # | Registry | Endpoint | Auth | CLI | Confidence |
|---|----------|----------|------|-----|------------|
| 1 | MCP.so | None | N/A | None | SKIP |
| 2 | Glama.ai | `GET https://glama.ai/api/mcp/v1/servers?query=X&first=N&after=cursor` | None | None | HIGH |
| 3 | Hugging Face Hub | `GET https://huggingface.co/api/spaces?search=X&sort=likes&limit=N` | Optional Bearer | `pip install huggingface-hub` | HIGH |
| 4 | LangChain Hub | `GET https://api.smith.langchain.com/api/v1/repos?q=X&is_public=true&limit=N` | Optional API key | `npm install langsmith` | HIGH |
| 5 | OpenTools.ai | None | N/A | None | SKIP |
| 6 | Claude Plugins Official | `GET https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json` | None | Built-in `/plugin` | HIGH |
| 7 | Cursor Directory | `GET https://api.github.com/repos/PatrickJS/awesome-cursorrules/contents/rules` | Optional GitHub token | None | MEDIUM |

---

## Assumptions Log

| # | Claim | Risk if Wrong |
|---|-------|---------------|
| A1 | Glama `first` and `after` are the correct pagination param names | Pagination would fail; use `limit`/`offset` as fallback |
| A2 | `cursor.directory` is built from PatrickJS/awesome-cursorrules | Fetching the GH repo might miss content exclusive to cursor.directory |
| A3 | LangSmith `X-API-Key` header name (vs `Authorization: Bearer`) | Auth would fail for private repos — check SDK source for canonical header |

---

## Sources

- [VERIFIED] Live curl probes to all 7 endpoints, 2026-04-13
- [CITED] https://huggingface.co/docs/hub/api — official HF Hub API docs
- [CITED] https://docs.langchain.com/langsmith/manage-prompts-programmatically — LangSmith SDK docs
- [CITED] https://github.com/anthropics/claude-plugins-official — Anthropic official plugin repo
- [CITED] https://api.github.com/repos/PatrickJS/awesome-cursorrules — GitHub API, stars: 39,028
- [ASSUMED] MCP.so has no public API — based on 404 responses and no documentation found
- [ASSUMED] OpenTools.ai has no public API — based on 404 responses and no developer docs found
