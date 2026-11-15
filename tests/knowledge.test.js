"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const chunker = require("../core/knowledge/chunker");
const knowledge = require("../core/knowledge/index");

function freshData() {
  return { ai: {} };
}

test("chunker: text produces non-empty chunks with correct structure", () => {
  const chunks = chunker.chunkText(
    "Alpha beta gamma delta. Epsilon zeta eta theta. Iota kappa lambda mu.",
    { chunkSize: 4, overlap: 1, docId: "d1" }
  );
  assert.ok(chunks.length >= 2);
  chunks.forEach(chunk => {
    assert.equal(chunk.docId, "d1");
    assert.ok(typeof chunk.content === "string");
    assert.ok(chunk.wordCount > 0);
  });
});

test("chunker: HTML extraction strips tags", () => {
  const fs = require("fs");
  const tmpFile = require("path").join(require("os").tmpdir(), "test_chunker.html");
  fs.writeFileSync(tmpFile, "<html><body><h1>Test</h1><p>Hello world.</p></body></html>");
  const result = chunker.extractFile(tmpFile);
  assert.ok(result.includes("Hello world"));
  assert.ok(!result.includes("<p>"));
  fs.unlinkSync(tmpFile);
});

test("knowledge: ingestText + search roundtrip", () => {
  const data = freshData();
  const result = knowledge.ingestText(
    data,
    "The local AI uses Ollama for inference. It supports qwen3.6 and llama3.2 models.",
    { name: "ai_overview" }
  );
  assert.ok(result.chunkCount >= 1);
  assert.ok(result.docId);

  const search = knowledge.search(data, "what model does the local ai use", { k: 3 });
  assert.ok(search.results.length > 0, "search returns results");
  assert.ok(search.results[0].docId === result.docId);
  assert.ok(search.results[0].docName === "ai_overview");
  assert.ok(search.results[0].text.includes("Ollama"));
});

test("knowledge: listDocuments + stats + remove", () => {
  const data = freshData();
  knowledge.ingestText(data, "Document one content about memory systems.", { name: "doc1" });
  knowledge.ingestText(data, "Document two content about RAG pipelines.", { name: "doc2" });
  knowledge.ingestText(data, "Document three content about tools and agents.", { name: "doc3" });

  const docs = knowledge.listDocuments(data);
  assert.equal(docs.length, 3);
  assert.ok(docs.every(d => d.chunkCount >= 1));

  const stats = knowledge.stats(data);
  assert.equal(stats.docCount, 3);
  assert.ok(stats.chunkCount >= 3);
  assert.ok(stats.extensions.includes(".txt"));

  const removed = knowledge.removeDocument(data, docs[1].id);
  assert.ok(removed);
  assert.equal(knowledge.listDocuments(data).length, 2);
});

test("knowledge: search is empty for empty query", () => {
  const data = freshData();
  knowledge.ingestText(data, "Some content.", { name: "test" });
  const search = knowledge.search(data, "", {});
  assert.equal(search.results.length, 0);
});

test("knowledge: unsupported file type throws", () => {
  const data = freshData();
  assert.throws(
    () => knowledge.ingestFile(data, "/tmp/image.png"),
    /Unsupported file/
  );
});