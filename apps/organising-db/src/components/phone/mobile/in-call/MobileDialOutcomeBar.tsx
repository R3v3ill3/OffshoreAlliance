"use client";

import {
  Phone,
  PhoneOff,
  Voicemail,
  PhoneMissed,
  Ban,
  AlertCircle,
  Clock,
} from "lucide-react";
import type { DialDisposition } from "@/types/planner-types";

const DIAL_OPTIONS: { value: DialDisposition; label: string; icon: typeof Phone; tone: string }[] = [
  { value: "connected", label: "Connected", icon: Phone, tone: "bg-emerald-100 text-emerald-800" },
  { value: "no_answer", label: "No answer", icon: PhoneOff, tone: "bg-slate-100 text-slate-700" },
  { value: "voicemail_left", label: "Voicemail (left message)", icon: Voicemail, tone: "bg-blue-100 text-blue-800" },
  { value: "voicemail_no_message", label: "Voicemail (no message)", icon: Voicemail, tone: "bg-slate-100 text-slate-700" },
  { value: "busy", label: "Busy", icon: PhoneMissed, tone: "bg-amber-100 text-amber-800" },
  { value: "wrong_number", label: "Wrong number", icon: AlertCircle, tone: "bg-rose-100 text-rose-800" },
  { value: "do_not_call", label: "Do not call", icon: Ban, tone: "bg-rose-100 text-rose-900" },
  { value: "callback_requested", label: "Asked for callback", icon: Clock, tone: "bg-purple-100 text-purple-800" },
];

interface MobileDialOutcomeBarProps {
  value: DialDisposition | null;
  onSelect: (value: DialDisposition) => void;
}

/**
 * Pick-one dial outcome bar. Connected leads into the conversation flow;
 * every other option short-circuits to the outcome wheel.
 */
export function MobileDialOutcomeBar({ value, onSelect }: MobileDialOutcomeBarProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        What happened on the call?
      </p>
      <div className="grid grid-cols-2 gap-2">
        {DIAL_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              aria-pressed={selected}
              className={`inline-flex min-h-[56px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition active:scale-[0.98] ${
                selected ? `${option.tone} border-current shadow` : "border-muted-foreground/20 bg-card hover:bg-muted/40"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
