"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const evals = require("../core/learning/evals");
const improve = require("../core/learning/improve");
const versions = require("../core/learning/versions");

function freshData() {
  return { ai: {} };
}

test("evals: saveRecord + list + stats", () => {
  const data = freshData();
  const r1 = evals.saveRecord(data, { kind: "prompt", prompt: "Why? ", score: 0.9 });
  const r2 = evals.saveRecord(data, { kind: "prompt", prompt: "Why? ", score: 0.3 });
  evals.saveRecord(data, { kind: "agent", score: 0.2 });

  assert.ok(r1.id.startsWith("eval_"));
  assert.equal(evals.list(data, {}).length, 3);
  assert.equal(evals.list(data, { kind: "prompt" }).length, 2);

  const stats = evals.stats(data);
  assert.equal(stats.total, 3);
  assert.ok(stats.kinds.prompt === 2);
});

test("evals: averageScore ignores null scores", () => {
  const data = freshData();
  evals.saveRecord(data, { kind: "t", score: 1.0 });
  evals.saveRecord(data, { kind: "t", score: null });
  evals.saveRecord(data, { kind: "t", score: 0.5 });
  const result = evals.averageScore(data, { kind: "t" });
  assert.equal(result.count, 2);
  assert.equal(result.avg, 0.75);
});

test("improve: generates proposals from low-score eval history", () => {
  const data = freshData();
  for (let i = 0; i < 3; i += 1) {
    evals.saveRecord(data, { kind: "conversation", prompt: "help", score: 0.2 });
  }
  const created = improve.generateProposals(data);
  assert.ok(created.length >= 1);
  assert.ok(created.some(prop => prop.kind === "degraded_conversation"));
  assert.equal(improve.listProposals(data).length, created.length);
});

test("versions: snapshot + revert + diff works", () => {
  const data = freshData();
  const v1 = versions.snapshot(data, { label: "initial", sections: { routing: ["ollama"] } });
  const v2 = versions.snapshot(data, { label: "tuned", sections: { routing: ["groq", "ollama"] } });

  assert.equal(versions.listVersions(data).length, 2);
  assert.equal(versions.getActiveVersion(data).id, v2.id);

  const diff = versions.diffVersions(data, v1.id, v2.id);
  assert.ok(diff.changes.length === 1);

  const reverted = versions.revertVersion(data, v1.id);
  assert.equal(reverted.id, v1.id);
  assert.equal(versions.getActiveVersion(data).id, v1.id);
});

test("improve: applyProposal snapshots and marks applied", () => {
  const data = freshData();
  for (let i = 0; i < 3; i += 1) {
    evals.saveRecord(data, { kind: "conversation", prompt: "help", score: 0.15 });
  }
  const created = improve.generateProposals(data);
  const proposal = created[0];
  const applied = improve.applyProposal(data, proposal.id);
  assert.ok(applied);
  assert.equal(applied.applied, true);
  assert.ok(versions.listVersions(data).length >= 1);
  assert.equal(improve.applyProposal(data, proposal.id).applied, true, "idempotent");
});

test("versions: revert unknown id returns null", () => {
  const data = freshData();
  versions.snapshot(data, { label: "a", sections: {} });
  assert.equal(versions.revertVersion(data, "nope"), null);
});