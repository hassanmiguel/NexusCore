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

const id = "gemini";
const flavor = "gemini";
const kind = "cloud";
const label = "Gemini";
const requiresKey = true;
const baseUrl = "https://generativelanguage.googleapis.com";
const DEFAULT_MODEL = "gemini-1.5-flash";

function partsFor(messages) {
  const { system, rest } = pickSystem(messages);
  const contents = rest.map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
  return { system, contents };
}

function generationConfig(config) {
  const out = {};
  if (config.temperature !== undefined) out.temperature = config.temperature;
  if (config.maxTokens) out.maxOutputTokens = config.maxTokens;
  return out;
}

function combineTextFromCandidates(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  let text = "";
  for (const candidate of candidates) {
    const parts = candidate && candidate.content && Array.isArray(candidate.content.parts)
      ? candidate.content.parts
      : [];
    text += parts.map(part => (part && typeof part.text === "string" ? part.text : "")).join("");
  }
  if (!text && data?.error) throw new Error(data.error.message || "Gemini error");
  return text;
}

async function chat(config, messages, opts = {}) {
  const provider = {
    baseUrl: normalizeBaseUrl(config.baseUrl, baseUrl),
    model: String(config.model || DEFAULT_MODEL).trim(),
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : ""
  };
  if (!provider.apiKey) throw new Error(`${label}: API key is required`);
  const { system, contents } = partsFor(messages);
  const started = Date.now();
  const url = `${provider.baseUrl}/v1beta/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
  const body = { contents, generationConfig: generationConfig(config) };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify(body)
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(describeFailure(err, label, provider.baseUrl));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && data.error && data.error.message;
    throw new Error(detail || `Gemini error (${res.status})`);
  }
  const content = combineTextFromCandidates(data);
  if (!content) throw new Error("Gemini returned no content");
  return { content, usage: null, latencyMs: measureLatency(started), model: provider.model };
}

async function stream(config, messages, opts = {}) {
  const provider = {
    baseUrl: normalizeBaseUrl(config.baseUrl, baseUrl),
    model: String(config.model || DEFAULT_MODEL).trim(),
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : ""
  };
  if (!provider.apiKey) throw new Error(`${label}: API key is required`);
  const { system, contents } = partsFor(messages);
  const started = Date.now();
  const url = `${provider.baseUrl}/v1beta/models/${encodeURIComponent(provider.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(provider.apiKey)}`;
  const body = { contents, generationConfig: generationConfig(config) };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify(body)
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(describeFailure(err, label, provider.baseUrl));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail = data && data.error && data.error.message;
    throw new Error(detail || `Gemini error (${res.status})`);
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
      if (!raw) continue;
      try {
        const chunk = JSON.parse(raw);
        // Streamed chunks in gemini: data: {candidates:[{content:{parts:[{text}]}}]}
        const candidates = Array.isArray(chunk?.candidates) ? chunk.candidates : [];
        for (const candidate of candidates) {
          const parts = candidate && candidate.content && Array.isArray(candidate.content.parts)
            ? candidate.content.parts
            : [];
          for (const part of parts) {
            const piece = part && typeof part.text === "string" ? part.text : "";
            if (piece) {
              full += piece;
              if (opts.onChunk) opts.onChunk(piece);
            }
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
    const url = `${provider.baseUrl}/v1beta/models?key=${encodeURIComponent(provider.apiKey)}`;
    const res = await fetch(url, { signal: config.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) return [];
    return Array.isArray(data?.models)
      ? data.models
          .filter(item => Array.isArray(item.supportedGenerationMethods) && item.supportedGenerationMethods.includes("generateContent"))
          .map(item => item.name.replace(/^models\//, ""))
          .sort()
      : [];
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
    const url = `${provider.baseUrl}/v1beta/models?key=${encodeURIComponent(provider.apiKey)}`;
    const res = await fetch(url, { signal: config.signal });
    const latencyMs = measureLatency(started);
    if (!res.ok) return { ok: false, status: res.status, latencyMs, message: `${label} error (${res.status})` };
    return { ok: true, status: res.status, latencyMs };
  } catch (err) {
    if (isAbortError(err)) throw err;
    return { ok: false, status: 0, latencyMs: measureLatency(started), message: describeFailure(err, label, provider.baseUrl) };
  }
}

async function generateImage(config, prompt, opts = {}) {
  const provider = {
    baseUrl: normalizeBaseUrl(config.baseUrl, baseUrl),
    model: String(config.model || "gemini-3-pro-image-preview").trim(),
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : ""
  };
  if (!provider.apiKey) throw new Error(`${label}: API key is required`);
  const url = `${provider.baseUrl}/v1beta/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: String(prompt || "") }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      ...(opts.aspectRatio || opts.size
        ? { imageConfig: { aspectRatio: opts.aspectRatio || "1:1", imageSize: opts.size || "1K" } }
        : {})
    }
  };
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: opts.signal,
      body: JSON.stringify(body)
    });
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new Error(describeFailure(err, label, provider.baseUrl));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && data.error && data.error.message;
    throw new Error(detail || `Gemini error (${res.status})`);
  }
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  let text = "";
  let imageBase64 = null;
  let mimeType = "image/png";
  for (const candidate of candidates) {
    const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (part && typeof part.text === "string") text += part.text;
      if (part && part.inlineData && typeof part.inlineData.data === "string") {
        imageBase64 = part.inlineData.data;
        if (part.inlineData.mimeType) mimeType = part.inlineData.mimeType;
      }
    }
  }
  if (!imageBase64) throw new Error("Gemini returned no image");
  return { imageBase64, mimeType, text, model: provider.model, latencyMs: measureLatency(started) };
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
  test,
  generateImage
};