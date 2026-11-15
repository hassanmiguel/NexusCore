"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const tools = require("../core/tools/index");

function freshContext(data = { ai: {} }) {
  let saved = data;
  return {
    data,
    saveData: () => { saved = data; }
  };
}

test("tools: registry lists tools with schemas", () => {
  const list = tools.listTools();
  const names = list.map(tool => tool.name);
  assert.ok(names.includes("system_info"));
  assert.ok(names.includes("calculator"));
  assert.ok(names.includes("read_file"));
  assert.ok(names.includes("write_file"));
  assert.ok(names.includes("remember"));
  assert.ok(names.includes("memory_search"));
  assert.ok(names.includes("knowledge_search"));
  assert.ok(names.includes("heretic_decensor"));

  const calculator = list.find(tool => tool.name === "calculator");
  assert.ok(calculator.permission === "info");
  assert.equal(calculator.confirm, false);
});

test("tools: calculator evaluates arithmetic and rejects script injection", async () => {
  const ctx = freshContext();
  const ok = await tools.execute("calculator", { expression: "(2 + 3) * 4" }, ctx);
  assert.equal(ok.ok, true);
  assert.equal(ok.result, 20);

  const bad = await tools.execute("calculator", { expression: "process.exit(1)" }, ctx);
  assert.equal(bad.ok, false);
  assert.ok(bad.error);

  const bad2 = await tools.execute("calculator", { expression: "(2); require('fs')" }, ctx);
  assert.equal(bad2.ok, false);
});

test("tools: system_info returns no side effects metadata", async () => {
  const ctx = freshContext();
  const result = await tools.execute("system_info", {}, ctx);
  assert.equal(result.ok, true);
  assert.ok(result.result.cpus >= 1);
  assert.ok(result.result.ramGB > 0);
  assert.ok(result.result.os.length > 0);
});

test("tools: write_file requires confirmation first", async () => {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const target = path.join(os.tmpdir(), "wormgpt-tool-test.txt");
  const ctx = freshContext();
  const unconfirmed = await tools.execute("write_file", { file: target, content: "hi" }, ctx);
  assert.equal(unconfirmed.ok, false);
  assert.equal(unconfirmed.needsConfirm, true);

  const confirmed = await tools.execute(
    "write_file",
    { file: target, content: "hi" },
    { ...ctx, confirmed: true }
  );
  assert.equal(confirmed.ok, true);
  assert.ok(confirmed.result.bytes === 2);
  // write_file without allowance still sandboxed
  const blocked = await tools.execute(
    "write_file",
    { file: "C:\\tmp\\wormgpt-nope.txt", content: "x" },
    { ...ctx, confirmed: true }
  );
  assert.equal(blocked.ok, false);
  fs.unlinkSync(target);
});

test("tools: read_file blocks paths outside the sandbox", async () => {
  const ctx = freshContext();
  const blocked = await tools.execute("read_file", { file: "Z:\\impossible\\path\\win.ini" }, ctx);
  assert.equal(blocked.ok, false);
  assert.ok(/sandbox/i.test(blocked.error));
});

test("tools: remember saves into long-term memory with confirmation", async () => {
  const data = { ai: {} };
  const ctx = freshContext(data);
  const unconfirmed = await tools.execute("remember", { text: "User likes dark mode" }, ctx);
  assert.equal(unconfirmed.needsConfirm, true);

  const confirmed = await tools.execute("remember", { text: "User likes dark mode" }, { ...ctx, confirmed: true });
  assert.equal(confirmed.ok, true);

  const memory = require("../core/memory/store");
  const saved = memory.list(data, { layer: "long" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].text, "User likes dark mode");
  assert.equal(saved[0].status, "active");
});

test("tools: memory_search and knowledge_search work through context", async () => {
  const data = { ai: {} };
  const memory = require("../core/memory/store");
  const knowledge = require("../core/knowledge/index");
  memory.addMemory(data, { layer: "long", text: "The project uses local Ollama models", source: "user" });
  knowledge.ingestText(data, "Vector search ranks chunks by similarity.", { name: "rag" });

  const ctx = freshContext(data);
  const memSearch = await tools.execute("memory_search", { query: "ollama models" }, ctx);
  assert.equal(memSearch.ok, true);
  assert.ok(memSearch.result.length > 0);

  const kbSearch = await tools.execute("knowledge_search", { query: "chunk similarity ranking" }, ctx);
  assert.equal(kbSearch.ok, true);
  assert.ok(kbSearch.result.length > 0);
});

test("tools: unknown tool returns error", async () => {
  const ctx = freshContext();
  const result = await tools.execute("nope_tool", {}, ctx);
  assert.equal(result.ok, false);
  assert.ok(/Unknown tool/.test(result.error));
});

test("tools: heretic_decensor requires Heretic CLI and confirmation", async () => {
  const ctx = freshContext();
  // Should fail without confirmation
  const unconfirmed = await tools.execute("heretic_decensor", { model: "Qwen/Qwen3-4B-Instruct-2507" }, ctx);
  assert.equal(unconfirmed.ok, false);
  assert.equal(unconfirmed.needsConfirm, true);
  
  // With confirmation but no Heretic installed - should fail with proper error
  const confirmed = await tools.execute("heretic_decensor", { model: "Qwen/Qwen3-4B-Instruct-2507" }, { ...ctx, confirmed: true });
  assert.equal(confirmed.ok, false);
  assert.ok(/Heretic CLI not found/.test(confirmed.error));
});