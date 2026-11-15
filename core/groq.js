"use strict";

// Backward-compatibility shim. All real logic moved behind the provider
// abstraction in core/ai/*; this module keeps old call sites working.

const openaiCompatible = require("./ai/openai-compatible");
const ollama = require("./ai/ollama");
const { normalizeBaseUrl } = require("./ai/provider-interface");

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

async function request(config = {}, messages, signal) {
  const result = await openaiCompatible.chat(
    {
      baseUrl: normalizeBaseUrl(config.baseUrl, DEFAULT_BASE_URL),
      model: config.model || DEFAULT_MODEL,
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens
    },
    messages,
    { signal }
  );
  return result.content;
}

async function streamRequest(config = {}, messages, onChunk, signal) {
  const result = await openaiCompatible.stream(
    {
      baseUrl: normalizeBaseUrl(config.baseUrl, DEFAULT_BASE_URL),
      model: config.model || DEFAULT_MODEL,
      apiKey: config.apiKey,
      temperature: config.temperature,
      maxTokens: config.maxTokens
    },
    messages,
    { signal, onChunk }
  );
  return result.content;
}

async function testProvider(config) {
  return openaiCompatible.test({
    baseUrl: normalizeBaseUrl(config.baseUrl, DEFAULT_BASE_URL),
    model: config.model,
    apiKey: config.apiKey,
    temperature: config.temperature,
    maxTokens: config.maxTokens
  });
}

async function listOllamaModels(baseUrl) {
  return ollama.models({ baseUrl });
}

async function pullOllamaModel(model, baseUrl, onProgress) {
  return ollama.pull({ baseUrl }, model, onProgress);
}

async function askGroq(messages, apiKey) {
  return request({ apiKey, baseUrl: process.env.GROQ_BASE_URL || DEFAULT_BASE_URL, model: process.env.GROQ_MODEL || DEFAULT_MODEL }, messages);
}

async function testGroqKey(apiKey) {
  return testProvider({ apiKey, baseUrl: process.env.GROQ_BASE_URL || DEFAULT_BASE_URL });
}

module.exports = {
  askGroq,
  testGroqKey,
  request,
  streamRequest,
  testProvider,
  listOllamaModels,
  pullOllamaModel
};