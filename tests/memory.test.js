"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const memory = require("../core/memory/store");
const embeddings = require("../core/memory/embeddings");

function freshData() {
  return { ai: {} };
}

test("embeddings: similar texts score higher than unrelated texts", () => {
  const a = embeddings.toVector(embeddings.termsFrom("vector search over local documents"));
  const b = embeddings.toVector(embeddings.termsFrom("vector search ranking documents privately"));
  const c = embeddings.toVector(embeddings.termsFrom("baking a chocolate cake for birthdays"));
  assert.ok(embeddings.cosine(a, b) > embeddings.cosine(a, c));
  assert.ok(embeddings.cosine(a, b) > 0.05);
});

test("memory: add, list, archive, search roundtrip", () => {
  const data = freshData();
  memory.addMemory(data, { layer: "long", text: "User prefers dark mode interfaces", source: "user" });
  memory.addMemory(data, { layer: "knowledge", text: "The local RAG pipeline uses chunking at 400 words", source: "conversation" });
  memory.addMemory(data, { layer: "procedural", text: "When debugging, enable verbose logging first", source: "user" });

  const all = memory.list(data, {});
  assert.equal(all.length, 3);

  const search = memory.search(data, "how does the rag pipeline chunk documents", { k: 3 });
  assert.ok(search.results.length > 0);
  assert.ok(search.results.some(item => item.id === all.find(x => x.text.includes("RAG pipeline")).id), "turns up the RAG memory");

  const stats = memory.stats(data);
  assert.equal(stats.total, 3);
  assert.deepEqual(stats.layers.long, 1);
});

test("memory: harvest produces pending candidates, never auto-permanent", () => {
  const data = freshData();
  const { created } = memory.harvestConversation(data, {
    conversationId: "c1",
    messages: [
      { role: "user", content: "Explain the moon landing date" },
      { role: "assistant", content: "July 20, 1969." }
    ],
    reply: "July 20, 1969."
  });
  assert.ok(created.length >= 1);
  const pending = memory.list(data, { status: "pending" });
  assert.equal(pending.length, created.length);
  assert.equal(memory.countActive(data), 0);
  // approve one and it becomes active + versioned
  const approved = memory.approve(data, created[0].id);
  assert.equal(approved.status, "active");
  assert.equal(memory.countActive(data), 1);
});

test("memory: update bumps version and keeps history", () => {
  const data = freshData();
  const item = memory.addMemory(data, { layer: "long", text: "v1 fact", source: "user" });
  const updated = memory.update(data, item.id, { text: "v2 fact", reason: "correction" });
  assert.equal(updated.version, 2);
  assert.equal(updated.text, "v2 fact");
  assert.equal(updated.history.length, 1);
});

test("memory: delete removes and archive hides from search", () => {
  const data = freshData();
  const item = memory.addMemory(data, { layer: "long", text: "temporary secret", source: "user" });
  assert.ok(memory.removeHard(data, item.id));
  assert.equal(memory.list(data, {}).length, 0);

  const item2 = memory.addMemory(data, { layer: "long", text: "another fact", source: "user" });
  memory.archive(data, item2.id);
  assert.equal(memory.search(data, "another fact", {}).results.length, 0);
  assert.equal(memory.list(data, { status: "archived" }).length, 1);
});

test("memory: clear wipes a layer and rejects unknown layers", () => {
  const data = freshData();
  memory.addMemory(data, { layer: "knowledge", text: "doc1 summary", source: "import" });
  memory.addMemory(data, { layer: "knowledge", text: "doc2 summary", source: "import" });
  const { removed } = memory.clear(data, "knowledge");
  assert.equal(removed, 2);
  assert.throws(() => memory.clear(data, "nope"), /Unknown memory layer/);
});

test("WorkingMemory short-term is session scoped", () => {
  const wm = new memory.WorkingMemory();
  wm.remember("t1", { role: "user", content: "hi" });
  wm.remember("t1", { role: "assistant", content: "hello" });
  assert.equal(wm.recent("t1").length, 2);
  wm.clear("t1");
  assert.equal(wm.recent("t1").length, 0);
});