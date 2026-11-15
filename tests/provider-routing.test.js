"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const routing = require("../core/ai/routing");
const registry = require("../core/ai/registry");
const { normalizeBaseUrl, isLocalEndpoint, pickSystem, isAbortError } = require("../core/ai/provider-interface");

test("normalizeBaseUrl strips trailing slashes", () => {
  assert.equal(normalizeBaseUrl("http://x/v1///"), "http://x/v1");
  assert.equal(normalizeBaseUrl("", "http://a/b"), "http://a/b");
});

test("isLocalEndpoint recognizes loopback and .local", () => {
  assert.ok(isLocalEndpoint("http://localhost:11434/v1"));
  assert.ok(isLocalEndpoint("http://127.0.0.1:8080"));
  assert.ok(isLocalEndpoint("http://[::1]:11434"));
  assert.ok(isLocalEndpoint("http://myhost.local"));
  assert.ok(!isLocalEndpoint("https://api.groq.com/openai/v1"));
});

test("pickSystem separates system messages", () => {
  const { system, rest } = pickSystem([
    { role: "system", content: "A" },
    { role: "user", content: "hi" },
    { role: "assistant", content: "yo" },
    { role: "system", content: "B" }
  ]);
  assert.equal(system, "A\n\nB");
  assert.equal(rest.length, 2);
  assert.equal(rest[0].role, "user");
});

test("classifyTask detects research, coding and privacy", () => {
  assert.equal(routing.classifyTask("what is the news today"), "research");
  assert.equal(routing.classifyTask("debug my typescript function"), "coding");
  assert.equal(routing.classifyTask("keep my notes private"), "private");
  assert.equal(routing.classifyTask("explain quantum mechanics"), "chat");
});

test("rank excludes cloud providers in privacy mode", () => {
  const providers = [
    { id: "ollama", kind: "local", requiresKey: false, apiKey: "", enabled: true, baseUrl: "http://localhost:11434" },
    { id: "groq", kind: "cloud", requiresKey: true, apiKey: "sk-x", enabled: true, baseUrl: "https://api.groq.com" },
    { id: "openai", kind: "cloud", requiresKey: true, apiKey: "", enabled: true, baseUrl: "https://api.openai.com" }
  ];
  const data = { routing: registry.DEFAULT_ROUTING };
  const { ordered } = routing.rank(data, providers, "hello", { privacy: true });
  assert.deepEqual(ordered, ["ollama"]);
  const normal = routing.rank(data, providers, "hello", {});
  assert.ok(normal.ordered.includes("groq"));
});

test("rank skips providers without keys", () => {
  const providers = [
    { id: "groq", kind: "cloud", requiresKey: true, apiKey: "", enabled: true, baseUrl: "x" },
    { id: "openai", kind: "cloud", requiresKey: true, apiKey: "sk", enabled: true, baseUrl: "y" }
  ];
  const data = { routing: { default: ["groq", "openai"], tasks: {}, override: {} } };
  const { ordered } = routing.rank(data, providers, "hi", {});
  assert.deepEqual(ordered, ["openai"]);
});

test("registry providers have effective configs and legacy key mirror", () => {
  const fakeCrypto = {
    encrypt: value => `enc:${value}`,
    decrypt: value => typeof value === "string" && value.startsWith("enc:") ? value.slice(4) : value
  };
  const data = {
    ai: {
      providers: {
        ollama: { baseUrl: "http://localhost:11434", enabled: true },
        groq: { apiKey: "enc:legacykey" }
      }
    },
    apiKey: "enc:singlegroqkey"
  };
  const ollama = registry.getProvider("ollama", data, fakeCrypto);
  assert.equal(ollama.kind, "local");
  assert.equal(ollama.enabled, true);
  assert.equal(ollama.impl.id, "ollama");
  const groq = registry.getProvider("groq", data, fakeCrypto);
  assert.equal(groq.apiKey, "legacykey");

  const list = registry.listProviders(data, fakeCrypto);
  assert.ok(list.some(item => item.id === "ollama" && item.kind === "local"));
});

test("saveProvider stores an encrypted key without exposing it", () => {
  const fakeCrypto = {
    encrypt: value => `enc:${Buffer.from(String(value)).toString("base64")}`,
    decrypt: value => Buffer.from(String(value).replace(/^enc:/, ""), "base64").toString()
  };
  const data = { ai: {} };
  registry.saveProvider(data, { id: "anthropic", apiKey: "secret-token", model: "claude" }, fakeCrypto);
  assert.match(data.ai.providers.anthropic.apiKey, /^enc:/);
  assert.equal(fakeCrypto.decrypt(data.ai.providers.anthropic.apiKey), "secret-token");
  assert.ok(!JSON.stringify(data.ai.providers).includes("secret-token"));
});

test("runtime policy handles privacy and offline", () => {
  const runtime = require("../core/ai/runtime");
  const privacy = runtime.policyFor({ mode: "hybrid", privacy: true });
  assert.equal(privacy.privacy, true);
  const offline = runtime.policyFor({ mode: "offline" });
  assert.equal(offline.offline, true);
});