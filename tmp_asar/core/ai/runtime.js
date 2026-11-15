"use strict";

const registry = require("./registry");
const routing = require("./routing");
const { isAbortError } = require("./provider-interface");

const DEFAULT_MODES = Object.freeze({
  mode: "hybrid", // local | hybrid | research | privacy | developer | offline
  privacy: false,
  offline: false,
  internet: true,
  webResearch: true,
  externalApi: true,
  developer: false
});

let onlineCache = { value: null, at: 0 };
const ONLINE_CACHE_MS = 10000;

function loadModes(data) {
  const saved = data && data.ai && data.ai.modes && typeof data.ai.modes === "object"
    ? data.ai.modes
    : {};
  return {
    ...DEFAULT_MODES,
    ...saved
  };
}

function saveModes(data, input) {
  data.ai = data.ai && typeof data.ai === "object" ? data.ai : {};
  data.ai.modes = {
    ...DEFAULT_MODES,
    ...data.ai.modes,
    ...(input && typeof input === "object" ? input : {})
  };
  return data.ai.modes;
}

function policyFor(modes, overrides = {}) {
  const privacy = overrides.privacy !== undefined ? overrides.privacy : (modes.privacy === true || modes.mode === "privacy");
  const offline = overrides.offline !== undefined ? overrides.offline : (modes.offline === true || modes.mode === "offline" || (modes.mode === "local" && false));
  const external = overrides.externalApi !== undefined
    ? overrides.externalApi
    : (modes.externalApi === true && modes.mode !== "privacy");
  return {
    privacy,
    offline,
    externalApi: external,
    exclude: new Set(external ? [] : ["groq", "openai", "openrouter", "together", "anthropic", "gemini"])
  };
}

function providerResolvers(data, crypto) {
  const ids = Object.keys(registry.DEFAULT_PROVIDERS);
  const resolvers = [];
  for (const id of ids) {
    const provider = registry.getProvider(id, data, crypto);
    if (provider) resolvers.push(provider);
  }
  return resolvers;
}

function providerConfig(provider, overrides) {
  const config = {
    baseUrl: overrides && overrides.baseUrl ? overrides.baseUrl : provider.baseUrl,
    model: overrides && overrides.model ? overrides.model : provider.model,
    apiKey: provider.apiKey,
    temperature: overrides && overrides.temperature !== undefined ? overrides.temperature : undefined,
    maxTokens: overrides && overrides.maxTokens !== undefined ? overrides.maxTokens : undefined,
    signal: overrides && overrides.signal ? overrides.signal : undefined
  };
  if (provider.flavor === "anthropic") config.anthropicBeta = overrides && overrides.anthropicBeta;
  return config;
}

async function resolveChain(data, crypto, opts = {}) {
  const modes = loadModes(data);
  const policy = policyFor(modes, opts);
  const routingData = registry.getRouting(data);
  const resolverList = providerResolvers(data, crypto);
  const { task, ordered } = routing.rank(routingData, resolverList, opts.text || "", policy);
  const candidateMap = new Map(resolverList.map(item => [item.id, item]));
  return {
    task,
    policy,
    chain: ordered.map(id => candidateMap.get(id)).filter(Boolean)
  };
}

function describeNoProvider(chain, errors, policy) {
  if (policy.privacy) {
    return "Privacy Mode is on: only local providers are allowed, and none are available. Enable a local model (e.g. Ollama) or turn off Privacy Mode to continue.";
  }
  if (policy.offline) {
    return "Offline mode: no local model is reachable. Start a local inference server (Ollama, llama.cpp, LM Studio) and make sure a model is installed.";
  }
  if (errors.length > 0) {
    return `All configured providers failed. Last error: ${errors[errors.length - 1].message}`;
  }
  return "No provider is available. Configure a local model (Ollama is recommended) or add an API key for a cloud provider in Settings.";
}

const HTTP_STATUS_HELP = new Map([
  [401, "Authentication failed — check the API key."],
  [403, "Access denied — the key may lack permission for this model."],
  [429, "Rate limited — try again shortly."]
]);

/**
 * Executes chat with fallback across the resolved provider chain.
 * Returns a response object { content, providerId, providerLabel, latencyMs, usage, task }.
 * Calls opts.onProvider (when the active provider changes) and opts.onFinish.
 */
async function chatWithFallback(data, crypto, messages, opts = {}) {
  const text = opts.userText || "";
  const { task, policy, chain } = await resolveChain(data, crypto, { text, ...(opts.policy || {}) });
  const errors = [];

  if (chain.length === 0) {
    throw new Error(describeNoProvider([], errors, policy));
  }

  for (let i = 0; i < chain.length; i += 1) {
    const provider = chain[i];
    if (opts.onProvider) opts.onProvider({ providerId: provider.id, label: provider.label, task });
    try {
      // Auto-select an installed model when the configured one is missing
      // (common with Ollama where the default preset model isn't pulled).
      let modelOverride = opts && opts.model ? opts.model : null;
      if (!modelOverride && provider && typeof provider.impl.models === "function") {
        try {
          const installed = await provider.impl.models(providerConfig(provider, {}));
          if (Array.isArray(installed) && installed.length > 0) {
            if (!provider.model || !installed.includes(provider.model)) {
              modelOverride = installed[0];
            }
          }
        } catch (err) {
          // Ignore model discovery failures and fall back to configured model.
        }
      }
      const config = providerConfig(provider, modelOverride ? { ...opts, model: modelOverride } : opts);
      const stream = opts.stream === true && typeof provider.impl.stream === "function";
      const result = stream
        ? await provider.impl.stream(config, messages, {
            signal: opts.signal,
            onChunk: opts.onChunk,
            onMeta: opts.onMeta
          })
        : await provider.impl.chat(config, messages, { signal: opts.signal });
      if (opts.onFinish) opts.onFinish({ providerId: provider.id, ok: true, latencyMs: result.latencyMs });
      return {
        ...result,
        providerId: provider.id,
        providerLabel: provider.label,
        providerKind: provider.kind,
        task
      };
    } catch (err) {
      if (isAbortError(err)) throw err;
      const status = err && err.status;
      let message = err && err.message ? err.message : String(err);
      if (status && HTTP_STATUS_HELP.has(status)) message = `${HTTP_STATUS_HELP.get(status)} (${message})`;
      errors.push({ providerId: provider.id, label: provider.label, message });
      if (opts.onFinish) opts.onFinish({ providerId: provider.id, ok: false, error: message });
    }
  }

  const error = new Error(describeNoProvider(chain, errors, policy));
  error.codes = errors;
  throw error;
}

async function testProvider(data, crypto, id, input = {}) {
  const provider = registry.getProvider(id, data, crypto);
  if (!provider) return { ok: false, message: `Unknown provider: ${id}` };
  const config = providerConfig(provider, input);
  try {
    const result = await provider.impl.test(config);
    return { ...result, providerId: provider.id };
  } catch (err) {
    if (isAbortError(err)) throw err;
    return { ok: false, status: 0, message: err && err.message ? err.message : String(err) };
  }
}

async function listModels(data, crypto, id) {
  const provider = registry.getProvider(id, data, crypto);
  if (!provider) return [];
  return provider.impl.models(providerConfig(provider, {}));
}

/**
 * Online probe. Only runs when privacy is off and internet is enabled.
 * Uses a fast HEAD against a lightweight public endpoint. Results cached briefly.
 */
async function probeOnline(data, force = false) {
  const modes = loadModes(data);
  if (modes.privacy || modes.mode === "privacy") return { online: false, reason: "privacy" };
  if (modes.internet === false || modes.mode === "offline") return { online: false, reason: "disabled" };
  if (!force && onlineCache.value !== null && Date.now() - onlineCache.at < ONLINE_CACHE_MS) {
    return { online: onlineCache.value, latencyMs: onlineCache.latencyMs };
  }
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    const online = res.status >= 200 && res.status < 500;
    onlineCache = { value: online, at: Date.now(), latencyMs };
    return { online, latencyMs };
  } catch (err) {
    onlineCache = { value: false, at: Date.now(), latencyMs: Date.now() - started };
    return { online: false, latencyMs: Date.now() - started, error: err && err.message ? err.message : String(err) };
  }
}

function currentStatus(data, crypto) {
  const modes = loadModes(data);
  const providers = providerResolvers(data, crypto).map(item => ({
    id: item.id,
    label: item.label,
    kind: item.kind,
    enabled: item.enabled,
    hasKey: Boolean(item.apiKey),
    requiresKey: item.requiresKey,
    defaultModel: item.model
  }));
  return {
    modes,
    providers
  };
}

module.exports = {
  DEFAULT_MODES,
  loadModes,
  saveModes,
  policyFor,
  providerResolvers,
  resolveChain,
  chatWithFallback,
  testProvider,
  listModels,
  probeOnline,
  currentStatus,
  providerConfig
};