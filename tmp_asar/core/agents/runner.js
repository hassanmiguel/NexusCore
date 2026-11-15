"use strict";

// Wires the agent engine to the app's runtime (LLM) and tool registry.

const { runTask } = require("./engine");
const tools = require("../tools/index");

let activeRun = null;

function buildDeps({ data, saveData, decrypt }) {
  // Lazy requires to avoid circular imports at load time.
  const runtime = require("../ai/runtime");

  return {
    async chat({ system, messages }) {
      const fullMessages = [
        { role: "system", content: system || "" },
        ...(Array.isArray(messages) ? messages : [])
      ];
      const lastUser = [...fullMessages].reverse().find(item => item && item.role === "user");
      const result = await runtime.chatWithFallback(data, { decrypt }, fullMessages, {
        userText: (lastUser && lastUser.content) || ""
      });
      return result.content;
    },
    async runTool({ tool, args, confirmed }) {
      return tools.execute(String(tool || ""), args || {}, {
        confirmed: confirmed === true,
        data,
        saveData: saveData || (() => {})
      });
    }
  };
}

/**
 * Run a task through the agent engine. Returns the summary state.
 */
async function run(data, input, options = {}) {
  const decrypt = options.decrypt || (() => "");
  const state = await runTask(buildDeps({ data, decrypt, saveData: options.saveData }), {
    task: input.task,
    toolsList: tools.listTools(),
    planProvided: input.planProvided === true,
    id: input.id
  });

  const history = data.ai && data.ai.agents;
  if (history) {
    history.lastRun = state.state || state;
    history.runs = Array.isArray(history.runs) ? history.runs : [];
    history.runs.push(state.state || state);
    history.runs = history.runs.slice(-20);
    if (options.saveData) options.saveData();
  }

  return state;
}

function getActive() {
  return activeRun;
}

module.exports = { run, buildDeps, getActive };