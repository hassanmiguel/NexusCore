"use strict";

const openaiCompatible = require("./openai-compatible");
const anthropic = require("./anthropic");
const gemini = require("./gemini");
const ollama = require("./ollama");

const IMPLEMENTATIONS = {
  "openai-compatible": openaiCompatible,
  anthropic,
  gemini,
  ollama
};

const DEFAULT_PROVIDERS = Object.freeze({
  local: {
    id: "local",
    flavor: "openai-compatible",
    kind: "local",
    label: "Local (OpenAI-compatible)",
    requiresKey: false,
    baseUrl: "http://127.0.0.1:8080/v1",
    model: ""
  },
  ollama: {
    id: "ollama",
    flavor: "ollama",
    kind: "local",
    label: "Ollama",
    requiresKey: false,
    baseUrl: ollama.baseUrl,
    model: "llama3.2"
  },
  groq: {
    id: "groq",
    flavor: "openai-compatible",
    kind: "cloud",
    label: "Groq",
    requiresKey: true,
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile"
  },
  openai: {
    id: "openai",
    flavor: "openai-compatible",
    kind: "cloud",
    label: "OpenAI",
    requiresKey: true,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini"
  },
  openrouter: {
    id: "openrouter",
    flavor: "openai-compatible",
    kind: "cloud",
    label: "OpenRouter",
    requiresKey: true,
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-oss-20b:free"
  },
  together: {
    id: "together",
    flavor: "openai-compatible",
    kind: "cloud",
    label: "Together AI",
    requiresKey: true,
    baseUrl: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo"
  },
  anthropic: {
    id: "anthropic",
    flavor: "anthropic",
    kind: "cloud",
    label: "Anthropic",
    requiresKey: true,
    baseUrl: anthropic.baseUrl,
    model: "claude-3-5-haiku-latest"
  },
  gemini: {
    id: "gemini",
    flavor: "gemini",
    kind: "cloud",
    label: "Gemini",
    requiresKey: true,
    baseUrl: gemini.baseUrl,
    model: "gemini-1.5-flash"
  },
  custom: {
    id: "custom",
    flavor: "openai-compatible",
    kind: "local",
    label: "Custom endpoint",
    requiresKey: false,
    baseUrl: "",
    model: ""
  }
});

const DEFAULT_ROUTING = Object.freeze({
  default: ["ollama", "groq", "openai", "openrouter", "together", "anthropic", "gemini", "custom", "local"],
  tasks: {
    chat: ["ollama", "groq", "openai", "openrouter", "together", "anthropic", "gemini", "custom", "local"],
    coding: ["ollama", "groq", "openrouter"],
    research: ["ollama", "groq", "openai", "openrouter"],
    private: ["ollama", "local", "custom"],
    reasoning: ["ollama", "groq", "anthropic"]
  },
  override: {}
});

function clonePreset(id) {
  const preset = DEFAULT_PROVIDERS[id];
  return preset ? { ...preset } : null;
}

function providerStore(data) {
  const root = data && data.ai && typeof data.ai === "object" ? data.ai : {};
  return root.providers && typeof root.providers === "object" ? root.providers : {};
}

function routingStore(data) {
  const root = data && data.ai && typeof data.ai === "object" ? data.ai : {};
  return root.routing && typeof root.routing === "object" ? root.routing : {};
}

function normalizeProviderInput(id, stored, data) {
  const preset = clonePreset(id);
  const merged = preset ? { ...preset } : {};

  if (stored && typeof stored === "object") {
    merged.baseUrl = typeof stored.baseUrl === "string" && stored.baseUrl.trim()
      ? stored.baseUrl.trim()
      : merged.baseUrl;
    merged.model = typeof stored.model === "string" && stored.model.trim()
      ? stored.model.trim()
      : merged.model;
    merged.enabled = typeof stored.enabled === "boolean" ? stored.enabled : true;
    if (typeof stored.apiKey === "string" && stored.apiKey.trim()) merged.apiKey = stored.apiKey;
  }

  // Legacy: data.provider was the single active provider. Match by baseUrl.
  const legacy = data && data.provider && typeof data.provider === "object" ? data.provider : null;
  if (legacy && (!merged.apiKey || merged.apiKey === stored?.apiKey)) {
    const legacyBase = String(legacy.baseUrl || "").replace(/\/+$/, "");
    const presetBase = String(preset ? preset.baseUrl : "").replace(/\/+$/, "");
    if (preset && legacyBase === presetBase) {
      merged.model = typeof legacy.model === "string" && legacy.model.trim() ? legacy.model.trim() : merged.model;
      if (typeof legacy.apiKey === "string" && legacy.apiKey.trim()) merged.apiKey = legacy.apiKey;
    }
  }

  if (stored && stored.apiKey) merged.apiKey = stored.apiKey;

  // Legacy single-key storage (data.apiKey) applies to the Groq preset.
  if (id === "groq" && !merged.apiKey && data && typeof data.apiKey === "string" && data.apiKey.trim()) {
    merged.apiKey = data.apiKey;
  }

  return merged;
}

function decryptApiKey(encrypted, crypto) {
  if (!encrypted) return "";
  try {
    return crypto.decrypt(encrypted);
  } catch (err) {
    return "";
  }
}

function getProvider(id, data, crypto) {
  const preset = clonePreset(id);
  if (!preset) return null;
  const store = providerStore(data);
  const stored = store[id];
  const normalized = normalizeProviderInput(id, stored, data);
  const apiKey = decryptApiKey(normalized.apiKey, crypto);
  const impl = IMPLEMENTATIONS[normalized.flavor] || openaiCompatible;
  return {
    id: normalized.id,
    flavor: normalized.flavor,
    kind: normalized.kind,
    label: normalized.label,
    requiresKey: normalized.requiresKey,
    enabled: normalized.enabled !== false,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    apiKey,
    impl,
    meta: { enabled: normalized.enabled !== false, hasKey: Boolean(apiKey) }
  };
}

function listProviders(data, crypto) {
  return Object.keys(DEFAULT_PROVIDERS).map(id => {
    const provider = getProvider(id, data, crypto);
    return {
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      flavor: provider.flavor,
      requiresKey: provider.requiresKey,
      enabled: provider.enabled,
      hasKey: provider.apiKey.length > 0,
      baseUrl: provider.baseUrl,
      model: provider.model
    };
  });
}

function saveProvider(data, input, crypto) {
  const id = String(input && input.id ? input.id : "").trim();
  if (!DEFAULT_PROVIDERS[id]) throw new Error(`Unknown provider id: ${id}`);
  const store = providerStore(data);
  const current = store[id] && typeof store[id] === "object" ? store[id] : {};
  const next = {
    ...current,
    baseUrl: typeof input.baseUrl === "string" && input.baseUrl.trim() ? input.baseUrl.trim() : current.baseUrl,
    model: typeof input.model === "string" && input.model.trim() ? input.model.trim() : current.model
  };
  if (typeof input.enabled === "boolean") next.enabled = input.enabled;
  if (typeof input.apiKey === "string" && input.apiKey.trim()) next.apiKey = crypto.encrypt(input.apiKey.trim());
  else if (current.apiKey) next.apiKey = current.apiKey;
  data.ai = data.ai && typeof data.ai === "object" ? data.ai : {};
  data.ai.providers = { ...store, [id]: next };
  return next;
}

function saveRouting(data, input) {
  const routing = routingStore(data);
  const next = { ...routing };
  if (Array.isArray(input.default)) next.default = input.default;
  if (input.tasks && typeof input.tasks === "object") next.tasks = { ...input.tasks };
  if (input.override && typeof input.override === "object") next.override = { ...input.override };
  data.ai = data.ai && typeof data.ai === "object" ? data.ai : {};
  data.ai.routing = next;
  return next;
}

function getRouting(data) {
  const stored = routingStore(data);
  const merged = { default: DEFAULT_ROUTING.default, tasks: { ...DEFAULT_ROUTING.tasks }, override: {} };
  if (Array.isArray(stored.default)) merged.default = stored.default;
  if (stored.tasks && typeof stored.tasks === "object") merged.tasks = { ...DEFAULT_ROUTING.tasks, ...stored.tasks };
  if (stored.override && typeof stored.override === "object") merged.override = { ...stored.override };
  return merged;
}

/**
 * Resolves the config used by one provider. Falls back to legacy data.provider /
 * environment variables when the registry has no explicit entry, keeping old saved
 * sessions working.
 */
function resolveConfigForProvider(id, data, crypto) {
  const provider = getProvider(id, data, crypto);
  return provider;
}

function envOverrides(provider) {
  // Legacy environment overrides preserved for compatibility.
  const flavor = provider.flavor;
  if (flavor === "openai-compatible") {
    const base = process.env.OPENAI_BASE_URL || process.env.GROQ_BASE_URL;
    const model = process.env.OPENAI_MODEL || process.env.GROQ_MODEL;
    const key = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    return { base, model, key };
  }
  return {};
}

module.exports = {
  DEFAULT_PROVIDERS,
  DEFAULT_ROUTING,
  IMPLEMENTATIONS,
  getProvider,
  listProviders,
  saveProvider,
  saveRouting,
  getRouting,
  routingStore,
  envOverrides,
  providerStore
};