import { useState, useRef, useEffect } from "react";

export default function VoiceInput({ onTranscript, onSpeak, disabled }) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState(null);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const recognitionRef = useRef(null);
  const synthesisRef = useRef(null);

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = "en-US";

    recognitionRef.current.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      setTranscript(finalTranscript + interimTranscript);
      if (finalTranscript && onTranscript) {
        onTranscript(finalTranscript.trim());
      }
    };

    recognitionRef.current.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Recognition error: ${event.error}`);
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setIsListening(false);
      }
    };

    recognitionRef.current.onend = () => {
      if (isListening) {
        try {
          recognitionRef.current.start();
        } catch (err) {
          setIsListening(false);
        }
      }
    };

    // Load voices for TTS
    if ("speechSynthesis" in window) {
      const loadVoices = () => {
        const availableVoices = speechSynthesis.getVoices();
        setVoices(availableVoices);
        if (availableVoices.length > 0 && !selectedVoice) {
          const preferred = availableVoices.find(v => v.lang.startsWith("en") && v.default) 
            || availableVoices.find(v => v.lang.startsWith("en")) 
            || availableVoices[0];
          setSelectedVoice(preferred);
        }
      };
      loadVoices();
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthesisRef.current) {
        speechSynthesis.cancel();
      }
    };
  }, [isListening, onTranscript, selectedVoice]);

  function startListening() {
    setError(null);
    setTranscript("");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        setError("Failed to start recognition");
      }
    }
  }

  function stopListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      setError("Speech synthesis not supported");
      return;
    }
    
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (err) => {
      setError(`Speech error: ${err.error}`);
      setIsSpeaking(false);
    };
    
    synthesisRef.current = utterance;
    speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }

  if (disabled) return null;

  return (
    <div className="voice-input">
      <div className="voice-input__controls">
        <button
          type="button"
          className={`voice-input__btn ${isListening ? "is-active" : ""}`}
          onClick={isListening ? stopListening : startListening}
          disabled={isSpeaking}
          title={isListening ? "Stop listening (Space)" : "Start listening (Space)"}
        >
          {isListening ? "🎙️" : "🎤"}
        </button>
        <button
          type="button"
          className="voice-input__btn"
          onClick={() => {
            if (isSpeaking) stopSpeaking();
            else if (transcript) speak(transcript);
          }}
          disabled={!transcript && !isSpeaking}
          title={isSpeaking ? "Stop speaking" : "Speak transcript"}
        >
          {isSpeaking ? "⏹️" : "🔊"}
        </button>
        {voices.length > 0 && (
          <select
            value={selectedVoice?.name || ""}
            onChange={e => {
              const voice = voices.find(v => v.name === e.target.value);
              setSelectedVoice(voice);
            }}
            className="voice-input__voice-select"
            title="Select voice"
          >
            {voices.map(v => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang}){v.default ? " ✓" : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {transcript && (
        <div className="voice-input__transcript">
          {transcript}
        </div>
      )}
      {error && (
        <div className="voice-input__error">{error}</div>
      )}
    </div>
  );
}