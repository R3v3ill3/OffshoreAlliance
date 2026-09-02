'use client'

/**
 * Section switcher for the SMS hub: Actions (what is running and what
 * has run), Inbox (replies), Numbers (which platform number is doing
 * what). Three pages, one row of pills, so an organiser is never more
 * than one click from any of them.
 */
import Link from 'next/link'
import { Hash, Inbox, LayoutList } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type SmsHubSection = 'actions' | 'inbox' | 'numbers'

const SECTIONS: Array<{
  id: SmsHubSection
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: 'actions', href: '/sms', label: 'Actions', icon: LayoutList },
  { id: 'inbox', href: '/sms/inbox', label: 'Inbox', icon: Inbox },
  { id: 'numbers', href: '/sms/numbers', label: 'Numbers', icon: Hash },
]

export function SmsHubNav({ current }: { current: SmsHubSection }) {
  return (
    <nav
      aria-label="SMS sections"
      className="inline-flex h-9 items-center gap-0 rounded-lg bg-muted p-1 text-muted-foreground"
    >
      {SECTIONS.map((s) => {
        const active = s.id === current
        return (
          <Link
            key={s.id}
            href={s.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:text-foreground',
            )}
          >
            <s.icon className="h-4 w-4 shrink-0" />
            {s.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Shared page header for the three hub sections. */
export function SmsHubHeader({
  current,
  title,
  description,
  actions,
}: {
  current: SmsHubSection
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <SmsHubNav current={current} />
    </div>
  )
}
