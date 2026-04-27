"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Target, Compass } from "lucide-react"

interface AmbitionRow {
  ambition_id: number
  is_achieved?: boolean | null
  custom_text?: string | null
  ambition_options?: { option_text?: string } | null
}

interface CategoryRow {
  category_id: number
  category_name: string
  description?: string | null
  /** Optional grouping computed by the parent panel for display. */
  group?: "focus" | "approach"
}

interface WhereToPlayLandingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ambitions: AmbitionRow[]
  categories: CategoryRow[]
  /**
   * Map of ambitions already linked to at least one W2P choice (used to mark
   * ambitions as "covered" in the landing dialog).
   */
  ambitionsAlreadyLinked: Set<number>
  onJumpToCategory: (categoryId: number, ambitionId?: number) => void
}

const FOCUS_INTRO =
  "Where-to-play makes the campaign concrete: who you'll focus on, where you'll go, and how you'll engage. Pick an ambition, then jump into the categories that drive it. Each focus area lands as a row you can prioritise, exclude, and link back to the ambition it serves."

/**
 * Dialog the panel auto-opens (or shows on demand) so organisers start their
 * Where-to-Play work from the ambition end. Each ambition row links into the
 * category groups; if it's already linked to a focus area we mark it covered.
 */
export function WhereToPlayLandingDialog({
  open,
  onOpenChange,
  ambitions,
  categories,
  ambitionsAlreadyLinked,
  onJumpToCategory,
}: WhereToPlayLandingDialogProps) {
  const [selectedAmbition, setSelectedAmbition] = useState<number | null>(
    null
  )

  const groupedCategories = useMemo(() => {
    const focus = categories.filter((c) => c.group === "focus")
    const approach = categories.filter((c) => c.group !== "focus")
    return { focus, approach }
  }, [categories])

  function ambitionLabel(a: AmbitionRow): string {
    const text = a.ambition_options?.option_text || a.custom_text || `Ambition #${a.ambition_id}`
    return text.length > 80 ? text.slice(0, 80) + "…" : text
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-blue-600" />
            Pursue an ambition
          </DialogTitle>
          <DialogDescription>{FOCUS_INTRO}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step 1: ambitions */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">
              1 · Which stage ambition are you focusing where-to-play on?
            </Label>
            {ambitions.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                No stage ambitions yet — add at least one ambition first so
                where-to-play choices have something to serve.
              </p>
            ) : (
              <ScrollArea className="max-h-44 rounded-md border">
                <ul className="divide-y">
                  {ambitions.map((a) => {
                    const isSelected = selectedAmbition === a.ambition_id
                    const isCovered = ambitionsAlreadyLinked.has(a.ambition_id)
                    return (
                      <li key={a.ambition_id}>
                        <button
                          type="button"
                          onClick={() => setSelectedAmbition(a.ambition_id)}
                          className={
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors " +
                            (isSelected
                              ? "bg-blue-50 text-blue-900"
                              : "hover:bg-muted/40")
                          }
                        >
                          <Target
                            className={
                              "h-3.5 w-3.5 shrink-0 " +
                              (isSelected ? "text-blue-600" : "text-muted-foreground")
                            }
                          />
                          <span className="flex-1 truncate">{ambitionLabel(a)}</span>
                          {a.is_achieved && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 px-1 border-green-300 text-green-700 bg-green-50"
                            >
                              Achieved
                            </Badge>
                          )}
                          {isCovered && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-4 px-1 border-blue-300 text-blue-700 bg-blue-50"
                            >
                              Covered
                            </Badge>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            )}
          </div>

          {/* Step 2: categories grouped */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              2 · Pick a focus area to start with
            </Label>
            <CategoryGroup
              title="Focus — who and where"
              hint="Decide which contacts, worksites, employers, sectors or organising units to concentrate on (or exclude)."
              categories={groupedCategories.focus}
              onJump={(categoryId) =>
                onJumpToCategory(categoryId, selectedAmbition ?? undefined)
              }
            />
            <CategoryGroup
              title="Approach — how to engage"
              hint="Pick the channels, narrative, education content and intensity that suit the ambition."
              categories={groupedCategories.approach}
              onJump={(categoryId) =>
                onJumpToCategory(categoryId, selectedAmbition ?? undefined)
              }
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <p className="text-xs text-muted-foreground self-center">
            Tip: every selected option can be linked back to an ambition later
            — start with the most important focus area first.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Skip and explore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CategoryGroup({
  title,
  hint,
  categories,
  onJump,
}: {
  title: string
  hint: string
  categories: CategoryRow[]
  onJump: (categoryId: number) => void
}) {
  if (categories.length === 0) return null
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {categories.map((c) => (
          <button
            key={c.category_id}
            type="button"
            onClick={() => onJump(c.category_id)}
            className="text-left rounded-md border p-2 hover:bg-muted/40 transition-colors"
          >
            <p className="text-sm font-medium leading-tight">
              {c.category_name}
            </p>
            {c.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                {c.description}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
