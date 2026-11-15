"use strict";

// Model Manager: discovers installed models across providers, downloads and
// removes local models, and recommends models based on detected hardware.

const registry = require("./ai/registry");
const ollama = require("./ai/ollama");
const hardware = require("./ai/hardware");

const RECOMMENDATIONS = Object.freeze({
  high: {
    tier: "high",
    summary: "Powerful machine: you can run large models comfortably.",
    models: [
      { name: "qwen3:32b", size: "~19 GB", bestFor: "reasoning & general", requiresVramGB: 24 },
      { name: "codellama:34b", size: "~19 GB", bestFor: "coding", requiresVramGB: 24 },
      { name: "qwen3:8b", size: "~5 GB", bestFor: "fast general use", requiresVramGB: 8 }
    ],
    defaultChat: "qwen3:8b",
    defaultCoding: "codellama:34b"
  },
  medium: {
    tier: "medium",
    summary: "Mid-range hardware: run capable ~3–8B models comfortably.",
    models: [
      { name: "qwen3:8b", size: "~5 GB", bestFor: "general purpose", requiresVramGB: 8 },
      { name: "codellama:7b", size: "~3.8 GB", bestFor: "coding", requiresVramGB: 6 },
      { name: "llama3.2:3b", size: "~2 GB", bestFor: "fast chat", requiresVramGB: 4 }
    ],
    defaultChat: "llama3.2:3b",
    defaultCoding: "codellama:7b"
  },
  low: {
    tier: "low",
    summary: "Modest hardware or no GPU: small models keep things responsive.",
    models: [
      { name: "llama3.2:3b", size: "~2 GB", bestFor: "default chat", requiresVramGB: 0 },
      { name: "phi3:mini", size: "~2.2 GB", bestFor: "fast small talk", requiresVramGB: 0 },
      { name: "qwen2.5:3b", size: "~1.9 GB", bestFor: "compact", requiresVramGB: 0 }
    ],
    defaultChat: "llama3.2:3b",
    defaultCoding: "qwen2.5:3b"
  }
});

async function listModelsByProvider(data, crypto, id, overrides = {}) {
  const provider = registry.getProvider(id, data, crypto);
  if (!provider) return [];
  const config = {
    baseUrl: overrides.baseUrl || provider.baseUrl,
    model: overrides.model || provider.model,
    apiKey: provider.apiKey,
    signal: overrides.signal
  };
  try {
    return await provider.impl.models(config);
  } catch (err) {
    return [];
  }
}

async function listLocalModels(data, crypto) {
  const results = {};
  for (const id of ["ollama", "local", "custom"]) {
    results[id] = await listModelsByProvider(data, crypto, id);
  }
  return results;
}

async function downloadModel(data, crypto, id, model) {
  const provider = registry.getProvider(id, data, crypto);
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  if (id === "ollama") {
    await ollama.pull({ baseUrl: provider.baseUrl }, model);
    return true;
  }
  throw new Error(`Model downloads are not supported for provider "${provider.label}"`);
}

async function removeModel(data, crypto, id, model) {
  const provider = registry.getProvider(id, data, crypto);
  if (!provider) throw new Error(`Unknown provider: ${id}`);
  if (id === "ollama" && typeof provider.impl.remove === "function") {
    await provider.impl.remove({ baseUrl: provider.baseUrl }, model);
    return true;
  }
  throw new Error(`Model removal is not supported for provider "${provider.label}"`);
}

async function recommend(data, crypto) {
  const detected = await hardware.detect();
  const tierRec = RECOMMENDATIONS[detected.tier];
  // Only suggest models that are not already installed.
  let installed = [];
  try {
    installed = await listModelsByProvider(data, crypto, "ollama");
  } catch (err) {
    installed = [];
  }
  const models = tierRec.models.map(rec => ({
    ...rec,
    installed: installed.includes(rec.name)
  }));
  return {
    hardware: detected,
    tier: tierRec.tier,
    summary: tierRec.summary,
    defaultChat: tierRec.defaultChat,
    defaultCoding: tierRec.defaultCoding,
    installed,
    models
  };
}

async function systemStatus(data, crypto) {
  const detected = await hardware.detect();
  const models = {};
  for (const id of ["ollama", "local", "custom"]) {
    models[id] = await listModelsByProvider(data, crypto, id);
  }
  return {
    hardware: detected,
    models
  };
}

module.exports = {
  RECOMMENDATIONS,
  listModelsByProvider,
  listLocalModels,
  downloadModel,
  removeModel,
  recommend,
  systemStatus
};