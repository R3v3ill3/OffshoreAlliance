"use client";

import { Info } from "lucide-react";

type TermHintProps = {
  term: string;
  hint: string;
  className?: string;
};

export function TermHint({ term, hint, className }: TermHintProps) {
  return (
    <span className={className ?? "inline-flex items-center gap-1"}>
      <span>{term}</span>
      <Info
        className="h-3.5 w-3.5 text-muted-foreground/80"
        title={hint}
        aria-label={hint}
      />
    </span>
  );
}
