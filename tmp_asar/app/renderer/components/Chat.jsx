import { useEffect, useRef, useState } from "react";
import Message from "./Message.jsx";
import Input from "./Input.jsx";
import ModelSelector from "./ModelSelector.jsx";

const SUGGESTIONS = [
  "Write a Python script that backs up a folder to zip",
  "Explain quantum computing like I'm 10",
  "Draft a professional email requesting a deadline extension",
  "Give me 10 ideas for a sci-fi short story"
];

function formatElapsed(seconds) {
  const s = Math.floor(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export default function Chat({
  messages,
  onSend,
  onStop,
  onRegenerate,
  isSending,
  error,
  title,
  count,
  model,
  skills,
  activeProviderId,
  activeModel,
  onProviderChange,
  onModelChange,
  onRefreshProviders,
  onEditMessage,
  onBranchMessage,
  activeThreadId,
  lastUsage,
  totalTokens
}) {
  const scrollRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  const showIntro = messages.length === 0 && !isSending;
  const lastIndex = messages.length - 1;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isSending]);

  useEffect(() => {
    if (!isSending) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - start) / 1000), 500);
    return () => clearInterval(timer);
  }, [isSending]);

  return (
    <section className="chat">
      <header className="chat__header">
        <div className="chat__header-title">
          <span className="chat__header-dot" />
          <span className="chat__header-name">{title || "New conversation"}</span>
        </div>
        <div className="chat__header-meta">
          <ModelSelector
            model={activeModel || model}
            onProviderChange={onProviderChange}
            onModelChange={onModelChange}
            onRefreshProviders={onRefreshProviders}
            disabled={isSending}
          />
          {skills > 0 && <span className="chat__header-skills">◇ {skills} skills</span>}
          <span>{count} message{count === 1 ? "" : "s"}</span>
          {isSending && <span className="chat__header-timer">streaming · {formatElapsed(elapsed)}</span>}
          {lastUsage && (
            <span className="chat__header-tokens">
              {lastUsage.promptTokens || 0}+{lastUsage.completionTokens || 0}={lastUsage.totalTokens || 0} tokens
            </span>
          )}
          {totalTokens && totalTokens.total > 0 && (
            <span className="chat__header-total-tokens" title="Session total">
              Σ {totalTokens.total.toLocaleString()} tokens
            </span>
          )}
        </div>
      </header>
      <div className="chat__stage">
        {showIntro && (
          <div className="chat__empty">
            <div className="chat__logo" aria-hidden="true" />
            <div className="chat__empty-title">WormGPT</div>
            <div className="chat__empty-sub">Unleashed and uncensored. Ask anything.</div>
            <div className="chat__suggestions">
              {SUGGESTIONS.map(suggestion => (
                <button
                  type="button"
                  key={suggestion}
                  className="chip"
                  onClick={() => onSend(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="chat__messages" ref={scrollRef}>
          {messages.map((m, i) => (
            <Message
              key={i}
              role={m.role}
              text={m.content}
              timestamp={m.timestamp}
              canRegenerate={m.role === "assistant" && i === lastIndex && !isSending}
              onCopy={text => window.wormgpt.copyText(text)}
              onRegenerate={onRegenerate}
              onEdit={onEditMessage}
              onBranch={onBranchMessage}
              messageIndex={i}
              threadId={activeThreadId}
            />
          ))}
          {isSending && <Message role="assistant" pending />}
        </div>
      </div>
      {error && <div className="chat__error">{error}</div>}
      <Input onSend={onSend} disabled={isSending} isSending={isSending} onStop={onStop} />
    </section>
  );
}