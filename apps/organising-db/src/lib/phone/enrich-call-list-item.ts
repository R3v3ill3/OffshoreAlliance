/**
 * Shared worker-enrichment logic for the call-list "next" endpoint.
 *
 * Used by:
 *  - /api/calls/lists/[listId]/next  (authenticated staff session — regular client)
 *  - /api/call-share/[token]/next    (share-link session — admin client)
 *
 * Accepts any Supabase client that implements the `.from()` interface so it
 * works with both the regular server client and the admin client.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any; rpc: (fn: string, params?: Record<string, unknown>) => any }

export async function enrichCallListItem(
  db: SupabaseLike,
  item: Record<string, unknown>,
  campaignId: number,
) {
  const w = item.workers as Record<string, unknown> | null
  const workerId = w?.worker_id as number | undefined

  let connection = null
  if (workerId) {
    const { data } = await db
      .from('worker_campaign_connections')
      .select('connection_id, connection_status, support_level, contact_count, last_contacted_at, notes')
      .eq('worker_id', workerId)
      .eq('campaign_id', campaignId)
      .maybeSingle()
    connection = data
  }

  let recentAttempts: unknown[] = []
  if (item.item_id) {
    const { data } = await db
      .from('call_attempts')
      .select('*')
      .eq('list_item_id', item.item_id as number)
      .order('started_at', { ascending: false })
      .limit(5)
    recentAttempts = data ?? []
  }

  // Cross-list dedup hint — surface "already called on another list" so the
  // caller can decide whether to skip. Read via the SECURITY DEFINER helper
  // so both share-link (admin) and staff (anon) clients can resolve it.
  let crossListStatus: Record<string, unknown> | null = null
  if (workerId) {
    const { data } = await db.rpc('get_campaign_worker_call_status', {
      p_campaign_id: campaignId,
      p_worker_id: workerId,
    })
    const status = data as Record<string, unknown> | null
    if (status && (status.list_id as number | null) !== (item.list_id as number | null)) {
      crossListStatus = status
    }
  }

  const employers = w?.employers as Record<string, unknown> | null
  const worksites = w?.worksites as Record<string, unknown> | null
  const umt = w?.union_membership_type as
    | { type_name: string }
    | { type_name: string }[]
    | null
    | undefined
  const unionType = Array.isArray(umt) ? umt[0] : umt

  return {
    ...item,
    worker: w
      ? {
          worker_id: w.worker_id,
          first_name: w.first_name,
          last_name: w.last_name,
          email: w.email,
          phone: w.phone,
          occupation: w.occupation,
          address: w.address ?? null,
          suburb: w.suburb ?? null,
          state: w.state ?? null,
          postcode: w.postcode ?? null,
          employer_id: w.employer_id ?? null,
          worksite_id: w.worksite_id ?? null,
          union_membership_type_id: (w.union_membership_type_id as number | null) ?? null,
          union_membership_type_name: unionType?.type_name ?? null,
          employer_name: employers?.employer_name ?? null,
          worksite_name: worksites?.worksite_name ?? null,
        }
      : null,
    workers: undefined,
    connection,
    recent_attempts: recentAttempts,
    cross_list_status: crossListStatus,
  }
}

/**
 * The worker SELECT fragment used in both next endpoints.
 *
 * Uses the explicit FK constraint name `call_list_items_worker_id_fkey` rather
 * than the column name hint `!worker_id` because `call_list_items` has a second
 * FK to workers via `claimed_by_worker_id`, making the short-form hint
 * ambiguous in PostgREST.
 */
export const WORKER_SELECT = `
  *,
  workers!call_list_items_worker_id_fkey (
    worker_id, first_name, last_name, email, phone,
    occupation, address, suburb, state, postcode,
    employer_id, worksite_id,
    union_membership_type_id,
    union_membership_type:union_membership_types(type_name),
    employers (employer_id, employer_name),
    worksites (worksite_id, worksite_name)
  )
`

/**
 * Fetch a call_list_item by ID and enrich it.
 * Used by /api/call-share/[token]/next where only the itemId is returned
 * by the claim RPC.
 */
export async function fetchAndEnrichCallListItem(
  db: SupabaseLike,
  itemId: number,
  campaignId: number,
) {
  const { data: item, error } = await db
    .from('call_list_items')
    .select(WORKER_SELECT.trim())
    .eq('item_id', itemId)
    .maybeSingle()

  if (error) throw error
  if (!item) return null
  return enrichCallListItem(db, item as Record<string, unknown>, campaignId)
}
