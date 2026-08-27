"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** One searchable worker on the wall chart. */
export type WorkerSearchItem = {
  workerId: number;
  /** "First Last" (used as the primary label + main search text). */
  name: string;
  /** Unit(s) the worker sits in, or "Unassigned". Shown + searchable. */
  unitLabel: string | null;
  /** Optional secondary hint (occupation / role). Shown + searchable. */
  sublabel?: string | null;
};

const MAX_RESULTS = 50;
const PREVIEW_COUNT = 12;

/**
 * Typeahead worker search for the wall chart. The list is generated as the
 * user types (client-side filter over the already-loaded campaign members).
 * Selecting a worker fires `onSelect` — the wall chart then centres that
 * worker's unit card and opens the worker detail sheet.
 */
export function WorkerSearch({
  items,
  onSelect,
  disabled,
  buttonLabel = "Find worker",
}: {
  items: WorkerSearchItem[];
  onSelect: (workerId: number) => void;
  disabled?: boolean;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, PREVIEW_COUNT);
    const tokens = q.split(/\s+/).filter(Boolean);
    const out: WorkerSearchItem[] = [];
    for (const it of items) {
      const hay =
        `${it.name} ${it.unitLabel ?? ""} ${it.sublabel ?? ""}`.toLowerCase();
      if (tokens.every((t) => hay.includes(t))) {
        out.push(it);
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [items, query]);

  const handleSelect = (workerId: number) => {
    onSelect(workerId);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs print:hidden"
          disabled={disabled}
        >
          <Search className="mr-1 h-3.5 w-3.5" aria-hidden />
          {buttonLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* shouldFilter=false: we filter ourselves so we can cap the result
            list and keep large campaigns responsive. */}
        <Command shouldFilter={false} className="rounded-md">
          <CommandInput
            autoFocus
            placeholder="Search workers by name…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No workers match “{query.trim()}”.</CommandEmpty>
            {results.length > 0 && (
              <CommandGroup
                heading={
                  query.trim()
                    ? `${results.length}${
                        results.length >= MAX_RESULTS ? "+" : ""
                      } match${results.length === 1 ? "" : "es"}`
                    : "Start typing to search"
                }
              >
                {results.map((it) => (
                  <CommandItem
                    key={it.workerId}
                    value={String(it.workerId)}
                    onSelect={() => handleSelect(it.workerId)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{it.name}</span>
                      {it.sublabel ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          · {it.sublabel}
                        </span>
                      ) : null}
                    </span>
                    {it.unitLabel ? (
                      <span className="shrink-0 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                        {it.unitLabel}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
