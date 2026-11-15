const DEFAULT_CONFIG = {
  mode: "chat",
  permissions: {
    read: false,
    write: false,
    delete: false,
    execute: false,
    browser: false,
    network: false,
    applicationAccess: false
  },
  authorizedDirectories: [],
  trustedDirectories: [],
  confirmationRequired: true,
  maxAuditEntries: 500
};

function normalizeDirectory(value) {
  return typeof value === "string" ? value.trim() : "";
}

function loadAgentConfig(data = {}) {
  const saved = data.agentConfig && typeof data.agentConfig === "object"
    ? data.agentConfig
    : {};
  const savedPermissions = saved.permissions && typeof saved.permissions === "object"
    ? saved.permissions
    : {};
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    permissions: { ...DEFAULT_CONFIG.permissions, ...savedPermissions },
    authorizedDirectories: Array.isArray(saved.authorizedDirectories)
      ? saved.authorizedDirectories.map(normalizeDirectory).filter(Boolean)
      : [],
    trustedDirectories: Array.isArray(saved.trustedDirectories)
      ? saved.trustedDirectories.map(normalizeDirectory).filter(Boolean)
      : []
  };
}

function sanitizeAgentConfig(input = {}) {
  const config = loadAgentConfig({ agentConfig: input });
  return {
    mode: ["chat", "research", "coding", "file-manager", "computer", "autonomous", "analysis"]
      .includes(config.mode) ? config.mode : DEFAULT_CONFIG.mode,
    permissions: { ...config.permissions },
    authorizedDirectories: [...new Set(config.authorizedDirectories)],
    trustedDirectories: [...new Set(config.trustedDirectories)],
    confirmationRequired: config.confirmationRequired !== false,
    maxAuditEntries: Math.max(50, Math.min(5000, Number(config.maxAuditEntries) || 500))
  };
}

module.exports = { DEFAULT_CONFIG, loadAgentConfig, sanitizeAgentConfig };
