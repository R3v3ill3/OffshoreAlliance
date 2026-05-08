"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { fetchApi } from "@/lib/api/fetch-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const EXPIRY_PRESETS: { label: string; hours: number }[] = [
  { label: "2 hours", hours: 2 },
  { label: "8 hours", hours: 8 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "14 days", hours: 336 },
];

export const DEFAULT_EXPIRY_HOURS = 168;

export type IssueLinkResult = {
  url: string;
  password: string;
  expires_at: string | null;
  expires_in_hours: number;
};

export type IssueLinkDialogTarget = {
  title: string;
  endpoint: string;
  contextLabel?: string;
};

export function IssueLinkDialog({
  target,
  onClose,
  onIssued,
  title = "Issue leader link",
  passwordHelp = "The leader needs this password to open the form. Share it on a different channel from the link itself.",
  extraFields,
  extraPayload,
}: {
  target: IssueLinkDialogTarget | null;
  onClose: () => void;
  onIssued: (result: IssueLinkResult) => void;
  title?: string;
  passwordHelp?: string;
  extraFields?: ReactNode;
  extraPayload?: Record<string, unknown>;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [expiryMode, setExpiryMode] = useState<string>(String(DEFAULT_EXPIRY_HOURS));
  const [customHours, setCustomHours] = useState<string>("48");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = target !== null;

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setShowPassword(false);
    setExpiryMode(String(DEFAULT_EXPIRY_HOURS));
    setCustomHours("48");
    setError(null);
  }, [open]);

  function resolveExpiryHours(): number | null {
    if (expiryMode === "custom") {
      const n = Number(customHours);
      if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
      return n >= 2 && n <= 336 ? n : null;
    }
    const n = Number(expiryMode);
    return Number.isFinite(n) ? n : null;
  }

  async function handleSubmit() {
    if (!target) return;
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    const hours = resolveExpiryHours();
    if (hours == null) {
      setError("Expiry must be between 2 and 336 hours (14 days).");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchApi(target.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          expiresInHours: hours,
          ...(extraPayload ?? {}),
        }),
      });
      const json = (await res.json()) as {
        url?: string;
        expires_at?: string | null;
        expires_in_hours?: number;
        error?: string | { formErrors?: string[] };
      };
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : json.error?.formErrors?.[0] || "Failed to issue link";
        throw new Error(msg);
      }
      onIssued({
        url: json.url ?? "",
        password,
        expires_at: json.expires_at ?? null,
        expires_in_hours: json.expires_in_hours ?? hours,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to issue link");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {target ? (
          <p className="text-xs text-muted-foreground -mt-2">
            {target.contextLabel ?? "For"}:{" "}
            <span className="font-medium text-foreground">{target.title}</span>
          </p>
        ) : null}
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="share-password">Password (set by you, share separately)</Label>
            <div className="relative">
              <Input
                id="share-password"
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="pr-10"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{passwordHelp}</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="share-expiry">Expires in</Label>
            <Select value={expiryMode} onValueChange={setExpiryMode}>
              <SelectTrigger id="share-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_PRESETS.map((preset) => (
                  <SelectItem key={preset.hours} value={String(preset.hours)}>
                    {preset.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom...</SelectItem>
              </SelectContent>
            </Select>
            {expiryMode === "custom" ? (
              <div className="pt-2">
                <Label htmlFor="custom-hours" className="text-xs">
                  Hours (2 - 336)
                </Label>
                <Input
                  id="custom-hours"
                  type="number"
                  min={2}
                  max={336}
                  step={1}
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          {extraFields}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Issuing..." : "Issue link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
