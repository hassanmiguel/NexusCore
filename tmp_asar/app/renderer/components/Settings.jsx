import { useEffect, useState } from "react";
import { THEMES, isValidTheme, DEFAULT_FONT_SIZE } from "../theme.js";

const PROVIDERS = {
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile"
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-oss-20b:free"
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini"
  },
  together: {
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    model: "meta-llama/Llama-3.3-70B-Instruct-Turbo"
  },
  ollama: {
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2"
  },
  custom: {
    label: "Custom OpenAI-compatible",
    baseUrl: "",
    model: ""
  }
};

export default function Settings({
  onKeySaved,
  systemPrompt,
  onSystemPromptChange,
  accent,
  onAccentChange,
  fontSize,
  onFontSizeChange
}) {
  const [provider, setProvider] = useState("groq");
  const [baseUrl, setBaseUrl] = useState(PROVIDERS.groq.baseUrl);
  const [model, setModel] = useState(PROVIDERS.groq.model);
  const [key, setKey] = useState("");
  const [temperature, setTemperature] = useState(0.5);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [status, setStatus] = useState({ message: "", tone: "info" });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const isBusy = isSaving || isTesting || isRevoking;

  useEffect(() => {
    let cancelled = false;
    async function loadProvider() {
      if (!window.wormgpt || !window.wormgpt.loadProvider) return;
      try {
        const saved = await window.wormgpt.loadProvider();
        if (cancelled || !saved) return;
        setBaseUrl(saved.baseUrl || PROVIDERS.groq.baseUrl);
        setModel(saved.model || PROVIDERS.groq.model);
        setTemperature(Number.isFinite(saved.temperature) ? saved.temperature : 0.5);
        setMaxTokens(Number.isFinite(saved.maxTokens) ? saved.maxTokens : 1024);
        setProvider(
          Object.keys(PROVIDERS).find(name => PROVIDERS[name].baseUrl === saved.baseUrl) || "custom"
        );
      } catch (err) {
        // Keep the defaults when provider settings are unavailable.
      }
    }
    loadProvider();
    if (window.wormgpt?.loadProfiles) {
      window.wormgpt.loadProfiles().then(setProfiles).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  function selectProvider(value) {
    setProvider(value);
    if (value !== "custom") {
      setBaseUrl(PROVIDERS[value].baseUrl);
      setModel(PROVIDERS[value].model);
    }
  }

  function getConfig() {
    return {
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      apiKey: key.trim(),
      temperature: Number(temperature),
      maxTokens: Number(maxTokens)
    };
  }

  async function refreshOllama() {
    try {
      const models = await window.wormgpt.listOllamaModels();
      setOllamaModels(models);
      setStatus({ message: `${models.length} Ollama model(s) found.`, tone: "ok" });
    } catch (err) {
      setStatus({ message: "Ollama is not reachable.", tone: "error" });
    }
  }

  async function downloadOllama() {
    if (!model.trim()) return;
    setStatus({ message: `Downloading ${model.trim()}...`, tone: "info" });
    try {
      await window.wormgpt.pullOllamaModel(model.trim());
      await refreshOllama();
      setStatus({ message: "Ollama model downloaded.", tone: "ok" });
    } catch (err) {
      setStatus({ message: err?.message || "Ollama download failed.", tone: "error" });
    }
  }

  async function saveProfile() {
    if (!profileName.trim()) return;
    const profile = { name: profileName.trim(), config: getConfig() };
    await window.wormgpt.saveProfile(profile);
    setProfiles(current => [...current.filter(item => item.name !== profile.name), profile]);
    setStatus({ message: "Profile saved.", tone: "ok" });
  }

  function loadProfile(profile) {
    const config = profile.config || {};
    setBaseUrl(config.baseUrl || "");
    setModel(config.model || "");
    setTemperature(config.temperature ?? 0.5);
    setMaxTokens(config.maxTokens ?? 1024);
    setKey("");
    setProvider("custom");
    setStatus({ message: `${profile.name} loaded. Enter the key if needed.`, tone: "info" });
  }

  async function save() {
    const config = getConfig();
    if (!config.baseUrl || !config.model) {
      setStatus({ message: "Enter a base URL and model first.", tone: "error" });
      return;
    }

    setIsSaving(true);
    setStatus({ message: "", tone: "info" });
    try {
      await window.wormgpt.saveProvider(config);
      setStatus({ message: "Provider saved.", tone: "ok" });
      setKey("");
      if (onKeySaved) {
        await onKeySaved();
      }
    } catch (err) {
      setStatus({ message: "Failed to save key.", tone: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function test() {
    setIsTesting(true);
    setStatus({ message: "", tone: "info" });
    try {
      const result = await window.wormgpt.testProvider(getConfig());
      if (result && result.ok) {
        setStatus({ message: "Provider reachable.", tone: "ok" });
      } else {
        setStatus({
          message: result && result.message ? result.message : "Key test failed.",
          tone: "error"
        });
      }
    } catch (err) {
      setStatus({
        message: err && err.message ? err.message : "Key test failed.",
        tone: "error"
      });
    } finally {
      setIsTesting(false);
    }
  }

  async function revoke() {
    setIsRevoking(true);
    setStatus({ message: "", tone: "info" });
    try {
      await window.wormgpt.revokeProvider();
      setStatus({ message: "Saved provider key removed.", tone: "ok" });
      setKey("");
      if (onKeySaved) {
        await onKeySaved();
      }
    } catch (err) {
      setStatus({ message: "Failed to revoke key.", tone: "error" });
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <div className="settings">
      <div className="settings__title">Bring Your Own Provider</div>
      <div className="agent-panel__label">
        Tip: Groq is the fastest cloud option; local Ollama and free OpenRouter models are often slower.
      </div>
      <textarea
        className="settings__prompt"
        placeholder="System prompt"
        value={systemPrompt || ""}
        onChange={e => onSystemPromptChange(e.target.value)}
        disabled={isBusy}
      />
      <select value={provider} onChange={e => selectProvider(e.target.value)} disabled={isBusy}>
        {Object.entries(PROVIDERS).map(([value, option]) => (
          <option key={value} value={value}>{option.label}</option>
        ))}
      </select>
      <input
        type="url"
        placeholder="OpenAI-compatible base URL"
        value={baseUrl}
        onChange={e => setBaseUrl(e.target.value)}
        disabled={isBusy}
      />
      {provider === "ollama" && (
        <div className="settings__actions">
          <button type="button" onClick={refreshOllama} disabled={isBusy}>Refresh Models</button>
          <button type="button" onClick={downloadOllama} disabled={isBusy || !model.trim()}>Download Model</button>
        </div>
      )}
      {provider === "ollama" && ollamaModels.length > 0 && (
        <select value={ollamaModels.includes(model) ? model : ""} onChange={e => e.target.value && setModel(e.target.value)} disabled={isBusy}>
          <option value="">Installed Ollama models</option>
          {ollamaModels.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      )}
      <label className="settings__range">
        Temperature: {Number(temperature).toFixed(1)}
        <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={e => setTemperature(e.target.value)} disabled={isBusy} />
      </label>
      <label className="settings__range">
        Max tokens: {maxTokens}
        <input type="range" min="128" max="8192" step="128" value={maxTokens} onChange={e => setMaxTokens(e.target.value)} disabled={isBusy} />
      </label>
      <input
        type="text"
        placeholder="Model name"
        value={model}
        onChange={e => setModel(e.target.value)}
        disabled={isBusy}
      />
      <input
        type="password"
        placeholder="API key (optional for local providers)"
        value={key}
        onChange={e => setKey(e.target.value)}
        disabled={isBusy}
      />
      <div className="settings__actions">
        <button type="button" onClick={save} disabled={isBusy}>
          {isSaving ? "Saving..." : "Save Provider"}
        </button>
        <button type="button" onClick={test} disabled={isBusy}>
          {isTesting ? "Testing..." : "Test Provider"}
        </button>
      </div>
      <button
        type="button"
        className="settings__revoke"
        onClick={revoke}
        disabled={isBusy}
      >
        {isRevoking ? "Revoking..." : "Revoke Key"}
      </button>
      <div className="settings__profile">
        <input type="text" placeholder="Profile name" value={profileName} onChange={e => setProfileName(e.target.value)} disabled={isBusy} />
        <button type="button" onClick={saveProfile} disabled={isBusy || !profileName.trim()}>Save Profile</button>
      </div>
      {profiles.length > 0 && (
        <select value="" onChange={e => e.target.value && loadProfile(profiles.find(profile => profile.name === e.target.value))} disabled={isBusy}>
          <option value="">Load saved profile</option>
          {profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}</option>)}
        </select>
      )}

      <div className="settings__title">Appearance</div>
      <div className="settings__swatches">
        {THEMES.map(theme => (
          <button
            key={theme.id}
            type="button"
            className={`swatch ${theme.id === accent ? "is-active" : ""}`}
            style={{ "--swatch": `${theme.rgb}` }}
            title={theme.label}
            onClick={() => onAccentChange(theme.id)}
          />
        ))}
      </div>
      <label className="settings__range">
        Chat font size: {Math.round((Number(fontSize) || DEFAULT_FONT_SIZE) * 100)}%
        <input type="range" min="0.85" max="1.3" step="0.05" value={Number(fontSize) || DEFAULT_FONT_SIZE} onChange={e => onFontSizeChange(Number(e.target.value))} />
      </label>

      {status.message && (
        <div className={`settings__status is-${status.tone}`}>
          {status.message}
        </div>
      )}
    </div>
  );
}