"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { dialerTelemetry } from "@/lib/phone/telemetry";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "oa-dialer-install-prompt-dismissed";

/**
 * Renders the install-to-home-screen prompt for the mobile dialer. Listens
 * for the browser's `beforeinstallprompt` event (Chromium-based) and shows
 * a small button anchored to the bottom-left so it doesn't compete with
 * the primary call CTA.
 *
 * Dismissals are persisted to localStorage so we don't pester volunteers
 * who deliberately declined. iOS Safari doesn't fire the event, so the
 * prompt simply never appears there; the manifest still works via the
 * native "Add to Home Screen" share-sheet action.
 */
export function MobileInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") {
        setDismissed(true);
        return;
      }
    } catch {
      /* localStorage unavailable */
    }
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      dialerTelemetry.installPromptShown();
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
    };
  }, []);

  if (!deferred || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={async () => {
          try {
            await deferred.prompt();
            const choice = await deferred.userChoice;
            if (choice.outcome === "accepted") {
              dialerTelemetry.installAccepted();
            } else {
              dialerTelemetry.installDismissed();
            }
          } finally {
            setDeferred(null);
            try {
              window.localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              /* ignore */
            }
          }
        }}
        className="inline-flex items-center gap-1 font-medium"
      >
        <Download className="h-3.5 w-3.5" />
        Install dialer
      </button>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          dialerTelemetry.installDismissed();
          try {
            window.localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            /* ignore */
          }
        }}
        aria-label="Dismiss install prompt"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
