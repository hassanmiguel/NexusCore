"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runTask, parseToolCall } = require("../core/agents/engine");
const { parsePlan, fallbackPlan } = require("../core/agents/planner");

const TOOLS = [
  { name: "system_info", description: "info" },
  { name: "calculator", description: "math" }
];

function stubChat(responder) {
  return async ({ system, messages }) => {
    if (typeof responder === "function") return responder({ system, messages });
    return responder;
  };
}

test("planner: parsePlan handles fenced JSON", () => {
  const plan = parsePlan('```json\n{"goal":"g","steps":[{"title":"Step one","detail":"d"},{"title":"Step two","tool":"calculator"}]}\n```');
  assert.ok(plan);
  assert.equal(plan.goal, "g");
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.steps[1].tool, "calculator");
});

test("planner: fallbackPlan produces deterministic steps", () => {
  const plan = fallbackPlan("test task", TOOLS);
  assert.ok(plan.steps.length >= 1);
  assert.equal(plan.fallback, true);
  assert.ok(plan.steps.some(step => step.tool === "system_info"));
});

test("engine: parses explicit tool call JSON line", () => {
  const call = parseToolCall('Some text\n{"$tool":"calculator","args":{"expression":"2+2"}}\nmore');
  assert.ok(call);
  assert.equal(call.tool, "calculator");
  assert.equal(call.args.expression, "2+2");
  assert.equal(parseToolCall("no tool here"), null);
});

test("engine: runs a task end-to-end with plan + steps + final", async () => {
  let calls = 0;
  const chat = stubChat(({ system, messages }) => {
    calls += 1;
    const last = messages[messages.length - 1] && messages[messages.length - 1].content;
    if (last === "Write the final answer now.") return "FINAL ANSWER";
    if (calls === 1) {
      return '{"goal":"g","steps":[{"title":"Calculate","detail":"Compute 3+4","tool":null}]}';
    }
    return "Step result";
  });

  const result = await runTask(
    { chat, runTool: async ({ tool, args }) => ({ ok: true, result: "dummy" }) },
    { task: "compute", toolsList: TOOLS }
  );
  assert.equal(result.ok, true);
  assert.equal(result.state.status, "done");
  assert.equal(result.state.stepCount, 1);
  assert.equal(result.state.final, "FINAL ANSWER");
});

test("engine: executes tools during a step and reports tool rounds", async () => {
  let toolCalls = 0;
  const chat = stubChat(({ system, messages }) => {
    if (system.includes("task planner")) {
      return '{"goal":"g","steps":[{"title":"Calc","detail":"Compute","tool":"calculator"}]}';
    }
    if (system.includes("completing a task")) return "DONE";
    const last = (messages[messages.length - 1] && messages[messages.length - 1].content) || "";
    if (last.includes("Tool calculator returned")) return "Got 20 from the calculator.";
    return '{"$tool":"calculator","args":{"expression":"2+2"}}';
  });
  const runTool = async () => {
    toolCalls += 1;
    return { ok: true, result: 20 };
  };

  const result = await runTask({ chat, runTool }, { task: "t", toolsList: TOOLS });
  assert.equal(result.ok, true);
  assert.ok(toolCalls >= 1, "tool should have been invoked");
  assert.ok(result.state.final.length > 0);
});

test("engine: failed non-final step aborts the run", async () => {
  const chat = stubChat(({ system, messages }) => {
    const last = (messages[messages.length - 1] && messages[messages.length - 1].content) || "";
    if (last.startsWith("Step 2")) throw new Error("boom");
    if (last === "Write the final answer now.") return "FINAL";
    if (last === "Step 3 work") return "Step 3 result";
    return '{"goal":"g","steps":[{"title":"A","detail":"Step 1 work"},{"title":"B","detail":"Step 2 work"},{"title":"C","detail":"Step 3 work"}]}';
  });

  const result = await runTask(
    { chat, runTool: async () => ({ ok: true, result: "x" }) },
    { task: "t", toolsList: TOOLS }
  );
  assert.equal(result.ok, false);
  assert.equal(result.state.status, "failed");
  assert.ok((result.state.error || "").length > 0);
});

test("engine: missing task rejects early", async () => {
  const result = await runTask({ chat: stubChat("x"), runTool: async () => ({ ok: true }) }, {});
  assert.equal(result.ok, false);
  assert.equal(result.state, undefined);
});