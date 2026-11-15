"use strict";

const os = require("os");
const { execFile } = require("child_process");

let cache = null;
const CACHE_MS = 30000;

function collectCpuRam() {
  const cpus = os.cpus();
  return {
    cpuCores: Array.isArray(cpus) && cpus.length > 0 ? cpus.length : 1,
    cpuModel: Array.isArray(cpus) && cpus[0] ? cpus[0].model : "unknown",
    ramGB: Math.max(0.25, Math.round((os.totalmem() / (1024 ** 3)) * 10) / 10),
    freeRamGB: Math.max(0, Math.round((os.freemem() / (1024 ** 3)) * 10) / 10),
    platform: process.platform,
    arch: process.arch
  };
}

function collectNvidia() {
  return new Promise(resolve => {
    if (process.platform !== "win32" && process.platform !== "linux") return resolve(null);
    execFile(
      "nvidia-smi",
      ["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const line = String(stdout).split(/\r?\n/).find(Boolean);
        if (!line) return resolve(null);
        const [name, memoryTotal, driver] = line.split(",").map(part => String(part || "").trim());
        const vramGB = /(\d+)\s*MiB/.test(memoryTotal)
          ? Math.round((Number(/^(\d+)/.exec(memoryTotal)[1]) / 1024) * 10) / 10
          : Math.round((Number(memoryTotal.replace(/[^0-9.]/g, "") || 0) / 1024) * 10) / 10;
        resolve({ name, vramGB, driver });
      }
    );
  });
}

async function detect(force = false) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const base = collectCpuRam();
  const gpu = await collectNvidia();
  const totalDiskGB = null; // Getting disk totals requires exec; skipped to keep detection instant.
  const value = {
    ...base,
    gpu,
    freeDiskGB: null,
    tier: tierFor({ ramGB: base.ramGB, vramGB: gpu ? gpu.vramGB : 0, hasGpu: Boolean(gpu) })
  };
  cache = { value, at: Date.now() };
  return value;
}

function tierFor(hardware) {
  const vram = hardware.vramGB || 0;
  const ram = hardware.ramGB || 0;
  if (vram >= 16 && ram >= 32) return "high";
  if (vram >= 8 || ram >= 16) return "medium";
  return "low";
}

module.exports = { detect, tierFor, collectCpuRam, collectNvidia };