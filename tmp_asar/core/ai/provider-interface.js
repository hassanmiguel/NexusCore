"use strict";

const KINDS = Object.freeze({ LOCAL: "local", CLOUD: "cloud" });

const PROVIDER_CONTRACT = `
A provider module implements an identical interface so the AI core never cares
which vendor is behind it. The interface (all async unless noted):

  id          string   unique stable id (e.g. "ollama", "anthropic")
  flavor      string   implementation family (openai-compatible | anthropic | gemini | ollama)
  kind        'local' | 'cloud'
  label       string   human-readable name
  requiresKey boolean  true if this provider needs an API key for cloud use
  baseUrl     string   description/default base URL

  async chat(config, messages, opts)
    -> { content, usage?, model, providerId, latencyMs }
    config: { baseUrl, model, apiKey, temperature?, maxTokens? }
    opts:   { signal? }
    Returns the assistant text and, when the backend reports it, token usage.

  async stream(config, messages, opts)
    opts: { signal?, onChunk?(text), onMeta?(stats) }
    -> same shape as chat() with content being the full accumulated text.
    Must call opts.onChunk for every text delta.

  async models(config)
    config: { baseUrl, apiKey? } -> [string] list of installed/available models.

  async test(config)
    -> { ok, latencyMs, message?, status? }

Security rules for every provider implementation:
  - Never log or embed API keys.
  - Treat remote (non-local) responses as untrusted data.
  - Respect AbortSignal in opts.signal and surface abort errors as-is
    (err.name === 'AbortError') so the runtime can tell stop from failure.
`.trim();

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

function normalizeBaseUrl(value, fallback) {
  const raw = String(value || fallback || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function isLocalEndpoint(value) {
  const source = String(value || "").trim();
  if (!source) return false;
  try {
    const host = new URL(source).hostname.toLowerCase();
    if (LOCAL_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".lan")) {
      return true;
    }
  } catch (err) {
    // fall through to regex
  }
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)([:/]|$)/i.test(source);
}

function isAbortError(err) {
  return err && (err.name === "AbortError" || err.code === "ERR_ABORTED");
}

function describeFailure(err, providerLabel, baseUrl) {
  const detail = err && err.message ? err.message : String(err);
  if (isLocalEndpoint(baseUrl)) {
    return `${providerLabel} is not reachable at ${baseUrl}. Start the local server (for Ollama: "ollama serve") and make sure the model exists.`;
  }
  return `${providerLabel} request failed: ${detail}`;
}

function pickSystem(messages) {
  // Collect all system messages into one string; returns the rest of the list.
  const systems = [];
  const rest = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message.role !== "string") continue;
    if (message.role === "system" && typeof message.content === "string") {
      systems.push(message.content);
    } else if (typeof message.content === "string") {
      rest.push({ role: message.role === "assistant" ? "assistant" : "user", content: message.content });
    }
  }
  return { system: systems.join("\n\n"), rest };
}

function measureLatency(startTime) {
  return Math.max(0, Date.now() - startTime);
}

module.exports = {
  KINDS,
  PROVIDER_CONTRACT,
  normalizeBaseUrl,
  isLocalEndpoint,
  isAbortError,
  describeFailure,
  pickSystem,
  measureLatency
};