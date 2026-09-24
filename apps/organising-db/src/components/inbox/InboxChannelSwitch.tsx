'use client'

/**
 * Email | SMS switch shared by the two reply queues. The sidebar has one
 * Inbox row (it opens on email). Conversation ids are per channel, so a
 * switch keeps `?campaign=` and drops `?conversation=`.
 */
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Inbox, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type InboxChannel = 'email' | 'sms'

const SECTIONS: Array<{
  id: InboxChannel
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: 'email', href: '/email/inbox', label: 'Email', icon: Inbox },
  { id: 'sms', href: '/sms/inbox', label: 'SMS', icon: MessageSquare },
]

function channelHref(base: string, searchParams: URLSearchParams): string {
  const campaign = searchParams.get('campaign')
  if (!campaign) return base
  return `${base}?campaign=${encodeURIComponent(campaign)}`
}

export function InboxChannelSwitch({ current }: { current: InboxChannel }) {
  const searchParams = useSearchParams()

  return (
    <nav
      aria-label="Inbox channel"
      className="inline-flex h-9 items-center gap-0 rounded-lg bg-muted p-1 text-muted-foreground"
    >
      {SECTIONS.map((section) => {
        const active = section.id === current
        return (
          <Link
            key={section.id}
            href={channelHref(section.href, searchParams)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:text-foreground',
            )}
          >
            <section.icon className="h-4 w-4 shrink-0" />
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}
