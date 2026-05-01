/**
 * Population segmentation helper for the SOC wizard.
 *
 * Populations are NOT a fixed taxonomy in this app. Different campaigns,
 * sectors, and moments produce different relevant populations. The
 * concept of identifying and classifying discrete worker populations is
 * what gets embedded in the framework; the populations themselves are
 * captured per SOC session as user-defined entries.
 */

export interface SocSessionPopulation {
  name: string
  description?: string
  characteristics?: string
}

const POPULATION_CONCEPT_BLOCK = `
POPULATION SEGMENTATION
This SOC has identified specific worker population(s) it is being built
for. Different populations carry different leverage, surface different
issues, and respond to different language. Calibrate your coaching:
encourage the user to differentiate their language for each population
rather than producing a single one-size-fits-all draft. If the user
writes language that erases the distinctions between populations, push
them to differentiate. If their populations are too coarse to be useful,
push them to refine.
`

/**
 * Build the population context block injected into the SOC coach's
 * system prompt. If no populations are defined, returns a short prompt
 * encouraging the user to define them.
 *
 * When targetIndex is set (population tab coaching), the block highlights
 * the specific population this session is focused on and lists the rest
 * for contrast only.
 */
export function buildPopulationContext(
  populations: SocSessionPopulation[] | null | undefined,
  targetIndex: number | null = null
): string {
  if (!populations || populations.length === 0) {
    return `${POPULATION_CONCEPT_BLOCK}

No populations have been defined for this SOC session yet. If the user's
language would benefit from population segmentation, surface that —
otherwise proceed with the stage's coaching directives.`
  }

  const formatPop = (p: SocSessionPopulation) => {
    const parts: string[] = [p.name]
    if (p.description) parts.push(`  Description: ${p.description}`)
    if (p.characteristics) parts.push(`  Characteristics: ${p.characteristics}`)
    return parts.join('\n')
  }

  if (targetIndex !== null && populations[targetIndex]) {
    const target = populations[targetIndex]
    const others = populations
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => i !== targetIndex)

    const otherLines = others.length > 0
      ? `\nOTHER POPULATIONS IN THIS SOC (for context only):\n${others.map(({ p, i }) => `${i + 1}. ${p.name}${p.description ? ` — ${p.description}` : ''}`).join('\n')}`
      : ''

    return `${POPULATION_CONCEPT_BLOCK}

TARGET POPULATION FOR THIS COACHING SESSION:
${formatPop(target)}

Focus all coaching, feedback, and draft suggestions on language and framing
appropriate for this specific population. You may reference other populations
for contrast, but this draft is for the target population only.
${otherLines}`
  }

  const lines = populations.map((p, i) => `${i + 1}. ${formatPop(p)}`)

  return `${POPULATION_CONCEPT_BLOCK}

POPULATIONS DEFINED FOR THIS SOC:
${lines.join('\n\n')}

Use these populations as context when coaching. If the user's draft
language would land on one population but not another, name that and
prompt them to differentiate.`
}

/**
 * Render populations for the wizard UI sidebar. Compact one-line summaries.
 */
export function summarisePopulations(populations: SocSessionPopulation[]): string[] {
  return populations.map((p) => {
    if (p.description) return `${p.name} — ${p.description}`
    return p.name
  })
}
