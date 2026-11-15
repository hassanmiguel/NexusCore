import { useState, useRef, useEffect } from "react";
import Markdown from "./Markdown.jsx";

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Message({
  role,
  text,
  pending = false,
  timestamp,
  canRegenerate = false,
  onCopy,
  onRegenerate,
  onEdit,
  onBranch,
  messageIndex,
  threadId,
  isEditing = false,
  isBranching = false
}) {
  const isUser = role === "user";
  const [editText, setEditText] = useState(text);
  const textareaRef = useRef(null);

  const classes = [
    "message",
    isUser ? "message--user" : "message--assistant",
    pending ? "message--pending" : "",
    isEditing ? "message--editing" : ""
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [isEditing, editText]);

  function handleSave() {
    if (onEdit) onEdit(threadId, messageIndex, editText);
  }

  function handleCancel() {
    if (onEdit) onEdit(threadId, messageIndex, null);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  }

  return (
    <div className={classes}>
      {!isUser && (
        <div className="message__avatar" aria-hidden="true">
          <span className="message__avatar-worm">W</span>
        </div>
      )}
      <div className="message__body">
        <div className="message__bubble">
          <div className="message__meta">
            <span>{isUser ? "You" : "WormGPT"}</span>
            {timestamp && <span className="message__time">{formatTime(timestamp)}</span>}
            {isEditing && <span className="message__time editing-indicator">✎ Editing</span>}
            {isBranching && <span className="message__time branching-indicator">⌕ Branching</span>}
          </div>
          <div className="message__text">
            {pending ? (
              <span className="message__typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            ) : isEditing ? (
              <textarea
                ref={textareaRef}
                className="message__edit-textarea"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={4}
                spellCheck={false}
              />
            ) : (
              <Markdown text={text} />
            )}
          </div>
          {isEditing && (
            <div className="message__edit-actions">
              <button type="button" className="message__action" onClick={handleSave}>
                Save (Ctrl+Enter)
              </button>
              <button type="button" className="message__action" onClick={handleCancel}>
                Cancel (Esc)
              </button>
            </div>
          )}
        </div>
        <div className="message__actions">
          <button type="button" className="message__action" onClick={() => onCopy(text)}>
            Copy
          </button>
          {canRegenerate && (
            <button type="button" className="message__action" onClick={onRegenerate}>
              Regenerate
            </button>
          )}
          {!pending && !isEditing && (
            <>
              {isUser && onEdit && (
                <button type="button" className="message__action" onClick={() => onEdit(threadId, messageIndex, text)}>
                  Edit
                </button>
              )}
              {onBranch && (
                <button type="button" className="message__action" onClick={() => onBranch(threadId, messageIndex)}>
                  Branch
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}