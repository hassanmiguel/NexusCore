"use strict";

const fetch = globalThis.fetch
  ? globalThis.fetch.bind(globalThis)
  : (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const {
  normalizeBaseUrl,
  isAbortError,
  describeFailure,
  pickSystem,
  measureLatency
} = require("./provider-interface");

const id = "anthropic";
const flavor = "anthropic";
const kind = "cloud";
const label = "Anthropic";
const requiresKey = true;
const baseUrl = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-3-5-haiku-latest";
const API_VERSION = "2023-06-01";

function headersFor(config) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey || "",
    "anthropic-version": API_VERSION
  };
  if (config.anthropicBeta) headers["anthropic-beta"] = config.anthropicBeta;
  return headers;
}

function bodyFor(config, messages, extra = {}) {
  const { system, rest } = pickSystem(messages);
  return {
    model: config.model,
    max_tokens: config.maxTokens || 4096,
    temperature: config.temperature !== undefined ? config.temperature : 0.5,
    system: system || undefined,
    messages: rest,
    ...extra
  };
}

async function chat(config, messages, opts = {}) {
  const provider = {
    baseUrl: normalizeBaseUrl(config.baseUrl, baseUrl),
    model: String(config.model || DEFAULT_MODEL).trim(),
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : "",
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    anthropicBeta: config.anthropicBeta
  };
  if (!provider.apiKey) throw new Error(`${label}: API key is required`);
  const started = Date.now();
  const url = new URL("v1/messages", `${provider.baseUrl}/`).toString();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: headersFor(provider),
      signal: opts.signal,
      body: JSON.stringify(bodyFor(provider, messages))
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(describeFailure(err, label, provider.baseUrl));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && data.error && (data.error.message || data.error.type);
    throw new Error(detail || `API error (${res.status})`);
  }
  const parts = Array.isArray(data?.content) ? data.content : [];
  const content = parts.map(part => part && part.type === "text" ? part.text : "").join("");
  if (!content && parts.length > 0) {
    // Non-text blocks (tool_use etc.) produce an empty textual answer.
    throw new Error(`${label}: no text content in response`);
  }
  return {
    content,
    usage: data && data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: Number(data.usage.input_tokens || 0) + Number(data.usage.output_tokens || 0)
        }
      : null,
    latencyMs: measureLatency(started),
    model: provider.model
  };
}

async function stream(config, messages, opts = {}) {
  const provider = {
    baseUrl: normalizeBaseUrl(config.baseUrl, baseUrl),
    model: String(config.model || DEFAULT_MODEL).trim(),
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : "",
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    anthropicBeta: config.anthropicBeta
  };
  if (!provider.apiKey) throw new Error(`${label}: API key is required`);
  const started = Date.now();
  const url = new URL("v1/messages", `${provider.baseUrl}/`).toString();
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
    const detail = data && data.error && (data.error.message || data.error.type);
    throw new Error(detail || `API error (${res.status})`);
  }
  if (!res.body) return { content: "", usage: null, latencyMs: measureLatency(started), model: provider.model };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let pendingEvent = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        pendingEvent = line.slice("event:".length).trim();
        continue;
      }
      if (!line.startsWith("data:")) continue;
      const raw = line.slice("data:".length).trim();
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (data.type === "content_block_delta" && data.delta && data.delta.type === "text_delta") {
          const piece = data.delta.text || "";
          if (piece) {
            full += piece;
            if (opts.onChunk) opts.onChunk(piece);
          }
        }
      } catch (err) {
        // Ignore incomplete stream records.
      }
    }
    if (done) break;
  }
  return { content: full, usage: null, latencyMs: measureLatency(started), model: provider.model };
}

async function models(config) {
  const provider = {
    baseUrl: normalizeBaseUrl(config.baseUrl, baseUrl),
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : ""
  };
  try {
    const res = await fetch(new URL("v1/models", `${provider.baseUrl}/`).toString(), {
      headers: { "x-api-key": provider.apiKey, "anthropic-version": API_VERSION },
      signal: config.signal
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return [];
    return Array.isArray(data?.data) ? data.data.map(item => item.id).filter(Boolean).sort() : [];
  } catch (err) {
    if (isAbortError(err)) throw err;
    return [];
  }
}

async function test(config) {
  const provider = {
    baseUrl: normalizeBaseUrl(config.baseUrl, baseUrl),
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : ""
  };
  const started = Date.now();
  try {
    const res = await fetch(new URL("v1/models", `${provider.baseUrl}/`).toString(), {
      headers: { "x-api-key": provider.apiKey, "anthropic-version": API_VERSION },
      signal: config.signal
    });
    const latencyMs = measureLatency(started);
    if (!res.ok) {
      return { ok: false, status: res.status, latencyMs, message: `${label} error (${res.status})` };
    }
    return { ok: true, status: res.status, latencyMs };
  } catch (err) {
    if (isAbortError(err)) throw err;
    return { ok: false, status: 0, latencyMs: measureLatency(started), message: describeFailure(err, label, provider.baseUrl) };
  }
}

module.exports = {
  id,
  flavor,
  kind,
  label,
  requiresKey,
  baseUrl,
  chat,
  stream,
  models,
  test
};