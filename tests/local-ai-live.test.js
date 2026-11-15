"use strict";

// Live verification: the provider abstraction must chat through local Ollama
// with no API key, list models, and route correctly in privacy/offline mode.

const runtime = require("../core/ai/runtime");
const registry = require("../core/ai/registry");
const assert = require("node:assert/strict");

const fakeCrypto = {
  encrypt: value => `enc:${Buffer.from(String(value)).toString("base64")}`,
  decrypt: value => Buffer.from(String(value).replace(/^enc:/, ""), "base64").toString()
};

(async () => {
  const data = { ai: {} };

  const list = registry.listProviders(data, fakeCrypto);
  const ollamaEntry = list.find(item => item.id === "ollama");
  assert.ok(ollamaEntry && ollamaEntry.kind === "local", "ollama preset must exist and be local");

  const models = await runtime.listModels(data, fakeCrypto, "ollama");
  console.log("ollama models:", models.join(", "));
  assert.ok(Array.isArray(models) && models.length > 0, "Ollama must report installed models");

  const result = await runtime.chatWithFallback(data, fakeCrypto, [
    { role: "system", content: "You are a helpful assistant. Reply in one short sentence." },
    { role: "user", content: "Say hello and state your model name if you know it." }
  ], { stream: false, userText: "Say hello" });
  console.log(`provider used: ${result.providerLabel} (${result.providerId}) | ${result.content}`);
  assert.equal(result.providerId, "ollama", "default routing should pick local ollama when no keys exist");
  assert.ok(result.content.length > 0);

  // privacy mode must exclude cloud
  const policy = runtime.policyFor({ mode: "hybrid", privacy: true });
  assert.equal(policy.privacy, true);
  const chain = await runtime.resolveChain(data, fakeCrypto, { text: "hi" });
  assert.ok(chain.chain.every(p => p.kind === "local"), "privacy chain must be local only");

  // offline probe without forced privacy
  const online = await runtime.probeOnline(data);
  console.log("online:", JSON.stringify(online));

  console.log("LOCAL AI LIVE OK");
})().catch(err => { console.error("LOCAL AI FAILED:", err.message); process.exit(1); });