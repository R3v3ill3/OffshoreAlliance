export function sortByPopularity<T extends { use_count: number | null; option_text?: string; category_name?: string }>(
  options: T[]
): T[] {
  return [...options].sort((a, b) => {
    const aCount = a.use_count ?? 0
    const bCount = b.use_count ?? 0
    if (bCount !== aCount) return bCount - aCount
    const aText = a.option_text || a.category_name || ''
    const bText = b.option_text || b.category_name || ''
    return aText.localeCompare(bText)
  })
}

export function groupByCategory<T extends { category?: string }>(
  items: T[]
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = item.category || 'other'
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})
}

export function formatCategoryLabel(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
