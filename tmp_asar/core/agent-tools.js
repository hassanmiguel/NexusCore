const tools = new Map();

function registerTool(tool) {
  if (!tool || typeof tool.name !== "string" || typeof tool.execute !== "function") {
    throw new TypeError("A tool requires name and execute()" );
  }
  if (tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
  tools.set(tool.name, Object.freeze({
    name: tool.name,
    description: String(tool.description || ""),
    inputSchema: tool.inputSchema || {},
    permissionLevel: tool.permissionLevel || "low",
    execute: tool.execute
  }));
}

function listTools() {
  return [...tools.values()].map(({ execute, ...tool }) => tool);
}

function getTool(name) {
  return tools.get(name) || null;
}

module.exports = { registerTool, listTools, getTool };
