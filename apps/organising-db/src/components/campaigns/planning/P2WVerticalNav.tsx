"use client"

import type { LucideIcon } from "lucide-react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils/cn"

export interface P2WVerticalNavStep {
  id: string
  label: string
  icon: LucideIcon
}

interface P2WVerticalNavProps {
  steps: P2WVerticalNavStep[]
  activeId: string
  onChange: (id: string) => void
  isComplete: (id: string) => boolean
}

/**
 * Vertical sidebar navigation for the 5-step Playing to Win framework on a
 * stage page. Replaces the horizontal `Tabs` strip — gives the working area
 * back its full vertical real estate, surfaces each step's completion state
 * at a glance, and supports both step-through (Prev/Next in the footer) and
 * free navigation (click any step).
 */
export function P2WVerticalNav({
  steps,
  activeId,
  onChange,
  isComplete,
}: P2WVerticalNavProps) {
  return (
    <nav
      aria-label="Playing to Win steps"
      className="w-full sm:w-56 shrink-0 border-r bg-slate-50 sm:bg-white"
    >
      <ul className="flex flex-row sm:flex-col p-2 sm:p-3 gap-1 overflow-x-auto sm:overflow-visible">
        {steps.map((step, i) => {
          const Icon = step.icon
          const stepNum = i + 1
          const active = step.id === activeId
          const done = isComplete(step.id)
          return (
            <li key={step.id} className="shrink-0 sm:w-full">
              <button
                type="button"
                onClick={() => onChange(step.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                    : "text-slate-700 hover:bg-slate-100",
                  done && !active && "text-green-700"
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                    done
                      ? "bg-green-100 text-green-800"
                      : active
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-500"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : stepNum}
                </span>
                <Icon className="h-4 w-4 sm:hidden" />
                <span className="hidden sm:inline truncate">{step.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
