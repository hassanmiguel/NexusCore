import { useRef, useState } from "react";
import VoiceInput from "./VoiceInput.jsx";
import ImageUpload from "./ImageUpload.jsx";

export default function Input({ onSend, disabled, isSending, onStop }) {
  const textareaRef = useRef(null);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function submit() {
    const value = textareaRef.current ? textareaRef.current.value : "";
    const trimmed = value.trim();
    if (!trimmed && !selectedImage) return;
    if (disabled) return;
    onSend(trimmed, selectedImage);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      resize();
    }
    setSelectedImage(null);
  }

  function handleVoiceTranscript(text) {
    setVoiceTranscript(text);
    if (textareaRef.current) {
      textareaRef.current.value = text;
      resize();
    }
  }

  function handleImageSelect(imageData) {
    setSelectedImage(imageData);
  }

  return (
    <div className={`input ${disabled ? "is-disabled" : ""}`}>
      <textarea
        ref={textareaRef}
        rows={1}
        placeholder="Ask a question... (Enter to send, Shift+Enter for a new line)"
        disabled={disabled}
        onInput={resize}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {isSending ? (
        <button type="button" className="input__send is-stop" onClick={onStop}>
          Stop
        </button>
      ) : (
        <button type="button" className="input__send" onClick={submit} disabled={disabled}>
          Send
        </button>
      )}
      <VoiceInput
        onTranscript={handleVoiceTranscript}
        onSpeak={() => {}}
        disabled={disabled || isSending}
      />
      <ImageUpload
        onImageSelect={handleImageSelect}
        disabled={disabled || isSending}
      />
    </div>
  );
}