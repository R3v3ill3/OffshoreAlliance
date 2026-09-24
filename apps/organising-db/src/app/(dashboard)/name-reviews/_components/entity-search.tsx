"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NAME_ENTITY_SEARCH_MIN,
  useNameEntitySearch,
  type NameEntitySearchHit,
} from "@/lib/hooks/useNameEntitySearch";
import type { NameReviewEntity } from "@/lib/hooks/useNameMatchReviews";

interface Props {
  entity: NameReviewEntity;
  rawName: string;
  disabled: boolean;
  onPick: (hit: NameEntitySearchHit) => void;
  onCreate: () => void;
  onClose: () => void;
}

/**
 * Search existing rows and their aliases, map to one, and only then — when
 * the typed text found nothing, or the reviewer said "none of these" —
 * offer "Create new" (plan §2.5, D5: search-and-map before create).
 */
export function EntitySearch({ entity, rawName, disabled, onPick, onCreate, onClose }: Props) {
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const [noneOfThese, setNoneOfThese] = useState(false);
  const search = useNameEntitySearch(entity, debounced);
  const noun = entity === "employer" ? "employer" : "worksite";

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 250);
    return () => clearTimeout(t);
  }, [input]);

  const typed = input.trim();
  const settledForTyped =
    typed.length >= NAME_ENTITY_SEARCH_MIN &&
    debounced.trim() === typed &&
    !search.isFetching &&
    search.data !== undefined;
  const hits = settledForTyped ? (search.data ?? []) : [];
  const searchedEmpty = settledForTyped && hits.length === 0;
  const canCreate = searchedEmpty || (settledForTyped && noneOfThese);

  return (
    <div className="rounded border p-2 space-y-2 bg-muted/20" data-testid="entity-search">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          autoFocus
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setNoneOfThese(false);
          }}
          placeholder={`Search existing ${noun}s and aliases…`}
          aria-label={`Search existing ${noun}s and aliases`}
          className="h-8"
        />
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close search">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1">
        {typed.length < NAME_ENTITY_SEARCH_MIN && (
          <p className="text-xs text-muted-foreground px-1">
            Type at least {NAME_ENTITY_SEARCH_MIN} letters. Try a shorter part of “{rawName}” — the
            search covers {entity === "employer" ? "employer and trading names" : "worksite names"} and
            their aliases.
          </p>
        )}
        {typed.length >= NAME_ENTITY_SEARCH_MIN && !settledForTyped && (
          <p className="text-xs text-muted-foreground px-1 inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Searching…
          </p>
        )}
        {search.isError && (
          <p className="text-xs text-destructive px-1">{(search.error as Error).message}</p>
        )}
        {searchedEmpty && (
          <p className="text-xs text-muted-foreground px-1">No {noun}s or aliases match “{typed}”.</p>
        )}
        {hits.map((hit) => (
          <div
            key={hit.id}
            className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-accent"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{hit.name}</div>
              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2">
                {hit.via === "alias" && <span>alias “{hit.matchedText}” of {hit.name}</span>}
                {hit.via === "trading_name" && <span>trading as {hit.matchedText}</span>}
                {hit.detail && <span>{hit.detail.replace(/_/g, " ")}</span>}
                {!hit.isActive && (
                  <Badge variant="outline" className="h-4 text-[10px]">
                    Inactive
                  </Badge>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onPick(hit)}
              aria-label={`Map to ${hit.name}`}
            >
              Map to this
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hits.length > 0 && !noneOfThese && (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setNoneOfThese(true)}>
            None of these
          </Button>
        )}
        {canCreate && (
          <Button variant="outline" size="sm" disabled={disabled} onClick={onCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Create new {noun}
          </Button>
        )}
      </div>
    </div>
  );
}
