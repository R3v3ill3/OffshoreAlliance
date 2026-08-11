'use client'

/**
 * Interactive survey flow visualisation — linear question order with
 * per-answer branch edges overlaid. Click a question node to focus it
 * in the linear editor (not a canvas authoring surface).
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils/cn'
import type { SurveyEditorQuestion } from '@/components/sms/surveys/SmsSurveyEditor'

const NODE_W = 168
const NODE_H = 56
const V_GAP = 36
const PAD_X = 80
const PAD_Y = 16
const END_H = 40

interface Edge {
  from: number | 'start'
  to: number | 'end'
  label?: string
  kind: 'default' | 'branch' | 'start'
}

interface SmsSurveyFlowChartProps {
  questions: SurveyEditorQuestion[]
  selectedIndex: number | null
  onSelectQuestion: (index: number) => void
  className?: string
}

function branchableValues(q: SurveyEditorQuestion): string[] {
  if (q.qtype === 'yes_no') return ['yes', 'no']
  if (q.qtype === 'choice') {
    return q.choiceOptions.map((o) => o.value.trim()).filter(Boolean)
  }
  return []
}

function buildEdges(questions: SurveyEditorQuestion[]): Edge[] {
  const edges: Edge[] = []
  if (questions.length === 0) {
    edges.push({ from: 'start', to: 'end', kind: 'start' })
    return edges
  }
  edges.push({ from: 'start', to: 0, kind: 'start' })

  questions.forEach((q, i) => {
    const values = branchableValues(q)
    const branched = new Set(
      values.filter((v) => q.branching[v] !== undefined),
    )
    // Default next when at least one answer (or open/scale) follows order.
    const hasDefaultPath =
      values.length === 0 || values.some((v) => !branched.has(v))
    if (hasDefaultPath) {
      const next: number | 'end' = i + 1 < questions.length ? i + 1 : 'end'
      edges.push({ from: i, to: next, kind: 'default' })
    }
    for (const v of values) {
      const target = q.branching[v]
      if (target === undefined) continue
      edges.push({
        from: i,
        to: target === 'end' ? 'end' : target,
        label: v,
        kind: 'branch',
      })
    }
  })
  return edges
}

function nodeCenterY(index: number): number {
  return PAD_Y + NODE_H / 2 + index * (NODE_H + V_GAP)
}

function endCenterY(questionCount: number): number {
  return (
    PAD_Y +
    questionCount * (NODE_H + V_GAP) +
    END_H / 2
  )
}

export function SmsSurveyFlowChart({
  questions,
  selectedIndex,
  onSelectQuestion,
  className,
}: SmsSurveyFlowChartProps) {
  const edges = useMemo(() => buildEdges(questions), [questions])

  const height =
    PAD_Y * 2 +
    questions.length * (NODE_H + V_GAP) +
    END_H +
    (questions.length === 0 ? NODE_H : 0)
  const width = NODE_W + PAD_X * 2
  const centerX = width / 2

  const pathFor = (edge: Edge, side: number): string => {
    const fromY =
      edge.from === 'start'
        ? PAD_Y / 2
        : nodeCenterY(edge.from) + NODE_H / 2 - 4
    const toY =
      edge.to === 'end'
        ? endCenterY(questions.length) - END_H / 2 + 4
        : nodeCenterY(edge.to) - NODE_H / 2 + 4

    if (edge.kind === 'default' || edge.kind === 'start') {
      const x = centerX
      return `M ${x} ${fromY} L ${x} ${toY}`
    }

    // Branch curves sit alternately left/right so parallel edges don't stack.
    const sweep = 36 + Math.abs(side) * 18
    const dir = side % 2 === 0 ? -1 : 1
    const midY = (fromY + toY) / 2
    const bulgeX = centerX + dir * sweep
    return `M ${centerX} ${fromY} C ${bulgeX} ${fromY + 8}, ${bulgeX} ${toY - 8}, ${centerX} ${toY}`
  }

  let branchSide = 0

  return (
    <div
      className={cn(
        'flex h-full min-h-[280px] flex-col rounded-md border bg-muted/20',
        className,
      )}
    >
      <div className="border-b px-3 py-2">
        <p className="text-xs font-medium">Flow</p>
        <p className="text-[11px] text-muted-foreground">
          Click a question to jump to it. Solid = next; dashed = branch.
        </p>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <svg
          width={width}
          height={Math.max(height, 200)}
          className="mx-auto block"
          role="img"
          aria-label="Survey question flow chart"
        >
          <defs>
            <marker
              id="survey-flow-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
            </marker>
            <marker
              id="survey-flow-arrow-branch"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-indigo-500" />
            </marker>
          </defs>

          {edges.map((edge, ei) => {
            const isBranch = edge.kind === 'branch'
            const side = isBranch ? branchSide++ : 0
            const d = pathFor(edge, side)
            const labelX =
              centerX +
              (isBranch ? (side % 2 === 0 ? -54 : 54) : 0)
            const fromY =
              edge.from === 'start'
                ? PAD_Y / 2
                : nodeCenterY(edge.from as number) + NODE_H / 2
            const toY =
              edge.to === 'end'
                ? endCenterY(questions.length) - END_H / 2
                : nodeCenterY(edge.to as number) - NODE_H / 2
            const labelY = (fromY + toY) / 2
            return (
              <g key={`${edge.from}-${edge.to}-${edge.label ?? ''}-${ei}`}>
                <path
                  d={d}
                  fill="none"
                  strokeWidth={isBranch ? 1.5 : 1.25}
                  strokeDasharray={isBranch ? '4 3' : undefined}
                  className={
                    isBranch ? 'stroke-indigo-500' : 'stroke-muted-foreground/70'
                  }
                  markerEnd={
                    isBranch
                      ? 'url(#survey-flow-arrow-branch)'
                      : 'url(#survey-flow-arrow)'
                  }
                />
                {edge.label && (
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    className="fill-indigo-700 text-[10px]"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Start marker */}
          <circle
            cx={centerX}
            cy={PAD_Y / 2}
            r={4}
            className="fill-muted-foreground"
          />

          {questions.map((q, i) => {
            const x = centerX - NODE_W / 2
            const y = PAD_Y + i * (NODE_H + V_GAP)
            const selected = selectedIndex === i
            const prompt = q.prompt.trim() || 'Untitled question'
            return (
              <g
                key={i}
                className="cursor-pointer"
                onClick={() => onSelectQuestion(i)}
              >
                <rect
                  x={x}
                  y={y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  className={
                    selected
                      ? 'fill-indigo-50 stroke-indigo-600'
                      : 'fill-background stroke-border hover:stroke-indigo-400'
                  }
                  strokeWidth={selected ? 2 : 1}
                />
                <text
                  x={centerX}
                  y={y + 18}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-semibold"
                >
                  Q{i + 1} · {q.qtype.replace('_', ' ')}
                </text>
                <text
                  x={centerX}
                  y={y + 36}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {prompt.length > 22 ? `${prompt.slice(0, 22)}…` : prompt}
                </text>
                <title>{`Q${i + 1}: ${prompt}`}</title>
              </g>
            )
          })}

          {/* End node */}
          {(() => {
            const y = PAD_Y + questions.length * (NODE_H + V_GAP)
            const x = centerX - NODE_W / 2
            return (
              <g>
                <rect
                  x={x}
                  y={y}
                  width={NODE_W}
                  height={END_H}
                  rx={8}
                  className="fill-emerald-50 stroke-emerald-600"
                  strokeWidth={1.5}
                />
                <text
                  x={centerX}
                  y={y + END_H / 2 + 4}
                  textAnchor="middle"
                  className="fill-emerald-800 text-[11px] font-semibold"
                >
                  End survey
                </text>
              </g>
            )
          })()}
        </svg>
      </div>
    </div>
  )
}
