const SENSITIVE_KEY = /(api[_-]?key|password|secret|token|private[_-]?key|cookie|authorization)/i;

function redact(value) {
  if (typeof value === "string") return SENSITIVE_KEY.test(value) ? "[REDACTED]" : value;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(item)
    ]));
  }
  return value;
}

function createAuditEntry(tool, action, details, result = "REQUESTED") {
  return {
    timestamp: new Date().toISOString(),
    tool: String(tool || "unknown"),
    action: String(action || "unknown"),
    details: redact(details || {}),
    result: String(result)
  };
}

function appendAudit(data, entry, maxEntries = 500) {
  const audit = Array.isArray(data.auditLog) ? data.auditLog : [];
  data.auditLog = [...audit, entry].slice(-maxEntries);
  return data;
}

module.exports = { redact, createAuditEntry, appendAudit };
