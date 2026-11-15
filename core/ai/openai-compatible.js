"use strict";

const fetch = globalThis.fetch
  ? globalThis.fetch.bind(globalThis)
  : (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const {
  normalizeBaseUrl,
  isLocalEndpoint,
  isAbortError,
  describeFailure,
  measureLatency
} = require("./provider-interface");

const id = "openai-compatible";
const flavor = "openai-compatible";
const kind = "cloud";
const label = "OpenAI-compatible";
const requiresKey = true;
const baseUrl = "";

function buildChatUrl(config) {
  const clean = normalizeBaseUrl(config.baseUrl);
  return new URL("chat/completions", `${clean}/`).toString();
}

function buildModelsUrl(config) {
  const clean = normalizeBaseUrl(config.baseUrl);
  return new URL("models", `${clean}/`).toString();
}

function getConfig(config = {}) {
  return {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    model: String(config.model || "").trim(),
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : "",
    temperature: Number.isFinite(config.temperature) ? config.temperature : undefined,
    maxTokens: Number.isFinite(config.maxTokens) ? config.maxTokens : undefined
  };
}

function bodyFor(config, messages, extra = {}) {
  return {
    model: config.model,
    messages,
    temperature: config.temperature,
    ...(config.maxTokens ? { max_tokens: config.maxTokens } : {}),
    ...extra
  };
}

function headersFor(config) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}

function extractContent(data) {
  return data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : null;
}

function extractUsage(data) {
  if (data && data.usage) {
    return {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens
    };
  }
  return null;
}

async function request(config, messages, extra = {}) {
  const provider = getConfig(config);
  if (!provider.baseUrl) throw new Error("baseUrl is required");
  if (!provider.model) throw new Error("model is required");
  const url = buildChatUrl(provider);
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: headersFor(provider),
      signal: extra.signal,
      body: JSON.stringify(bodyFor(provider, messages, extra.body || {}))
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(describeFailure(err, label, provider.baseUrl));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && data.error && data.error.message;
    throw new Error(detail || `API error (${res.status})`);
  }
  const content = extractContent(data);
  if (!content) throw new Error("API returned no content");
  return { content, usage: extractUsage(data), latencyMs: measureLatency(started), model: provider.model };
}

async function stream(config, messages, opts = {}) {
  const provider = getConfig(config);
  if (!provider.baseUrl) throw new Error("baseUrl is required");
  if (!provider.model) throw new Error("model is required");
  const url = buildChatUrl(provider);
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: headersFor(provider),
      signal: opts.signal,
      body: JSON.stringify(bodyFor(provider, messages, { stream: true }))
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(describeFailure(err, label, provider.baseUrl));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error((data && data.error && data.error.message) || `API error (${res.status})`);
  }
  if (!res.body) return { content: "", usage: null, latencyMs: measureLatency(started), model: provider.model };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const raw = line.replace(/^data:\s*/, "").trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const data = JSON.parse(raw);
        const piece = data.choices?.[0]?.delta?.content || data.message?.content || "";
        if (piece) {
          full += piece;
          if (opts.onChunk) opts.onChunk(piece);
        }
        if (data.usage && opts.onMeta) opts.onMeta(extractUsage(data));
      } catch (err) {
        // Ignore incomplete stream records.
      }
    }
    if (done) break;
  }
  return { content: full, usage: null, latencyMs: measureLatency(started), model: provider.model };
}

async function models(config) {
  const provider = { baseUrl: normalizeBaseUrl(config.baseUrl), apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : "" };
  if (!provider.baseUrl) return [];
  try {
    const res = await fetch(buildModelsUrl(provider), {
      headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
      signal: config.signal
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`API error (${res.status})`);
    if (Array.isArray(data?.data)) {
      return data.data.map(item => (typeof item === "string" ? item : item.id)).filter(Boolean).sort();
    }
    return [];
  } catch (err) {
    if (isAbortError(err)) throw err;
    return [];
  }
}

async function test(config) {
  const provider = getConfig(config);
  const started = Date.now();
  let res;
  try {
    res = await fetch(buildModelsUrl(provider), {
      headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
      signal: config.signal
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    return { ok: false, status: 0, latencyMs: measureLatency(started), message: describeFailure(err, label, provider.baseUrl) };
  }
  const latencyMs = measureLatency(started);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail = data && data.error && data.error.message;
    return { ok: false, status: res.status, latencyMs, message: detail || `API error (${res.status})` };
  }
  return { ok: true, status: res.status, latencyMs };
}

module.exports = {
  id,
  flavor,
  kind,
  label,
  requiresKey,
  baseUrl,
  chat: request,
  stream,
  models,
  test,
  _internal: { isLocalEndpoint }
};