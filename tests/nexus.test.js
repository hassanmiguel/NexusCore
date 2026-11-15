"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const intent = require("../core/nexus/intent");
const skillRegistry = require("../core/nexus/skill-registry");
const router = require("../core/nexus/router");
const engine = require("../core/nexus/engine");

function freshData() { return { ai: {} }; }

const crypto = {
  encrypt: v => "enc:" + Buffer.from(String(v)).toString("base64"),
  decrypt: v => Buffer.from(String(v).replace(/^enc:/, ""), "base64").toString()
};

test("intent: greeting classified", () => {
  const r = intent.classifyIntent("Hello Nexus");
  assert.equal(r.intent, "greeting");
  assert.ok(r.skills.includes("conversation"));
});

test("intent: coding classified", () => {
  const r = intent.classifyIntent("Write a Python program that creates a calculator");
  assert.equal(r.intent, "coding");
  assert.ok(r.skills.includes("coding"));
});

test("intent: image generation classified", () => {
  const r = intent.classifyIntent("Generate an image of a futuristic cyberdeck");
  assert.equal(r.intent, "image_generation");
  assert.ok(r.skills.includes("image_generation"));
});

test("intent: website classified", () => {
  const r = intent.classifyIntent("Build me a website");
  assert.equal(r.intent, "website");
});

test("skill-registry: bootstrap capabilities", () => {
  const data = freshData();
  engine.bootstrap(data);
  const stats = skillRegistry.stats(data);
  assert.ok(stats.total > 5);
  const caps = skillRegistry.listSkills(data, { enabledOnly: true });
  assert.ok(caps.some(s => s.id === "capability:coding"));
});

test("skill-registry: register/enable/disable", () => {
  const data = freshData();
  const skill = skillRegistry.registerSkill(data, { id: "x", name: "X", description: "test", activation: ["coding"] });
  assert.equal(skill.id, "x");
  assert.equal(skillRegistry.getSkill(data, "x").enabled, true);
  skillRegistry.enableSkill(data, "x", false);
  assert.equal(skillRegistry.getSkill(data, "x").enabled, false);
  assert.ok(skillRegistry.removeSkill(data, "x"));
  assert.equal(skillRegistry.getSkill(data, "x"), null);
});

test("router: selects skills", () => {
  const data = freshData();
  engine.bootstrap(data);
  const r = router.route(data, "Write a Python calculator");
  assert.equal(r.intent, "coding");
  assert.ok(Array.isArray(r.skills));
  assert.ok(r.skills.length > 0);
});

test("engine: processRequest with stub runtime", async () => {
  const data = freshData();
  engine.bootstrap(data);
  const stubRuntime = {
    async chatWithFallback() {
      return { content: "Hello from Nexus", providerId: "ollama", providerLabel: "Ollama" };
    }
  };
  const result = await engine.processRequest(data, crypto, "Hello Nexus", { runtime: stubRuntime });
  assert.equal(result.ok, true);
  assert.equal(result.intent, "greeting");
  assert.equal(result.reply, "Hello from Nexus");
  assert.ok(result.skills.length >= 0);
});
