# WormGPT → Local-First AI Platform — Architecture

## 1. Existing Architecture (as of inspection)

**Stack:** Electron 40 (main = Node.js cjs), React 18 renderer bundled with esbuild
to `app/renderer/bundle.js` (minified + obfuscated), plain CSS, no TypeScript, no test
framework (two ad-hoc Node scripts), single JSON file persistence.

**Data flow:**
```
Renderer (App.jsx state) → window.wormgpt.* (preload contextBridge)
→ ipcMain handlers (app/main/ipc.js) → core/* modules → HTTP (fetch / node-fetch)
Storage: %APPDATA%\wormgpt\wormgpt-data.json via core/storage.js
```

**Existing modules:**
- `core/groq.js` — generic OpenAI-compatible chat client (`chat/completions`, SSE
  streaming, `models` list, Ollama `/api/tags` + `/api/pull`). Already supports local
  endpoints without an API key. Not actually Groq-specific despite the name.
- `core/crypto.js` — AES-256-CBC encrypt/decrypt for stored API keys (deterministic
  seed — keys are obfuscation-grade, not secret-grade; noted as a limitation).
- `core/storage.js` — JSON load/save with legacy-file migration.
- `core/trim.js` — message trimming / system-first ordering.
- `core/prompts.js` — the fixed "WormGPT persona" system prompt.
- `core/skills.js` — 2,124 bundled skills with search/get/categories/stats.
- `core/agent-config.js` — agent operating modes, permission booleans, authorized +
  trusted directories, confirmation policy, max audit entries.
- `core/agent-permissions.js` — action→permission mapping, allowlist path checks,
  confirmation requirement computation.
- `core/agent-audit.js` — redacted audit log entries.
- `core/agent-tools.js` — in-memory tool registry (registerTool/listTools/getTool).
- IPC in `app/main/ipc.js` — chat send/stream/stop, ollama list/pull, provider
  load/save/test/revoke, key save/test/revoke, profiles, agent load/save/permission
  check/audit/tools, chat/UI persistence, skills CRUD. Static canned answers for
  identity/legal/reverse-engineering queries.
- Renderer components: TitleBar, Sidebar, Settings (provider presets: groq,
  openrouter, openai, together, ollama, custom), AgentPanel (config only), SkillsPanel
  (browse/pin/@mention), Chat/Message/Input/Markdown, theme.js.

**What runs locally today:** Ollama chat/list/pull, arbitrary local OpenAI-compatible
endpoints, skills, chat + UI persistence, agent permission *configuration* (no tool
execution), audit log.

**Gaps vs. project target:** No provider abstraction (logic is one generic client +
hardcoded Groq default), no Anthropic/Gemini native clients, no memory, no RAG/vector
search, no model manager (only Ollama list/pull), no web research, no tool executor, no
agent engine, no evaluation/learning, no modes/offline/privacy/system dashboard.

**Security baseline already present:** contextIsolation, nodeIntegration off, strict CSP
(`default-src 'self'`), external-link opener denial, GPU failure fallback flag, key
reclamation from stray `api.txt`, audit redaction.

**Key weaknesses to fix (without breaking data):**
1. Hard-coded Groq identity/defaults in several places.
2. No SSRF protection for user-entered base URLs (matters once web research exists).
3. Fixed-seed key encryption (kept, documented).
4. Everything is in one JSON file (kept for phase 1–9; schema-versioned migrations
   added so no user data is destroyed).
5. Large renderer bundle + no tests.

## 2. Target Architecture

```
Desktop UI (React renderer)
        │  window.wormgpt.* (preload)
        ▼
ipcMain handlers
        │
        ▼
LOCAL AI CORE (core/ai/*)            EXTERNAL PROVIDERS (optional)
├── Runtime (modes: local/hybrid/     ├── openai-compatible (many vendors)
│    privacy/offline; online probe)   ├── anthropic
├── Provider Registry (enable/test/   ├── gemini
│    default + fallbacks)             ├── ollama (local backend)
├── Router (task type → provider;     └── OLLAMA treated as a backend, not the
│    offline/privacy/cost/hardware)        identity of the product
├── Hardware Detector
├── Model Manager (list/download/
│    remove/recommend/monitor)
│
Memory (core/memory/*)                short-term | long-term | episodic | semantic | procedural
Knowledge (core/knowledge/*)          ingest → chunk → embed (local) → vector store → RAG
Research (core/research/*)            search → safe fetch → extract → sanitize → validate → store
Tools (core/tools/*)                  permission-gated executor + sysinfo/files/search/calc…
Agents (core/agents/*)                plan → step → tool call → finish (state, retries)
Learning (core/learning/*)            evaluate → proposal → test → versioned apply → rollback
System (core/system/*)                config, structured logging (redacted), audit
Store (core/db/*)                     versioned JSON store + migrations (no data loss)
```

**Provider protocol (unified):**
```js
{
  id, kind ('local'|'cloud'), label,
  requiresKey, baseUrl, model,
  async chat(config, messages, opts) -> { content, usage, latencyMs }
  async stream(config, messages, opts) // onChunk callback
  async models()  -> [string]
  async test()    -> { ok, latencyMs, message }
}
```
Providers are data-driven from the registry; **no business logic hard-codes Groq**.
The registry stores per-provider: enabled, apiKey (encrypted), baseUrl, model, and a
resolve order. Routing is consultative; the user can override it.

**Data model additions (namespace under the existing single JSON file, versioned):**
`versions`, `ai.memory`, `ai.knowledge`, `ai.models`, `ai.research`, `ai.learning`,
`ai.permissions`, `ai.modes`, `ai.providers`, plus existing keys untouched.

**Execution order:** phases 1→12 from the project brief; each phase keeps the app
buildable and runnable. Fidelity rule: no mock UI — every panel talks to a real
subsystem, and anything unimplemented is hidden, not faked.

## 3. Commands

- Build + run: `npm run start` (builds renderer then launches Electron)
- Tests: `node --test tests/`
- Syntax: `node --check` on each core file; build+smoke test via a temp Electron script