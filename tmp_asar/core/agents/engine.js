"use strict";

// Agent engine: executes a multi-step task using the provider runtime for
// reasoning and the tool registry for actions. Supports state tracking,
// tool-call loop, transient retry, and a deterministic fallback plan.

const { parsePlan, fallbackPlan } = require("./planner");

const MAX_TOOL_ROUNDS = 6;
const MAX_STEPS = 8;
const RETRIES = 2;

function createState(initial) {
  return {
    id: initial.id || `task_${Date.now().toString(36)}`,
    task: initial.task || "",
    status: "running",
    createdAt: new Date().toISOString(),
    startedAt: Date.now(),
    plan: null,
    usingFallbackPlan: false,
    steps: [],
    final: null,
    error: null
  };
}

function stateSummary(state) {
  return {
    id: state.id,
    task: state.task.slice(0, 200),
    status: state.status,
    usingFallbackPlan: state.usingFallbackPlan,
    stepCount: state.steps.length,
    final: state.final ? state.final.slice(0, 400) : null,
    error: state.error ? state.error.slice(0, 300) : null,
    durationMs: state.finishedAt ? state.finishedAt - state.startedAt : null
  };
}

function isTransient(error, providerId) {
  const message = String((error && error.message) || error || "").toLowerCase();
  if (/rate|quota|429|503|timeout|timed out|fetch failed|ec(east )?cnn?error|refused/i.test(message)) {
    return true;
  }
  return /rito|hyperbolic|groq|openai|anthropic|gemini|olama|ollama/.test(String(providerId || ""));
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseToolCall(text) {
  const source = String(text || "");
  const lines = source.split("\n").map(line => line.trim());
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    if (!line.includes("$tool")) continue;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed.$tool === "string") {
        return { tool: parsed.$tool, args: parsed.args && typeof parsed.args === "object" ? parsed.args : {} };
      }
    } catch (err) {
      // keep scanning
    }
  }
  return null;
}

/**
 * Run an agent task.
 * @param {Object} deps
 * @param {Function} deps.chat - async ({system, messages}) => string content
 * @param {Function} deps.runTool - async ({tool, args, confirmed}) => {ok,result,error,needsConfirm}
 * @param {Object} deps.context - additional context keyed to the run
 */
async function runTask(deps, input = {}) {
  const task = String(input.task || "").trim();
  if (!task) return { ok: false, error: "Task is required" };

  const state = createState({ task, id: input.id });
  const toolsList = Array.isArray(input.toolsList) ? input.toolsList : [];
  const toolNames = toolsList.map(tool => tool.name);
  const userOverride = input.planProvided === true;

  try {
    // 1) Plan
    let plan = null;
    let planError = null;
    for (let attempt = 0; attempt <= RETRIES && !plan; attempt += 1) {
      const plannerSystem = [
        "You are a task planner. Break the user's task into a small ordered sequence of steps.",
        "You may use tools from this list: " + (toolNames.join(", ") || "(none)"),
        "Reply with ONLY a JSON object shaped like:",
        '{"goal":"<goal>","steps":[{"title":"<step>","detail":"<detail>","tool":"<tool-or-empty>"}]}'
      ].join("\n");

      try {
        const raw = await deps.chat({ system: plannerSystem, messages: [{ role: "user", content: task }] });
        plan = parsePlan(raw);
        if (plan) state.plan = plan;
      } catch (err) {
        planError = err.message || String(err);
      }
      if (!plan && attempt < RETRIES) await sleep(300 * (attempt + 1));
    }

    if (!plan) {
      plan = fallbackPlan(task, toolsList);
      state.plan = plan;
      state.usingFallbackPlan = true;
    }

    // 2) Execute steps
    const stepsToRun = (plan.steps || []).slice(0, MAX_STEPS);
    const priorContext = [];

    for (let stepIndex = 0; stepIndex < stepsToRun.length; stepIndex += 1) {
      const step = stepsToRun[stepIndex];
      const stepRecord = {
        index: stepIndex + 1,
        title: step.title,
        detail: step.detail,
        tool: step.tool || null,
        status: "running",
        toolRounds: 0,
        attempts: 1,
        output: null,
        error: null,
        startedAt: Date.now(),
        finishedAt: null
      };
      state.steps.push(stepRecord);

      const isLast = stepIndex === stepsToRun.length - 1;
      const stepSystem = [
        "You are an agent executing a step of a larger task.",
        `Task: ${task}`,
        `Step ${stepIndex + 1}/${stepsToRun.length}: ${step.title}`,
        step.detail ? `Details: ${step.detail}` : "",
        !isLast ? "After this step, just report your findings concisely. Do not write the final answer yet." : "",
        userOverride ? "The plan was user-provided; follow it exactly." : "",
        toolNames.length > 0
          ? `If you need data, output ONE JSON line on its own line: {"$tool":"<toolName>","args":{...}} with a tool from: ${toolNames.join(", ")}. Otherwise answer in text.`
          : "Tools are unavailable; answer from your own knowledge and the context below."
      ].filter(Boolean).join("\n");

      let output = null;
      let attempt = 0;
      let transient = null;

      while (attempt <= RETRIES) {
        stepRecord.attempts = attempt + 1;
        try {
          const messages = [
            ...priorContext.map(item => ({ role: "assistant", content: item })),
            { role: "user", content: step.detail || step.title }
          ];
          const response = await deps.chat({ system: stepSystem, messages });
          output = response;

          // Tool loop
          for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
            const toolCall = parseToolCall(output);
            if (!toolCall) break;
            const result = await deps.runTool({ tool: toolCall.tool, args: toolCall.args });
            stepRecord.toolRounds += 1;
            if (!result || !result.ok) {
              if (result && result.needsConfirm) {
                output = `Tool ${toolCall.tool} requires confirmation which was not granted. Note this and continue with available information.`;
              } else {
                const toolError = (result && result.error) || "unknown tool error";
                output = `Tool ${toolCall.tool} failed: ${toolError}. Continue.`;
              }
              break;
            }
            const rendered = typeof result.result === "string"
              ? result.result
              : JSON.stringify(result.result).slice(0, 2000);
            const messages = priorContext.map(item => ({ role: "assistant", content: item }));
            messages.push({ role: "user", content: step.detail || step.title });
            messages.push({ role: "assistant", content: `Tool ${toolCall.tool} returned: ${rendered}. Summarize what this tells you, or request another tool if still needed.` });
            const followUp = await deps.chat({ system: stepSystem, messages });
            output = followUp;
          }

          break;
        } catch (err) {
          transient = err;
          stepRecord.error = err.message || String(err);
          if (attempt < RETRIES && !isLast && isTransient(err)) {
            await sleep(400 * (attempt + 1));
            attempt += 1;
            continue;
          }
          break;
        }
      }

      stepRecord.output = output || null;
      if (output) priorContext.push(`${step.title}: ${output.slice(0, 1200)}`);
      stepRecord.status = output ? "done" : "failed";
      stepRecord.finishedAt = Date.now();

      // If a non-final step fails hard, abort the run.
      if (!output && !isLast) {
        state.status = "failed";
        state.error = (transient && transient.message) || "Step failed";
        state.finishedAt = Date.now();
        return { ok: false, state: stateSummary(state) };
      }
    }

    // 3) Final answer
    try {
      const finalSystem = [
        "You are completing a task. Using the step outcomes below, write the final answer to the user's task.",
        `Task: ${task}`,
        "Be complete and accurate. If you used tools, reference their findings. If data was unavailable, say so."
      ].join("\n");
      const finalMessages = [
        ...priorContext.map(item => ({ role: "assistant", content: item })),
        { role: "user", content: "Write the final answer now." }
      ];
      state.final = await deps.chat({ system: finalSystem, messages: finalMessages });
    } catch (err) {
      // Combine step outputs as a minimal final answer.
      state.final = state.steps.map(step => `- ${step.title}: ${(step.output || "(no output)").slice(0, 600)}`).join("\n");
      state.error = state.error || `Summary fallback: ${err.message}`;
    }

    state.status = "done";
    state.finishedAt = Date.now();
    return { ok: true, state: stateSummary(state) };
  } catch (err) {
    state.status = "failed";
    state.error = err.message || String(err);
    state.finishedAt = Date.now();
    return { ok: false, state: stateSummary(state) };
  }
}

module.exports = { runTask, parseToolCall, createState, isTransient, MAX_TOOL_ROUNDS, MAX_STEPS };