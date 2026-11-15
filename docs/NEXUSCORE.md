# NexusCore Architecture

NexusCore is a unified AI intelligence platform built on top of the existing
WormGPT desktop client. It integrates the already available capabilities into
a modular intelligence layer rather than a collection of disconnected features.

## Core modules

- `core/ai` — model orchestration, provider registry, routing, runtime.
- `core/agents` — planning and multi-step task execution.
- `core/memory` — short/long-term memory and embeddings.
- `core/knowledge` — document ingestion, chunking, retrieval.
- `core/tools` — unified tool execution with permissions and confirmation.
- `core/research` — web research and SSRF-safe fetching.
- `core/learning` — evals, improvement proposals, versioning.
- `core/nexus` — universal intelligence engine, skill registry, intent
  classification, and skill routing.

## NexusCore layer (`core/nexus`)

- `intent.js` — extensible intent classifier. Returns intent, confidence,
  scores, and recommended skills. Supports optional LLM refinement.
- `skill-registry.js` — persistent registry of capabilities and learned skills.
  Bootstraps core capabilities and markdown skills from `skills/`.
- `router.js` — selects enabled skills for a given request.
- `engine.js` — `processRequest` orchestrates intent classification, skill
  routing, memory/knowledge retrieval, and model invocation.

## IPC

NexusCore exposes `nexus:*` IPC handlers and preload entries:
`nexusBootstrap`, `nexusIntent`, `nexusRoute`, `nexusSkills`, `nexusProcess`.

## Testing

Run `npm test`. All 64+ tests must pass. The live local-AI test auto-selects
an installed Ollama model when the configured default is unavailable.