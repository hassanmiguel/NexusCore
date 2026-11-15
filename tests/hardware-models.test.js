"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const hardware = require("../core/ai/hardware");
const modelManager = require("../core/model-manager");

const fakeCrypto = {
  encrypt: value => `enc:${Buffer.from(String(value)).toString("base64")}`,
  decrypt: value => Buffer.from(String(value).replace(/^enc:/, ""), "base64").toString()
};

test("tierFor classifies hardware", () => {
  assert.equal(hardware.tierFor({ vramGB: 24, ramGB: 64 }), "high");
  assert.equal(hardware.tierFor({ vramGB: 8, ramGB: 16 }), "medium");
  assert.equal(hardware.tierFor({ vramGB: 0, ramGB: 8 }), "low");
});

test("hardware detect returns cpu/ram metadata", async () => {
  const info = await hardware.detect(true);
  assert.ok(info.cpuCores >= 1);
  assert.ok(info.ramGB > 0);
  assert.ok(["high", "medium", "low"].includes(info.tier));
});

test("recommendation maps to a tier and never suggests already-installed as 'install this'", async () => {
  const rec = await modelManager.recommend({ ai: {} }, fakeCrypto);
  assert.ok(["high", "medium", "low"].includes(rec.tier));
  assert.ok(typeof rec.defaultChat === "string" && rec.defaultChat.length > 0);
  assert.ok(Array.isArray(rec.models) && rec.models.length > 0);
  assert.ok(Array.isArray(rec.installed));
});

test("unknown provider rejections are safe", async () => {
  await assert.rejects(
    () => modelManager.downloadModel({ ai: {} }, fakeCrypto, "banana", "x"),
    /Unknown provider/
  );
});