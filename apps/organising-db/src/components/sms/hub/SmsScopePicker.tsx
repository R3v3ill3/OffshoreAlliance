'use client'

/**
 * Where a new action belongs. Two options, stated as consequences
 * rather than as data model ("wall-chart lists and assessments stay
 * off" beats "hidden episode campaign"). Picking a campaign is a
 * searchable combobox — the org has more campaigns than fit a select.
 */
import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils/cn'
import { scopeOptionsForKind, type SmsActionKind } from '@/lib/sms/hub-actions'
import type { SmsHubCampaignOption } from '@/lib/hooks/useSmsHub'

export type SmsScopeMode = 'standalone' | 'org' | 'campaign'

const MODE_COPY: Record<
  SmsScopeMode,
  { label: string; description: string }
> = {
  standalone: {
    label: 'Standalone — not part of a campaign',
    description:
      'Runs on its own. Replies still land in the Inbox; wall-chart lists, assessments and campaign reporting stay off.',
  },
  org: {
    label: 'Org-wide',
    description:
      'Not tied to a campaign. Shows on every campaign’s Relays tab and here in the hub.',
  },
  campaign: {
    label: 'Linked to a campaign',
    description:
      'Uses the campaign’s lists and assessments, and shows in its Outreach → SMS tab and reporting.',
  },
}

export function SmsScopePicker({
  kind,
  mode,
  campaignId,
  campaigns,
  campaignsLoading = false,
  onModeChange,
  onCampaignChange,
  disabled = false,
}: {
  kind: SmsActionKind
  mode: SmsScopeMode
  campaignId: number | null
  campaigns: SmsHubCampaignOption[]
  campaignsLoading?: boolean
  onModeChange: (mode: SmsScopeMode) => void
  onCampaignChange: (campaignId: number | null) => void
  disabled?: boolean
}) {
  const options = scopeOptionsForKind(kind)

  return (
    <RadioGroup
      value={mode}
      onValueChange={(v) => onModeChange(v as SmsScopeMode)}
      disabled={disabled}
      className="grid gap-3"
      aria-label="Scope"
    >
      {options.map((opt) => {
        const copy = MODE_COPY[opt]
        const selected = mode === opt
        return (
          <label
            key={opt}
            htmlFor={`sms-scope-${opt}`}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-colors',
              selected ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/40 hover:border-muted-foreground/30',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <RadioGroupItem id={`sms-scope-${opt}`} value={opt} className="mt-0.5" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium leading-none">{copy.label}</p>
              <p className="text-xs text-muted-foreground">{copy.description}</p>
              {opt === 'campaign' && selected && (
                <div className="pt-2">
                  <Label className="sr-only" htmlFor="sms-scope-campaign-picker">
                    Campaign
                  </Label>
                  <CampaignCombobox
                    id="sms-scope-campaign-picker"
                    value={campaignId}
                    campaigns={campaigns}
                    loading={campaignsLoading}
                    onChange={onCampaignChange}
                    disabled={disabled}
                  />
                </div>
              )}
            </div>
          </label>
        )
      })}
    </RadioGroup>
  )
}

export function CampaignCombobox({
  id,
  value,
  campaigns,
  loading = false,
  onChange,
  disabled = false,
  placeholder = 'Choose a campaign…',
  allowClear = false,
  className,
}: {
  id?: string
  value: number | null
  campaigns: SmsHubCampaignOption[]
  loading?: boolean
  onChange: (campaignId: number | null) => void
  disabled?: boolean
  placeholder?: string
  allowClear?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = useMemo(
    () => campaigns.find((c) => c.campaign_id === value) ?? null,
    [campaigns, value],
  )
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const rows = term
      ? campaigns.filter((c) => c.name.toLowerCase().includes(term))
      : campaigns
    // Current campaigns first; the long tail of finished ones stays reachable.
    return [...rows].sort((a, b) => {
      const aLive = a.status === 'active' || a.status === 'planning' ? 0 : 1
      const bLive = b.status === 'active' || b.status === 'planning' ? 0 : 1
      return aLive - bLive
    })
  }, [campaigns, query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn('w-full justify-between font-normal sm:w-96', className)}
          onClick={(e) => e.stopPropagation()}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {loading ? 'Loading campaigns…' : (selected?.name ?? placeholder)}
          </span>
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search campaigns…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No campaigns match.</CommandEmpty>
            <CommandGroup>
              {allowClear && value != null && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                >
                  <span className="text-muted-foreground">Clear selection</span>
                </CommandItem>
              )}
              {filtered.map((c) => (
                <CommandItem
                  key={c.campaign_id}
                  value={String(c.campaign_id)}
                  onSelect={() => {
                    onChange(c.campaign_id)
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      c.campaign_id === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{c.name}</span>
                  {c.status && c.status !== 'active' && (
                    <span className="ml-auto pl-2 text-xs text-muted-foreground">
                      {c.status}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
