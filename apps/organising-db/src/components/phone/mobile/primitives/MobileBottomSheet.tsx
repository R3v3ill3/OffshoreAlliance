"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional aria description. */
  description?: string;
  /** Action shown in the header (e.g. "Save"). */
  trailingAction?: ReactNode;
  children: ReactNode;
}

/**
 * Pull-up bottom sheet used for objections, issues, callback scheduling,
 * script display, etc. Implements minimum-viable focus trap + escape-to-close
 * keyboard handling. Visual styling matches the dialer design tokens.
 */
export function MobileBottomSheet({
  open,
  onClose,
  title,
  description,
  trailingAction,
  children,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    const node = sheetRef.current;
    if (node) {
      const focusable = node.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
      previousActive?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-describedby={description ? "mobile-sheet-desc" : undefined}
      className="fixed inset-0 z-50 flex flex-col bg-black/40 motion-reduce:transition-none"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="grow" />
      <div
        ref={sheetRef}
        className="flex max-h-[90dvh] flex-col rounded-t-3xl border-t bg-background shadow-2xl"
      >
        <div className="flex h-1.5 items-center justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {description ? (
              <p id="mobile-sheet-desc" className="text-xs text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {trailingAction}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-1">
          {children}
        </div>
      </div>
    </div>
  );
}
