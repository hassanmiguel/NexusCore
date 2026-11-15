function ensureSystemFirst(messages, fallbackSystem = null) {
  const list = Array.isArray(messages) ? messages.filter(Boolean) : [];
  const valid = list.filter(item => item && typeof item === "object" && typeof item.role === "string");
  const system = valid.filter(item => item.role === "system");
  const rest = valid.filter(item => item.role !== "system");
  const ordered = system.length > 0 ? [system[0], ...rest] : rest;

  if (fallbackSystem && !ordered.some(item => item.role === "system")) {
    return [{ role: "system", content: fallbackSystem }, ...ordered];
  }

  return ordered;
}

exports.ensureSystemFirst = ensureSystemFirst;

exports.trim = (messages, max = 6) => {
  const ordered = ensureSystemFirst(messages);
  if (ordered.length === 0) return [];

  const system = ordered[0]?.role === "system" ? ordered[0] : null;
  const rest = system ? ordered.slice(1) : ordered;
  const remaining = Math.max(0, max - (system ? 1 : 0));
  const trimmed = remaining === 0 ? [] : rest.slice(-remaining);

  return system ? [system, ...trimmed] : trimmed;
};
