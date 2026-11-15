import { useEffect, useState } from "react";

const MODES = ["chat", "research", "coding", "file-manager", "computer", "autonomous", "analysis"];
const PERMISSIONS = [
  ["read", "Read files"],
  ["write", "Write files"],
  ["delete", "Delete files"],
  ["execute", "Execute commands"],
  ["browser", "Browser access"],
  ["network", "Network access"],
  ["applicationAccess", "Application access"]
];

export default function AgentPanel() {
  const [config, setConfig] = useState(null);
  const [audit, setAudit] = useState([]);
  const [status, setStatus] = useState("");
  const [directory, setDirectory] = useState("");

  async function load() {
    if (!window.wormgpt?.loadAgent) return;
    const [agent, entries] = await Promise.all([
      window.wormgpt.loadAgent(),
      window.wormgpt.loadAudit()
    ]);
    setConfig(agent);
    setAudit(entries || []);
  }

  useEffect(() => {
    load().catch(() => setStatus("Agent settings unavailable."));
  }, []);

  if (!config) return <div className="agent-panel">Loading agent controls...</div>;

  function update(patch) {
    setConfig(current => ({ ...current, ...patch }));
  }

  async function save() {
    try {
      const saved = await window.wormgpt.saveAgent(config);
      setConfig(saved);
      setAudit(await window.wormgpt.loadAudit());
      setStatus("Agent settings saved.");
    } catch (err) {
      setStatus(err?.message || "Could not save agent settings.");
    }
  }

  function addDirectory() {
    const value = directory.trim();
    if (!value) return;
    update({ authorizedDirectories: [...new Set([...config.authorizedDirectories, value])] });
    setDirectory("");
  }

  return (
    <div className="agent-panel">
      <div className="settings__title">Agent Controls</div>
      <select value={config.mode} onChange={event => update({ mode: event.target.value })}>
        {MODES.map(mode => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
      </select>
      <label className="agent-panel__toggle">
        <input type="checkbox" checked={config.confirmationRequired} onChange={event => update({ confirmationRequired: event.target.checked })} />
        Confirm medium and high-risk actions
      </label>
      <div className="agent-panel__label">Permissions</div>
      <div className="agent-panel__permissions">
        {PERMISSIONS.map(([name, label]) => (
          <label key={name} className="agent-panel__toggle">
            <input
              type="checkbox"
              checked={Boolean(config.permissions[name])}
              onChange={event => update({ permissions: { ...config.permissions, [name]: event.target.checked } })}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="agent-panel__label">Authorized directories</div>
      <div className="agent-panel__directory-add">
        <input value={directory} placeholder="C:\\Projects\\MyApp" onChange={event => setDirectory(event.target.value)} />
        <button type="button" onClick={addDirectory}>Add</button>
      </div>
      {config.authorizedDirectories.map(item => (
        <div className="agent-panel__directory" key={item}>
          <span>{item}</span>
          <button type="button" onClick={() => update({ authorizedDirectories: config.authorizedDirectories.filter(path => path !== item) })}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={save}>Save Agent Settings</button>
      <div className="agent-panel__label">Recent activity</div>
      <div className="agent-panel__audit">
        {audit.length === 0 && <span>No agent actions recorded.</span>}
        {audit.slice(0, 8).map((entry, index) => (
          <div key={`${entry.timestamp}-${index}`}>
            <strong>{entry.result}</strong> {entry.tool}.{entry.action}
          </div>
        ))}
      </div>
      <button type="button" className="settings__revoke" onClick={async () => { await window.wormgpt.clearAudit(); setAudit([]); }}>Clear Activity
      </button>
      {status && <div className="settings__status is-info">{status}</div>}
    </div>
  );
}
