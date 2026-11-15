"use strict";

// Tool registry. Each tool declares its schema, permission level, and whether
// a human confirmation is required before side-effecting actions run.

const path = require("path");
const os = require("os");
const fs = require("fs");

const REDACT_KEYS = /(key|secret|token|password|passwd|api[_-]?key|auth|credential)/i;
const READABLE_DIRS = [
  os.homedir(),
  process.env.PROGRAMFILES,
  process.env.LOCALAPPDATA,
  os.tmpdir()
].filter(Boolean);

function safePathResolution(inputPath) {
  const absolute = path.resolve(String(inputPath || ""));
  const withinAllowed = READABLE_DIRS.some(dir => {
    const base = path.resolve(dir);
    return absolute === base || absolute.startsWith(base + path.sep);
  });
  const cryptoStore = path.join(os.homedir(), ".wormgpt");
  const isCryptoStore = absolute.startsWith(cryptoStore);
  // Do not allow reading our own secrets store from tools by default.
  return { absolute, allowed: withinAllowed && !isCryptoStore };
}

function safeEval(expression) {
  const source = String(expression || "").trim();
  if (/[;{}[\]`]|\b(process|require|eval|function|class|import|export|global)\b/.test(source)) {
    throw new Error("Expression contains disallowed constructs");
  }
  const allowed = /^[0-9+\-*/().,%\s^eE]+$/.test(source);
  if (!allowed) throw new Error("Expression contains disallowed characters");
  const clean = source.replace(/\^/g, "**") || "0";
  const result = Function(`"use strict"; return (${clean});`)();
  if (!Number.isFinite(result)) throw new Error("Result is not finite");
  return result;
}

function findHereticCli() {
  const candidates = [
    "heretic",
    "python -m heretic",
    "python3 -m heretic",
  ];
  for (const cmd of candidates) {
    try {
      const { execSync } = require("child_process");
      execSync(`${cmd} --version 2>/dev/null || ${cmd} --help 2>/dev/null | head -1`, { stdio: "ignore", timeout: 5000 });
      return cmd;
    } catch (_) {
      continue;
    }
  }
  return null;
}

const TOOLS = [
  {
    name: "system_info",
    description: "Report CPU, RAM, OS, platform and uptime. No side effects.",
    permission: "info",
    confirm: false,
    args: {},
    run: () => ({
      platform: process.platform,
      arch: process.arch,
      os: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      cpus: os.cpus().length,
      cores: os.availableParallelism ? os.availableParallelism() : os.cpus().length,
      ramGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
      freeRamGB: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
      uptimeMinutes: Math.round(os.uptime() / 60)
    })
  },
  {
    name: "datetime",
    description: "Current date and time in local and UTC.",
    permission: "info",
    confirm: false,
    args: {},
    run: () => {
      const now = new Date();
      return { local: now.toString(), iso: now.toISOString(), ts: now.getTime() };
    }
  },
  {
    name: "calculator",
    description: "Evaluate a numeric arithmetic expression (+, -, *, /, %, ^, parens).",
    permission: "info",
    confirm: false,
    args: { expression: { type: "string", description: "Arithmetic expression" } },
    run: ({ expression }) => safeEval(expression)
  },
  {
    name: "list_files",
    description: "List files in a directory (read-only, sandboxed to home/temp dirs).",
    permission: "sandboxed-read",
    confirm: false,
    args: { dir: { type: "string", description: "Absolute directory path" }, depth: { type: "number" } },
    run: ({ dir, depth = 1 }) => {
      const { absolute, allowed } = safePathResolution(dir || os.homedir());
      if (!allowed) throw new Error("Path is outside the allowed sandbox");
      const maxDepth = Math.max(1, Math.min(3, Number(depth) || 1));
      function walk(current, remaining) {
        const stats = fs.statSync(current);
        if (!stats.isDirectory()) return null;
        const entries = fs.readdirSync(current).slice(0, 200);
        return entries.map(entry => {
          const entryPath = path.join(current, entry);
          let info = null;
          try {
            const s = fs.statSync(entryPath);
            info = {
              name: entry,
              type: s.isDirectory() ? "dir" : "file",
              kb: s.isDirectory() ? 0 : Math.round(s.size / 1024)
            };
            if (s.isDirectory() && remaining > 0) {
              const children = walk(entryPath, remaining - 1);
              if (children) info.children = children;
            }
          } catch (err) {
            info = { name: entry, type: "unknown" };
          }
          return info;
        });
      }
      return { dir: absolute, entries: walk(absolute, maxDepth - 1) || [] };
    }
  },
  {
    name: "read_file",
    description: "Read a text file (sandboxed to home/temp dirs, max 200 KB).",
    permission: "sandboxed-read",
    confirm: false,
    args: { file: { type: "string", description: "Absolute text file path" } },
    run: ({ file }) => {
      const { absolute, allowed } = safePathResolution(file);
      if (!allowed) throw new Error("Path is outside the allowed sandbox");
      const stats = fs.statSync(absolute);
      if (stats.size > 200 * 1024) throw new Error("File is larger than 200 KB cap");
      const content = fs.readFileSync(absolute, "utf8");
      return { file: absolute, bytes: stats.size, content: content.slice(0, 100000) };
    }
  },
  {
    name: "memory_search",
    description: "Search the user's memory (approved records only).",
    permission: "info",
    confirm: false,
    args: { query: { type: "string" }, k: { type: "number" } },
    run: ({ query, k }, context) => {
      const memory = require("../memory/store");
      if (!context || !context.data) throw new Error("Memory store unavailable");
      const { results } = memory.search(context.data, String(query || ""), { k: Number(k) || 5 });
      return results.map(item => ({ text: item.text, score: item.score, layer: item.layer }));
    }
  },
  {
    name: "knowledge_search",
    description: "Search ingested knowledge base documents.",
    permission: "info",
    confirm: false,
    args: { query: { type: "string" }, k: { type: "number" } },
    run: ({ query, k }, context) => {
      const knowledge = require("../knowledge/index");
      if (!context || !context.data) throw new Error("Knowledge store unavailable");
      const { results } = knowledge.search(context.data, String(query || ""), { k: Number(k) || 5 });
      return results.map(item => ({ doc: item.docName, text: item.text, score: item.score }));
    }
  },
  {
    name: "remember",
    description: "Explicitly save a fact to long-term memory (approved source: user).",
    permission: "memory-write",
    confirm: true,
    args: { text: { type: "string" }, layer: { type: "string" } },
    run: ({ text, layer }, context) => {
      const memory = require("../memory/store");
      if (!context || !context.data) throw new Error("Memory store unavailable");
      const item = memory.addMemory(context.data, {
        layer: ["long", "procedural", "knowledge"].includes(layer) ? layer : "long",
        text,
        source: "user",
        status: "active"
      });
      context.saveData();
      return { id: item.id, layer: item.layer };
    }
  },
  {
    name: "write_file",
    description: "Write text to a file inside the workspace (requires confirmation).",
    permission: "sandboxed-write",
    confirm: true,
    args: { file: { type: "string" }, content: { type: "string" } },
    run: ({ file, content }) => {
      const { absolute, allowed } = safePathResolution(file);
      if (!allowed) throw new Error("Path is outside the allowed sandbox");
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, String(content || ""), "utf8");
      return { file: absolute, bytes: String(content || "").length };
    }
  },
  {
    name: "heretic_decensor",
    description: "Run Heretic to automatically remove censorship from a model (requires Heretic CLI installed). Returns the new model name for use with Ollama.",
    permission: "model-write",
    confirm: true,
    args: {
      model: { type: "string", description: "Hugging Face model ID to decensor (e.g., 'Qwen/Qwen3-4B-Instruct-2507')" },
      quantization: { type: "string", description: "Quantization: 'none' or 'bnb_4bit' (default: 'bnb_4bit')" },
      outputName: { type: "string", description: "Custom name for the decensored model in Ollama (default: original-name-heretic)" }
    },
    run: async ({ model, quantization = "bnb_4bit", outputName }, context) => {
      const { execSync } = require("child_process");
      const hereticCmd = findHereticCli();
      if (!hereticCmd) {
        throw new Error("Heretic CLI not found. Install with: pip install -U heretic-llm");
      }
      if (!model || typeof model !== "string") {
        throw new Error("Model ID is required (e.g., 'Qwen/Qwen3-4B-Instruct-2507')");
      }
      const safeName = outputName || model.split("/").pop().replace(/[^a-zA-Z0-9-_]/g, "-") + "-heretic";
      const args = [model, "--quantization", quantization];
      const cmd = `${hereticCmd} ${args.map(a => a.includes(" ") ? `"${a}"` : a).join(" ")}`;
      const timeoutMs = 1000 * 60 * 60; // 1 hour max
      try {
        execSync(cmd, { stdio: "inherit", timeout: timeoutMs });
      } catch (err) {
        throw new Error(`Heretic failed: ${err.message || String(err)}`);
      }
      // Try to import the model into Ollama if a merged model directory was created
      // Heretic outputs to ./heretic-output/<model-name> by default
      const outputDir = `./heretic-output/${safeName}`;
      let ollamaName = safeName;
      try {
        const { statSync } = require("fs");
        if (statSync(outputDir).isDirectory()) {
          // Create Ollama model from the directory
          execSync(`ollama create ${ollamaName} -f ${outputDir}/Modelfile`, { stdio: "inherit", timeout: 60000 });
        }
      } catch (_) {
        // Ollama import failed, but Heretic succeeded - user can import manually
      }
      return { model: ollamaName, source: model, quantization, note: "Decensored model ready. Use with Ollama provider." };
    }
  },
  {
    name: "generate_image",
    description: "Generate an image from a text prompt using the configured Gemini image model.",
    permission: "external-api",
    confirm: true,
    args: {
      prompt: { type: "string", description: "Image prompt" },
      model: { type: "string", description: "Gemini image model (optional)" },
      aspectRatio: { type: "string", description: "Aspect ratio, e.g. 16:9" },
      size: { type: "string", description: "Image size: 1K, 2K, 4K" }
    },
    run: async ({ prompt, model, aspectRatio, size }, context) => {
      const registry = require("../ai/registry");
      const gemini = require("../ai/gemini");
      const crypto = require("../crypto");
      const data = (context && context.data) || {};
      const provider = registry.getProvider("gemini", data, crypto);
      if (!provider || !provider.apiKey) throw new Error("Gemini API key is required for image generation");
      const result = await gemini.generateImage(
        { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: model || provider.model },
        String(prompt || ""),
        { aspectRatio, size }
      );
      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      const buffer = Buffer.from(result.imageBase64, "base64");
      const file = path.join(os.tmpdir(), `nexus-image-${Date.now()}.png`);
      fs.writeFileSync(file, buffer);
      return { file, mimeType: result.mimeType, text: result.text, model: result.model, bytes: buffer.length };
    }
  }
];

const TOOL_INDEX = new Map(TOOLS.map(tool => [tool.name, tool]));

function listTools() {
  return TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    permission: tool.permission,
    confirm: tool.confirm,
    args: Object.keys(tool.args || {}).map(name => ({ name, ...tool.args[name] }))
  }));
}

function findTool(name) {
  return TOOL_INDEX.get(String(name || "")) || null;
}

function requiresConfirmation(name) {
  const tool = findTool(name);
  return tool ? Boolean(tool.confirm) : false;
}

/**
 * Execute a tool call. Returns either { ok:true, result } or
 * { ok:false, error }. If the tool needs confirmation and it was not granted,
 * returns { ok:false, needsConfirm:true, tool, error: "requires confirmation" }.
 */
async function execute(name, args, context = {}) {
  const tool = findTool(name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  if (tool.confirm && context.confirmed !== true) {
    return { ok: false, needsConfirm: true, tool: name, error: "requires confirmation" };
  }
  try {
    const result = await tool.run(args || {}, context);
    return { ok: true, tool: name, result };
  } catch (err) {
    return { ok: false, tool: name, error: err.message || String(err), needsConfirm: false };
  }
}

module.exports = {
  listTools,
  findTool,
  requiresConfirmation,
  execute,
  safeEval,
  READABLE_DIRS,
  REDACT_KEYS
};