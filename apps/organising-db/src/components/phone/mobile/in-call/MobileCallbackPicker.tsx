"use client";

import { useMemo } from "react";

interface MobileCallbackPickerProps {
  value: string | null;
  onChange: (next: string | null) => void;
}

/**
 * Native-input date/time picker for callbacks. Uses `datetime-local` for the
 * best mobile keyboard. Value is round-tripped as ISO-8601 (UTC) so the API
 * can hand it straight to `record_call_attempt`.
 */
export function MobileCallbackPicker({ value, onChange }: MobileCallbackPickerProps) {
  const localValue = useMemo(() => {
    if (!value) return "";
    const d = new Date(value);
    const offset = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  }, [value]);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Schedule callback
      </label>
      <input
        type="datetime-local"
        value={localValue}
        onChange={(event) => {
          const v = event.target.value;
          if (!v) {
            onChange(null);
            return;
          }
          onChange(new Date(v).toISOString());
        }}
        className="h-12 w-full rounded-xl border bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p className="text-[11px] text-muted-foreground">
        The contact will surface again at this time when callers ask for the next contact.
      </p>
    </div>
  );
}
