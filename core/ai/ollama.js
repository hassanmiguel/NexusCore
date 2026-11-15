"use strict";

const fetch = globalThis.fetch
  ? globalThis.fetch.bind(globalThis)
  : (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const {
  normalizeBaseUrl,
  isAbortError,
  describeFailure,
  measureLatency
} = require("./provider-interface");

const id = "ollama";
const flavor = "ollama";
const kind = "local";
const label = "Ollama";
const requiresKey = false;
const baseUrl = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";

function rootBase(value) {
  return String(value || baseUrl).replace(/\/v1\/?$/, "").replace(/\/+$/, "");
}

async function chat(config, messages, opts = {}) {
  const provider = { model: String(config.model || DEFAULT_MODEL).trim(), baseUrl: rootBase(config.baseUrl) };
  if (!provider.model) throw new Error(`${label}: model is required`);
  const started = Date.now();
  const url = `${provider.baseUrl}/api/chat`;
  const contentType = { "Content-Type": "application/json" };
  const body = {
    model: provider.model,
    messages,
    options: {}
  };
  if (config.temperature !== undefined) body.options.temperature = config.temperature;
  if (config.maxTokens) body.options.num_predict = config.maxTokens;

  if (opts && opts.onChunk) {
    body.stream = true;
    let res;
    try {
      res = await fetch(url, { method: "POST", headers: contentType, signal: opts.signal, body: JSON.stringify(body) });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new Error(describeFailure(err, label, provider.baseUrl));
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error((data && data.error) || `${label} error (${res.status})`);
    }
    if (!res.body) return { content: "", usage: null, latencyMs: measureLatency(started), model: provider.model };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let doneReason = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const update = JSON.parse(line);
          const piece = update && update.message && typeof update.message.content === "string" ? update.message.content : "";
          if (piece) {
            full += piece;
            opts.onChunk(piece);
          }
          if (update.done) doneReason = String(update.done_reason || "");
        } catch (err) {
          // Ignore incomplete records.
        }
      }
      if (done) break;
    }
    return { content: full, usage: null, latencyMs: measureLatency(started), model: provider.model, doneReason };
  }

  body.stream = false;
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: contentType, signal: opts.signal, body: JSON.stringify(body) });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(describeFailure(err, label, provider.baseUrl));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `${label} error (${res.status})`);
  const content = data && data.message && typeof data.message.content === "string" ? data.message.content : "";
  if (!content) throw new Error(`${label} returned no content`);
  return {
    content,
    usage: data && data.prompt_eval_count != null
      ? { promptTokens: data.prompt_eval_count, completionTokens: data.eval_count != null ? data.eval_count : 0, totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0) }
      : null,
    latencyMs: measureLatency(started),
    model: provider.model
  };
}

async function models(config = {}) {
  const base = rootBase(config.baseUrl);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: config.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${label} error (${res.status})`);
    return Array.isArray(data?.models) ? data.models.map(item => item.name).filter(Boolean).sort() : [];
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(describeFailure(err, label, base));
  }
}

async function pull(config, model, onProgress) {
  const base = rootBase(config.baseUrl);
  try {
    const res = await fetch(`${base}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: config.signal,
      body: JSON.stringify({ name: String(model || "").trim(), stream: true })
    });
    if (!res.ok) throw new Error(`${label} error (${res.status})`);
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const update = JSON.parse(line);
          if (onProgress) onProgress(update);
        } catch (err) {
          // Ignore incomplete records.
        }
      }
      if (done) break;
    }
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(describeFailure(err, label, base));
  }
}

async function remove(config, model) {
  const base = rootBase(config.baseUrl);
  try {
    const res = await fetch(`${base}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: String(model || "").trim() })
    });
    if (!res.ok) throw new Error(`${label} error (${res.status})`);
    return true;
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(describeFailure(err, label, base));
  }
}

async function test(config) {
  const started = Date.now();
  try {
    await models(config);
    return { ok: true, status: 200, latencyMs: measureLatency(started) };
  } catch (err) {
    if (isAbortError(err)) throw err;
    return { ok: false, status: 0, latencyMs: measureLatency(started), message: err && err.message ? err.message : String(err) };
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
  stream: chat,
  models,
  pull,
  remove,
  test
};