import { useEffect, useRef, useState } from "react";

import KnowledgeGraph from "./KnowledgeGraph.jsx";

const TABS = ["status", "models", "memory", "knowledge", "graph", "storageEye", "research", "agents", "learning", "decensor"];
const TAB_LABELS = {
  status: "Overview",
  models: "Models",
  memory: "Memory",
  knowledge: "Knowledge",
  graph: "Graph",
  storageEye: "Storage Eye",
  research: "Research",
  agents: "Agents",
  learning: "Learning",
  decensor: "Decensor"
};

const MODE_IDS = {
  local: ["Local-first", "local", "Always use local models first"],
  hybrid: ["Hybrid", "hybrid", "Use remote providers when helpful"],
  research: ["Research", "research", "Prioritize online research"],
  privacy: ["Privacy", "privacy", "Local only, no network calls"],
  developer: ["Developer", "developer", "Allow tools and agents"],
  offline: ["Offline", "offline", "No providers, reasoning only"]
};

function fmtSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
}

function fmtCount(total) {
  if (!Number.isFinite(total)) return "0";
  if (total >= 1000000) return `${Math.round(total / 100000) / 10}M`;
  if (total >= 1000) return `${Math.round(total / 100) / 10}K`;
  return String(total);
}

export default function ControlCenter({ wormgpt, onStatus }) {
  const [tab, setTab] = useState("status");
  const [status, setStatus] = useState(null);
  const [hardware, setHardware] = useState(null);
  const [modes, setModes] = useState(null);
  const [memoryStats, setMemoryStats] = useState(null);
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryResults, setMemoryResults] = useState([]);
  const [knowledgeStats, setKnowledgeStats] = useState(null);
  const [learnedStorage, setLearnedStorage] = useState({ skills: 0, docs: 0, chunks: 0, memories: 0 });
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeResults, setKnowledgeResults] = useState([]);
  const [models, setModels] = useState(null);
  const [recommend, setRecommend] = useState(null);
  const [researchQuery, setResearchQuery] = useState("");
  const [researchState, setResearchState] = useState(null);
  const [agentTask, setAgentTask] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [versions, setVersions] = useState([]);
  const [activeVersion, setActiveVersion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [decensorModel, setDecensorModel] = useState("");
  const [decensorQuant, setDecensorQuant] = useState("bnb_4bit");
  const [decensorRunning, setDecensorRunning] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    refreshAll();
    return () => { mounted.current = false; };
  }, []);

  function safeSet(fn, value) {
    if (mounted.current) fn(value);
  }

  async function refreshAll() {
    try {
      const [statusRes, hard, modeRes, memRes, kbRes, modelsRes, recRes, skillRes] = await Promise.all([
        wormgpt?.systemStatus?.(),
        wormgpt?.systemHardware?.(),
        wormgpt?.modesLoad?.(),
        wormgpt?.memoryStats?.(),
        wormgpt?.knowledgeStats?.(),
        wormgpt?.modelsList?.(),
        wormgpt?.modelsRecommend?.(),
        wormgpt?.skillStats?.()
      ]);
      safeSet(setStatus, statusRes || null);
      safeSet(setHardware, hard || null);
      safeSet(setModes, modeRes || null);
      safeSet(setMemoryStats, memRes || null);
      safeSet(setKnowledgeStats, kbRes || null);
      safeSet(setModels, modelsRes || null);
      safeSet(setRecommend, recRes || null);
      safeSet(setLearnedStorage, {
        skills: (skillRes && skillRes.total) || 0,
        docs: (kbRes && kbRes.docCount) || 0,
        chunks: (kbRes && kbRes.chunkCount) || 0,
        memories: (memRes && memRes.total) || 0
      });
    } catch (err) {
      setMessage("Control center failed to load: " + ((err && err.message) || err));
    }
  }

  async function loadTabExtras(next) {
    setTab(next);
    setMessage("");
    if (next === "learning") {
      try {
        const [proposalsRes, versionsRes, activeRes] = await Promise.all([
          wormgpt?.proposalsList?.(),
          wormgpt?.versionsList?.(),
          wormgpt?.versionsActive?.()
        ]);
        safeSet(setProposals, proposalsRes || []);
        safeSet(setVersions, versionsRes || []);
        safeSet(setActiveVersion, activeRes || null);
      } catch (err) {
        setMessage(String((err && err.message) || err));
      }
    }
  }

  async function updateMode(mode) {
    const next = { ...(modes || {}) };
    const pairs = next.modes || {};
    if (pairs[mode]) {
      delete pairs[mode];
    } else {
      Object.keys(pairs).forEach(key => delete pairs[key]);
      pairs[mode] = true;
    }
    // Preserve private-mode sub-options.
    const saved = await wormgpt?.modesSave?.({ ...next, modes: pairs });
    safeSet(setModes, saved || { modes: pairs, subModes: next.subModes });
    setMessage(`Mode: ${mode}`);
  }

  async function handleMemorySearch() {
    if (!memorySearch.trim()) return;
    const res = await wormgpt?.memorySearch?.(memorySearch.trim(), { k: 6, withMeta: true });
    safeSet(setMemoryResults, (res && res.results) || []);
  }

  async function handleKnowledgeSearch() {
    if (!knowledgeSearch.trim()) return;
    const res = await wormgpt?.knowledgeSearch?.(knowledgeSearch.trim(), { k: 6 });
    safeSet(setKnowledgeResults, (res && res.results) || []);
  }

  async function handleRunResearch() {
    if (!researchQuery.trim()) return;
    setBusy(true);
    setResearchState({ status: "running" });
    try {
      const res = await wormgpt?.researchRun?.({ query: researchQuery.trim(), maxSources: 4, saveToMemory: false });
      safeSet(setResearchState, res || { status: "idle" });
      setMessage(res && res.report ? `Research complete: ${res.report.sourceCount} sources` : "Research finished.");
    } catch (err) {
      setMessage("Research error: " + ((err && err.message) || err));
      safeSet(setResearchState, { status: "error" });
    } finally {
      safeSet(setBusy, false);
    }
  }

  async function handleRunAgent() {
    if (!agentTask.trim()) return;
    setAgentRunning(true);
    setMessage("Agent running...");
    try {
      const res = await wormgpt?.agentsRun?.({ task: agentTask.trim() });
      setMessage(res && res.state ? `Agent done (${(res.state.stepCount || 0)} steps)` : "Agent finished.");
    } catch (err) {
      setMessage("Agent error: " + ((err && err.message) || err));
    } finally {
      safeSet(setAgentRunning, false);
    }
  }

  async function handleApplyProposal(proposal) {
    const res = await wormgpt?.proposalsApply?.(proposal);
    setMessage(res && res.applied ? `Applied: ${proposal.summary || proposal.kind}` : "Proposal not applied.");
    const proposalsRes = await wormgpt?.proposalsList?.();
    safeSet(setProposals, proposalsRes || []);
  }

  async function handleRevert(version) {
    const res = await wormgpt?.versionsRevert?.(version.id);
    setMessage(res ? `Reverted to ${res.label || "snapshot"}` : "Revert failed.");
  }

  async function handleInstall(model) {
    setMessage(`Installing ${model}... (this may take several minutes)`);
    await wormgpt?.modelsDownload?.((recommend && recommend.providerId) || "ollama", model);
    setMessage(`Model ${model} install finished. Check the Models tab.`);
  }

  const statusBlock = status || {};
  const modePairs = (modes && modes.modes) || {};

  return (
    <div className="control-center">
      <div className="settings__title">AI Control Center</div>
      <div className="control-center__tabs" role="tablist">
        {TABS.map(id => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`control-center__tab ${tab === id ? "is-active" : ""}`}
            onClick={() => loadTabExtras(id)}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>

      {message && <div className="control-center__message">{message}</div>}

      {tab === "status" && (
        <div className="control-center__body">
          <div className="control-center__grid">
            <div className="control-center__card">
              <div className="skills-panel__card-title">Providers</div>
              <div className="control-center__kv">Active: <strong>{statusBlock.providerLabel || statusBlock.activeProvider || "—"}</strong></div>
              <div className="control-center__kv">Chain: {(statusBlock.chain || []).map(item => item.label).join(" → ") || "—"}</div>
              <div className="control-center__kv">Online: <strong>{statusBlock.online === true ? "Yes" : "No/Probing"}</strong> <small>({statusBlock.latencyMs ?? "?"}ms)</small></div>
            </div>
            <div className="control-center__card">
              <div className="skills-panel__card-title">Operating Modes</div>
              {Object.keys(MODE_IDS).map(mode => {
                const [label, , detail] = MODE_IDS[mode];
                return (
                  <label key={mode} className="control-center__mode">
                    <input type="checkbox" checked={Boolean(modePairs[mode])} onChange={() => updateMode(mode)} />
                    <span><strong>{label}</strong> <small>{detail}</small></span>
                  </label>
                );
              })}
              <div className="control-center__kv">Police privacy: <strong>{String(statusBlock.privacy || "?")}</strong></div>
            </div>
          </div>

          <div className="control-center__grid">
            <div className="control-center__card">
              <div className="skills-panel__card-title">Hardware</div>
              {hardware ? (
                <>
                  <div className="control-center__kv">Tier: <strong>{hardware.tier}</strong></div>
                  <div className="control-center__kv">CPU: {hardware.cpuCores} cores / {fmtSize(hardware.ramBytes || 0)} RAM</div>
                  {hardware.gpu && <div className="control-center__kv">GPU: {hardware.gpu}</div>}
                  {hardware.disk && <div className="control-center__kv">Disk free: {hardware.disk}</div>}
                </>
              ) : <div className="control-center__kv">Hardware probe unavailable.</div>}
            </div>
            <div className="control-center__card">
              <div className="skills-panel__card-title">Local Model Recommendation</div>
              {recommend ? (
                <>
                  <div className="control-center__kv">Recommended: <strong>{recommend.defaultChat}</strong></div>
                  <div className="control-center__kv">Tier: {recommend.tier} · Provider: {recommend.providerId}</div>
                  <div className="control-center__kv">Reason: {(recommend.reason || "fit for this hardware").slice(0, 140)}</div>
                  {recommend.models && recommend.models.length > 0 && (
                    <div className="control-center__install">
                      {recommend.models.slice(0, 4).map(model => (
                        <button key={model.name} type="button" className="ghost" onClick={() => handleInstall(model.name)}>
                          Install {model.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : <div className="control-center__kv">No recommendation yet.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === "status" && (() => {
        const s = learnedStorage || { skills: 0, docs: 0, chunks: 0, memories: 0 };
        const total = (s.skills || 0) + (s.docs || 0) + (s.chunks || 0) + (s.memories || 0);
        const cap = 100000;
        const pct = Math.min(100, Math.round((total / cap) * 100));
        return (
          <div className="control-center__body" style={{ marginTop: 12 }}>
            <div className="control-center__card" style={{ background: "linear-gradient(135deg, rgba(255,77,109,0.08), rgba(124,92,255,0.08))", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="skills-panel__card-title">Learned Storage</div>
              <div className="control-center__kv" style={{ marginBottom: 8 }}>
                Skills: {s.skills} · Docs: {s.docs} · Chunks: {s.chunks} · Memories: {s.memories}
              </div>
              <div style={{ position: "relative", height: 18, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden", boxShadow: "inset 0 0 8px rgba(0,0,0,0.4)" }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
                  background: "linear-gradient(90deg, #ff4d6d, #7c5cff, #00d4ff)",
                  boxShadow: "0 0 18px rgba(124,92,255,0.6)",
                  transition: "width 0.8s cubic-bezier(.2,.8,.2,1)",
                  borderRadius: 999
                }} />
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`,
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
                  animation: "kg-shimmer 2.4s linear infinite",
                  borderRadius: 999
                }} />
              </div>
              <div className="control-center__kv" style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span><strong>{total.toLocaleString()}</strong> learned units</span>
                <span>{pct}% of {cap.toLocaleString()} capacity</span>
              </div>
            </div>
            <style>{`@keyframes kg-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
          </div>
        );
      })()}

      {tab === "models" && (
        <div className="control-center__body">
          <div className="skills-panel__card-title">Local Models (Ollama)</div>
          {!models || !Array.isArray(models.models) || models.models.length === 0 ? (
            <div className="control-center__kv">
              No local models detected. Install Ollama and pull a model, or use the recommendations on the Status tab.
            </div>
          ) : (
            <div className="control-center__list">
              {(models.models || []).map(item => (
                <div key={item.name} className="control-center__list-item">
                  <span><strong>{item.name}</strong> <small>{fmtSize(item.sizeBytes || 0)}</small></span>
                  <button
                    type="button"
                    className="ghost"
                    onClick={async () => {
                      const done = await wormgpt?.modelsRemove?.("ollama", item.name);
                      setMessage(done ? `Removed ${item.name}` : "Remove failed");
                      const nextModels = await wormgpt?.modelsList?.();
                      safeSet(setModels, nextModels);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "memory" && (
        <div className="control-center__body">
          <div className="skills-panel__card-title">
            Memories {memoryStats ? <small>({fmtCount(memoryStats.records || 0)} records)</small> : null}
          </div>
          <div className="control-center__row">
            <input
              className="settings__input"
              placeholder="Search memories in plain language…"
              value={memorySearch}
              onChange={event => setMemorySearch(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter") handleMemorySearch(); }}
            />
            <button type="button" className="ghost" onClick={handleMemorySearch}>Search</button>
          </div>
          <div className="control-center__list">
            {memoryResults.length === 0 && <div className="control-center__kv">Type a search above (e.g. "what did the user prefer").</div>}
            {memoryResults.map(item => (
              <div key={item.id} className="control-center__list-item">
                <span className="mono">{item.score}</span>
                <span>{item.text}</span>
                <small className="tag">{item.layer}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "knowledge" && (
        <div className="control-center__body">
          <div className="skills-panel__card-title">Knowledge Base</div>
          <div className="control-center__kv">
            Docs: {knowledgeStats ? fmtCount(knowledgeStats.docCount) : "?"} · Chunks: {knowledgeStats ? fmtCount(knowledgeStats.chunkCount) : "?"}
          </div>
          <div className="control-center__row">
            <input
              className="settings__input"
              placeholder="Search your documents (RAG)…"
              value={knowledgeSearch}
              onChange={event => setKnowledgeSearch(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter") handleKnowledgeSearch(); }}
            />
            <button type="button" className="ghost" onClick={handleKnowledgeSearch}>Search</button>
          </div>
          <div className="control-center__list">
            {knowledgeResults.length === 0 && <div className="control-center__kv">Type a search above to query ingested documents.</div>}
            {knowledgeResults.map(item => (
              <div key={item.chunkId} className="control-center__list-item">
                <small className="tag">{item.docName}</small>
                <span>{item.text}</span>
                <small>{(item.score * 100).toFixed(0)}%</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "graph" && (
        <div className="control-center__body">
          <KnowledgeGraph wormgpt={wormgpt} />
        </div>
      )}

      {tab === "storageEye" && (() => {
        const s = learnedStorage || { skills: 0, docs: 0, chunks: 0, memories: 0 };
        const total = (s.skills || 0) + (s.docs || 0) + (s.chunks || 0) + (s.memories || 0);
        const cap = 100000;
        const pct = Math.min(100, Math.round((total / cap) * 100));
        return (
          <div className="control-center__body">
            <div className="control-center__card" style={{ background: "linear-gradient(135deg, rgba(255,77,109,0.1), rgba(124,92,255,0.1))", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="skills-panel__card-title">Storage Eye</div>
              <div className="control-center__kv" style={{ marginBottom: 8 }}>
                Skills: {s.skills} · Docs: {s.docs} · Chunks: {s.chunks} · Memories: {s.memories}
              </div>
              <div style={{ position: "relative", height: 20, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: "linear-gradient(90deg, #ff4d6d, #7c5cff, #00d4ff)", boxShadow: "0 0 18px rgba(124,92,255,0.6)", transition: "width 0.8s", borderRadius: 999 }} />
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)", animation: "kg-shimmer 2.4s linear infinite", borderRadius: 999 }} />
              </div>
              <div className="control-center__kv" style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
                <span><strong>{total.toLocaleString()}</strong> learned units</span>
                <span>{pct}% of {cap.toLocaleString()} capacity</span>
              </div>
            </div>
            <KnowledgeGraph wormgpt={wormgpt} />
          </div>
        );
      })()}

      {tab === "research" && (
        <div className="control-center__body">
          <div className="skills-panel__card-title">Web Research</div>
          <div className="control-center__row">
            <input
              className="settings__input"
              placeholder="Research question…"
              value={researchQuery}
              onChange={event => setResearchQuery(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter") handleRunResearch(); }}
            />
            <button type="button" className="ghost" disabled={busy} onClick={handleRunResearch}>
              {busy ? "Researching…" : "Run"}
            </button>
          </div>
          {researchState && (
            <div className="control-center__list">
              {(researchState.report && researchState.report.sources || []).map(source => (
                <div key={source.url} className="control-center__list-item">
                  <small className="tag">{String(source.injection && source.injection.severity || "safe")}</small>
                  <span>{source.title}</span>
                  <a className="ghost" href="#" onClick={event => { event.preventDefault(); window.open(source.url, "_blank", "noopener"); }}>Open</a>
                </div>
              ))}
            </div>
          )}
          <div className="control-center__kv control-center__note">
            Sources are fetched with SSRF guards, prompt-injection detection, and size caps. Nothing is sent to the cloud.
          </div>
        </div>
      )}

      {tab === "agents" && (
        <div className="control-center__body">
          <div className="skills-panel__card-title">Agent Runner</div>
          <div className="control-center__row">
            <textarea
              className="settings__input control-center__textarea"
              placeholder="Give the agent a multi-step task (e.g. 'Inspect the machine and report CPU, RAM and OS; then compute 7×8.')"
              value={agentTask}
              onChange={event => setAgentTask(event.target.value)}
            />
          </div>
          <div className="control-center__row">
            <button type="button" className="ghost" disabled={agentRunning} onClick={handleRunAgent}>
              {agentRunning ? "Running…" : "Run Agent"}
            </button>
          </div>
        </div>
      )}

      {tab === "learning" && (
        <div className="control-center__body">
          <div className="skills-panel__card-title">Learning &amp; Versioning</div>
          <div className="control-center__kv">
            Active snapshot: <strong>{activeVersion ? activeVersion.label || activeVersion.id : "—"}</strong>
          </div>
          <div className="control-center__kv">Improvement proposals: {proposals.length}</div>
          <div className="control-center__row">
            <button
              type="button"
              className="ghost"
              onClick={async () => {
                try {
                  const created = await wormgpt?.proposalsGenerate?.();
                  setMessage(`Generated ${(created || []).length} proposal(s).`);
                  const proposalsRes = await wormgpt?.proposalsList?.();
                  safeSet(setProposals, proposalsRes || []);
                } catch (err) { setMessage(String((err && err.message) || err)); }
              }}
            >
              Generate Improvement Proposals
            </button>
            <button
              type="button"
              className="ghost"
              onClick={async () => {
                try {
                  await wormgpt?.versionsSnapshot?.({ label: "manual snapshot", sections: { routing: true } });
                  const [proposalsRes, versionsRes] = await Promise.all([
                    wormgpt?.proposalsList?.(),
                    wormgpt?.versionsList?.()
                  ]);
                  safeSet(setProposals, proposalsRes || []);
                  safeSet(setVersions, versionsRes || []);
                  setMessage("Snapshot created.");
                } catch (err) { setMessage(String((err && err.message) || err)); }
              }}
            >
              Snapshot Now
            </button>
          </div>
          {proposals.length > 0 && (
            <div className="control-center__list">
              {proposals.map(proposal => (
                <div key={proposal.id} className="control-center__list-item is-column">
                  <span><small className="tag">{proposal.kind}</small> {proposal.summary || proposal.title || proposal.id}</span>
                  {proposal.reason && <small className="mono">{String(proposal.reason).slice(0, 160)}</small>}
                  <span>
                    {proposal.applied
                      ? <small className="tag is-done">Applied</small>
                      : (
                        <button type="button" className="ghost" onClick={() => handleApplyProposal(proposal)}>
                          Apply
                        </button>
                      )}
                  </span>
                </div>
              ))}
            </div>
          )}
          {versions.length > 0 && (
            <>
              <div className="skills-panel__card-title">Versions</div>
              <div className="control-center__list">
                {versions.map(version => (
                  <div key={version.id} className="control-center__list-item">
                    <span><strong>{version.label || version.id}</strong> <small className="tag">{version.status || "snapshot"}</small></span>
                    <button type="button" className="ghost" onClick={() => handleRevert(version)}>Revert</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "decensor" && (
        <div className="control-center__body">
          <div className="skills-panel__card-title">Heretic Decensor (Automatic Censorship Removal)</div>
          <div className="control-center__kv control-center__note">
            Runs <a href="https://github.com/p-e-w/heretic" target="_blank" rel="noopener">Heretic</a> to automatically remove safety alignment from transformer models. Requires <code>pip install -U heretic-llm</code>.
          </div>
          <div className="control-center__row">
            <input
              className="settings__input"
              placeholder="Model ID (e.g., Qwen/Qwen3-4B-Instruct-2507)"
              value={decensorModel}
              onChange={event => setDecensorModel(event.target.value)}
            />
            <select className="settings__input" value={decensorQuant} onChange={event => setDecensorQuant(event.target.value)}>
              <option value="bnb_4bit">bnb_4bit (4-bit quantization, lower VRAM)</option>
              <option value="none">none (full precision)</option>
            </select>
          </div>
          <div className="control-center__row">
            <button
              type="button"
              className="ghost"
              disabled={decensorRunning || !decensorModel.trim()}
              onClick={async () => {
                setDecensorRunning(true);
                setMessage("Decensoring... this can take 20-60 minutes.");
                try {
                  const res = await wormgpt?.hereticDecensor?.({ model: decensorModel.trim(), quantization: decensorQuant, confirmed: true });
                  setMessage(res && res.ok ? `Decensor complete: ${res.result?.model} (use in Ollama)` : `Failed: ${res?.result?.error || res?.error}`);
                  setDecensorModel("");
                } catch (err) {
                  setMessage("Error: " + ((err && err.message) || err));
                } finally {
                  setDecensorRunning(false);
                }
              }}
            >
              {decensorRunning ? "Decensoring… (runs in background)" : "Start Decensor"}
            </button>
          </div>
          <div className="control-center__kv control-center__note">
            Output model will be registered with Ollama automatically if successful. Check the Models tab.
          </div>
        </div>
      )}
    </div>
  );
}