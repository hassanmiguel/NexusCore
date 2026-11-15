const LEVELS = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high"
});

const ACTIONS = Object.freeze({
  READ: { permission: "read", level: LEVELS.LOW, confirmation: false },
  SEARCH: { permission: "read", level: LEVELS.LOW, confirmation: false },
  WRITE: { permission: "write", level: LEVELS.MEDIUM, confirmation: true },
  DELETE: { permission: "delete", level: LEVELS.HIGH, confirmation: true },
  EXECUTE: { permission: "execute", level: LEVELS.HIGH, confirmation: true },
  BROWSER: { permission: "browser", level: LEVELS.MEDIUM, confirmation: true },
  NETWORK: { permission: "network", level: LEVELS.MEDIUM, confirmation: true },
  APPLICATION_ACCESS: { permission: "applicationAccess", level: LEVELS.HIGH, confirmation: true }
});

function isPathAuthorized(target, directories = []) {
  const path = require("path");
  const resolved = path.resolve(String(target || ""));
  return directories.some(directory => {
    const root = path.resolve(directory);
    return resolved === root || resolved.startsWith(`${root}${path.sep}`);
  });
}

function canPerform(config, actionName, target) {
  const action = ACTIONS[actionName];
  if (!action) return { allowed: false, reason: "Unknown action" };
  if (!config.permissions[action.permission]) {
    return { allowed: false, reason: `Permission ${action.permission} is disabled` };
  }
  if (target && !isPathAuthorized(target, config.authorizedDirectories)) {
    return { allowed: false, reason: "Target is outside authorized directories" };
  }
  const trusted = target && isPathAuthorized(target, config.trustedDirectories);
  return {
    allowed: true,
    level: action.level,
    requiresConfirmation: config.confirmationRequired && action.confirmation && !trusted
  };
}

module.exports = { LEVELS, ACTIONS, isPathAuthorized, canPerform };
