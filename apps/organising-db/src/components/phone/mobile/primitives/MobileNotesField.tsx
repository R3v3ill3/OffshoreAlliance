"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { hapticTap } from "@/lib/phone/haptics";

interface MobileNotesFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Min visible rows before scroll. */
  minRows?: number;
  label?: string;
  /** Disable the voice-to-text affordance even on supported devices. */
  disableVoice?: boolean;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly [index: number]: { readonly transcript: string; readonly confidence: number };
  isFinal?: boolean;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Auto-growing notes textarea with optional Web Speech API dictation.
 * - Grows from `minRows` (default 3) up to a max of 12 rows before scrolling.
 * - Mic button appears only on devices that support `SpeechRecognition`.
 * - Light haptic on start/stop dictation.
 */
export function MobileNotesField({
  value,
  onChange,
  placeholder = "Call notes…",
  minRows = 3,
  label,
  disableVoice,
}: MobileNotesFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognition() != null);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 12 * 24)}px`;
  }, [value]);

  const startDictation = useCallback(() => {
    const Recognizer = getSpeechRecognition();
    if (!Recognizer) return;
    const instance = new Recognizer();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = navigator.language ?? "en-AU";
    let finalised = "";

    instance.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalised += text;
        } else {
          interim += text;
        }
      }
      const combined = (value ? `${value} ` : "") + finalised + interim;
      onChange(combined.trim());
    };
    instance.onerror = () => setListening(false);
    instance.onend = () => setListening(false);

    try {
      instance.start();
      recognitionRef.current = instance;
      setListening(true);
      hapticTap();
    } catch (err) {
      console.error("dictation start failed", err);
    }
  }, [onChange, value]);

  const stopDictation = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    hapticTap();
  }, []);

  const textareaId = useId();
  return (
    <div className="space-y-1.5">
      {label ? (
        <label
          htmlFor={textareaId}
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </label>
      ) : null}
      <div className="relative">
        <textarea
          id={textareaId}
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={minRows}
          placeholder={placeholder}
          aria-label={label ?? placeholder ?? "Call notes"}
          className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-base leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {voiceSupported && !disableVoice ? (
          <button
            type="button"
            onClick={listening ? stopDictation : startDictation}
            aria-pressed={listening}
            aria-label={listening ? "Stop dictation" : "Dictate"}
            className={`absolute bottom-2 right-2 inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
              listening
                ? "bg-rose-600 text-white shadow"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      {listening ? (
        <p className="text-[11px] text-rose-600">Listening… tap mic to stop.</p>
      ) : null}
    </div>
  );
}
