import { useEffect, useState } from "react";

export default function ModelSelector({ 
  model, 
  onModelChange, 
  onProviderChange,
  onRefreshProviders,
  disabled 
}) {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeProviderId, setActiveProviderId] = useState("");
  const [activeModel, setActiveModel] = useState(model || "");
  const [providerModels, setProviderModels] = useState({});
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (!window.wormgpt?.listProviders) {
      setLoading(false);
      return;
    }
    loadProviders();
  }, []);

  useEffect(() => {
    setActiveModel(model || "");
  }, [model]);

  async function loadProviders() {
    try {
      const result = await window.wormgpt.listProviders();
      if (result?.providers) {
        const enabledProviders = result.providers.filter(p => p.enabled);
        setProviders(enabledProviders);
        if (enabledProviders.length > 0) {
          const first = enabledProviders[0];
          setActiveProviderId(first.id);
          await loadModelsForProvider(first.id);
        }
      }
    } catch (err) {
      console.error("Failed to load providers:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadModelsForProvider(providerId) {
    if (providerModels[providerId]) return;
    try {
      const models = await window.wormgpt.listProviderModels(providerId);
      setProviderModels(prev => ({ ...prev, [providerId]: models }));
    } catch (err) {
      console.error(`Failed to load models for ${providerId}:`, err);
      setProviderModels(prev => ({ ...prev, [providerId]: [] }));
    }
  }

  async function handleProviderChange(providerId) {
    setActiveProviderId(providerId);
    await loadModelsForProvider(providerId);
    const models = providerModels[providerId] || [];
    const defaultModel = providers.find(p => p.id === providerId)?.model || models[0] || "";
    setActiveModel(defaultModel);
    if (onProviderChange) onProviderChange(providerId, defaultModel);
  }

  function handleModelChange(modelName) {
    setActiveModel(modelName);
    if (onModelChange) onModelChange(activeProviderId, modelName);
  }

  const currentProvider = providers.find(p => p.id === activeProviderId);
  const currentModels = providerModels[activeProviderId] || [];
  const displayLabel = currentProvider 
    ? `${currentProvider.label}${activeModel ? ` / ${activeModel}` : ""}`
    : activeModel || "Select model";

  if (loading) {
    return (
      <div className="model-selector">
        <button className="model-selector__trigger" disabled>
          Loading...
        </button>
      </div>
    );
  }

  return (
    <div className="model-selector">
      <button
        type="button"
        className="model-selector__trigger"
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={disabled}
      >
        <span className="model-selector__icon">🤖</span>
        <span className="model-selector__label">{displayLabel}</span>
        <span className="model-selector__chevron">{showDropdown ? "▲" : "▼"}</span>
      </button>

      {showDropdown && (
        <div className="model-selector__dropdown">
          <div className="model-selector__providers">
            {providers.map(provider => (
              <button
                key={provider.id}
                type="button"
                className={`model-selector__provider ${activeProviderId === provider.id ? "is-active" : ""}`}
                onClick={() => handleProviderChange(provider.id)}
                disabled={disabled}
              >
                <span className="model-selector__provider-label">{provider.label}</span>
                <span className="model-selector__provider-kind">{provider.kind === "local" ? "🏠" : "☁️"}</span>
                {provider.hasKey ? <span className="model-selector__key-badge">🔑</span> : 
                 provider.requiresKey ? <span className="model-selector__key-badge missing">🔓</span> : null}
              </button>
            ))}
          </div>

          {currentProvider && (
            <div className="model-selector__models">
              <div className="model-selector__section-title">
                Models for {currentProvider.label}
              </div>
              {currentModels.length > 0 ? (
                currentModels.map(modelName => (
                  <button
                    key={modelName}
                    type="button"
                    className={`model-selector__model ${activeModel === modelName ? "is-active" : ""}`}
                    onClick={() => handleModelChange(modelName)}
                    disabled={disabled}
                  >
                    {modelName}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  className="model-selector__model is-loading"
                  disabled
                >
                  Loading models...
                </button>
              )}
            </div>
          )}

          <div className="model-selector__actions">
            <button 
              type="button" 
              className="ghost" 
              onClick={onRefreshProviders}
              disabled={disabled}
            >
              🔄 Refresh Providers
            </button>
            <button 
              type="button" 
              className="ghost" 
              onClick={() => window.wormgpt?.systemStatus?.().then(r => console.log(r))}
              disabled={disabled}
            >
              📊 System Status
            </button>
          </div>
        </div>
      )}
    </div>
  );
}