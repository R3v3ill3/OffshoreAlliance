'use client'

/**
 * Filter-and-build audience from the campaign workforce (sort + filter),
 * with an optional wash against existing lists.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FactFilterControls } from '@/components/campaigns/data-fields/fact-filter-controls'
import { useCampaignDataFields } from '@/lib/hooks/useCampaignDataFields'
import type { FactFilter } from '@/lib/campaign-facts/types'
import { encodeFactsQueryParam } from '@/lib/campaign-facts/values'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  AudienceWashLists,
  idsExcludedByWash,
  washListKey,
  type WashListOverlap,
} from '@/components/audience/AudienceWashLists'

const MEMBERSHIP_OPTIONS = [
  { value: 'member', label: 'Members' },
  { value: 'member_pending', label: 'Member – pending' },
  { value: 'non_member', label: 'Non-members' },
  { value: 'lapsed', label: 'Lapsed' },
]

const ROLE_OPTIONS = [
  { value: 'delegate', label: 'Delegate' },
  { value: 'activist', label: 'Activist' },
  { value: 'contact', label: 'Contact' },
  { value: 'none', label: 'None' },
]

interface FilterWorker {
  worker_id: number
  first_name: string
  last_name: string
  phone: string | null
  phone_e164?: string | null
  sms_opt_out?: boolean
  employer_name: string | null
  worksite_name: string | null
}

export interface FilterBuildStaged {
  worker_id: number
  first_name: string
  last_name: string
  phone_e164: string | null
  sms_opt_out: boolean
  source: 'import'
}

interface AudienceFilterBuildDialogProps {
  campaignId: string | number
  open: boolean
  onOpenChange: (v: boolean) => void
  onAdded: (workers: FilterBuildStaged[]) => void
  orgWideUniverse?: boolean
}

export function AudienceFilterBuildDialog({
  campaignId,
  open,
  onOpenChange,
  onAdded,
  orgWideUniverse = false,
}: AudienceFilterBuildDialogProps) {
  const { user } = useAuth()
  const supabase = createClient()
  const numericId = Number(campaignId)

  const [membershipFilter, setMembershipFilter] = useState<string[]>([])
  const [roleFilter, setRoleFilter] = useState<string[]>([])
  const [employerFilter, setEmployerFilter] = useState('')
  const [worksiteFilter, setWorksiteFilter] = useState('')
  const [occupationSearch, setOccupationSearch] = useState('')
  const [sortKey, setSortKey] = useState('name_asc')
  const [washKeys, setWashKeys] = useState<Set<string>>(new Set())
  const [factFilters, setFactFilters] = useState<FactFilter[]>([])
  const { data: dataFieldsCat } = useCampaignDataFields(open ? campaignId : null)
  const dataFields = dataFieldsCat?.fields ?? []

  const toggle = (list: string[], value: string, set: (v: string[]) => void) => {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  const { data: employers = [] } = useQuery({
    queryKey: ['audience-filter-employers', numericId, orgWideUniverse],
    queryFn: async () => {
      if (orgWideUniverse) {
        const { data, error } = await supabase
          .from('employers')
          .select('employer_id, employer_name')
          .order('employer_name')
        if (error) throw error
        return (data ?? []).map((row) => ({
          employer_id: row.employer_id as number,
          employer_name: row.employer_name ?? 'Unknown',
        }))
      }
      const { data, error } = await supabase
        .from('campaign_employers')
        .select('employer_id, employers(employer_name)')
        .eq('campaign_id', numericId)
      if (error) throw error
      return (data ?? []).map((row: Record<string, unknown>) => ({
        employer_id: row.employer_id as number,
        employer_name:
          (row.employers as { employer_name: string } | null)?.employer_name ??
          'Unknown',
      }))
    },
    enabled: open && !!user,
  })

  const { data: worksites = [] } = useQuery({
    queryKey: ['audience-filter-worksites', numericId, orgWideUniverse],
    queryFn: async () => {
      if (orgWideUniverse) {
        const { data, error } = await supabase
          .from('worksites')
          .select('worksite_id, worksite_name')
          .order('worksite_name')
        if (error) throw error
        return (data ?? []).map((row) => ({
          worksite_id: row.worksite_id as number,
          worksite_name: row.worksite_name ?? 'Unknown',
        }))
      }
      const { data, error } = await supabase
        .from('campaign_worksites')
        .select('worksite_id, worksites(worksite_name)')
        .eq('campaign_id', numericId)
      if (error) throw error
      return (data ?? []).map((row: Record<string, unknown>) => ({
        worksite_id: row.worksite_id as number,
        worksite_name:
          (row.worksites as { worksite_name: string } | null)?.worksite_name ??
          'Unknown',
      }))
    },
    enabled: open && !!user,
  })

  const listQuery = useQuery({
    queryKey: [
      'sms-audience-filter-build',
      String(campaignId),
      membershipFilter,
      roleFilter,
      employerFilter,
      worksiteFilter,
      occupationSearch,
      sortKey,
      factFilters,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (membershipFilter.length) params.set('membership', membershipFilter.join(','))
      if (roleFilter.length) params.set('roles', roleFilter.join(','))
      if (employerFilter && employerFilter !== '__all__') {
        params.set('employer_id', employerFilter)
      }
      if (worksiteFilter && worksiteFilter !== '__all__') {
        params.set('worksite_id', worksiteFilter)
      }
      if (occupationSearch.trim()) params.set('occupation', occupationSearch.trim())
      if (factFilters.length) params.set('facts', encodeFactsQueryParam(factFilters))
      params.set('sort', sortKey)
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/list-builder?${params.toString()}`,
      )
      if (!res.ok) throw new Error('Failed to load matching workers')
      const json = (await res.json()) as { success?: boolean; data?: FilterWorker[] }
      return json.data ?? []
    },
    enabled: open,
  })

  const workers = listQuery.data ?? []
  const workerIds = useMemo(() => workers.map((w) => w.worker_id), [workers])

  const washQuery = useQuery({
    queryKey: ['sms-audience-wash', String(campaignId), workerIds],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/sms-audience/wash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_ids: workerIds }),
      })
      if (!res.ok) throw new Error('Failed to check existing lists')
      const data = (await res.json()) as { lists: WashListOverlap[] }
      return data.lists ?? []
    },
    enabled: open && workerIds.length > 0,
  })

  const washLists = washQuery.data ?? []

  const kept = useMemo(() => {
    const excluded = idsExcludedByWash(washLists, washKeys)
    return workers.filter((w) => !excluded.has(w.worker_id))
  }, [workers, washLists, washKeys])

  const apply = () => {
    if (kept.length === 0) {
      toast.error('No workers left after filters and wash')
      return
    }
    onAdded(
      kept.map((w) => ({
        worker_id: w.worker_id,
        first_name: w.first_name,
        last_name: w.last_name,
        phone_e164: w.phone_e164 ?? w.phone,
        sms_opt_out: !!w.sms_opt_out,
        source: 'import' as const,
      })),
    )
    toast.success(`Added ${kept.length} ${kept.length === 1 ? 'person' : 'people'}`)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Build list with filters</DialogTitle>
          <DialogDescription>
            {orgWideUniverse
              ? 'Filter the worker directory, optionally wash against existing lists, then add the matching people to this audience.'
              : 'Filter the campaign workforce, optionally wash against existing lists, then add the matching people to this audience.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Membership</Label>
            <div className="flex flex-wrap gap-3">
              {MEMBERSHIP_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={membershipFilter.includes(opt.value)}
                    onCheckedChange={() =>
                      toggle(membershipFilter, opt.value, setMembershipFilter)
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">OA leader role</Label>
            <div className="flex flex-wrap gap-3">
              {ROLE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={roleFilter.includes(opt.value)}
                    onCheckedChange={() =>
                      toggle(roleFilter, opt.value, setRoleFilter)
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Employer</Label>
              <Select value={employerFilter || '__all__'} onValueChange={setEmployerFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All employers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All employers</SelectItem>
                  {employers.map((e) => (
                    <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                      {e.employer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Worksite</Label>
              <Select value={worksiteFilter || '__all__'} onValueChange={setWorksiteFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All worksites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All worksites</SelectItem>
                  {worksites.map((w) => (
                    <SelectItem key={w.worksite_id} value={String(w.worksite_id)}>
                      {w.worksite_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Occupation</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search occupation…"
                  value={occupationSearch}
                  onChange={(e) => setOccupationSearch(e.target.value)}
                  className="h-9 pl-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sort</Label>
              <Select value={sortKey} onValueChange={setSortKey}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_asc">Name A–Z</SelectItem>
                  <SelectItem value="name_desc">Name Z–A</SelectItem>
                  <SelectItem value="worksite">Worksite</SelectItem>
                  <SelectItem value="employer">Employer</SelectItem>
                  <SelectItem value="membership">Membership</SelectItem>
                  <SelectItem value="priority_score_desc">Priority</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {dataFields.some((f) => f.filterable) && (
            <FactFilterControls
              fields={dataFields}
              filters={factFilters}
              onChange={setFactFilters}
            />
          )}

          <p className="text-sm text-muted-foreground">
            {listQuery.isFetching ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading matches…
              </span>
            ) : (
              `${workers.length} match${workers.length === 1 ? '' : 'es'}`
            )}
          </p>

          {washLists.length > 0 && (
            <AudienceWashLists
              lists={washLists}
              selectedKeys={washKeys}
              onChange={setWashKeys}
            />
          )}

          {washKeys.size > 0 && (
            <p className="text-xs text-muted-foreground">
              {kept.length} remaining after wash
              {washLists
                .filter((l) => washKeys.has(washListKey(l)))
                .reduce((n, l) => n + l.overlap_ids.length, 0) > 0
                ? ` (${workers.length - kept.length} excluded)`
                : ''}
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={kept.length === 0 || listQuery.isFetching} onClick={apply}>
            Add {kept.length} {kept.length === 1 ? 'person' : 'people'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
