'use client'

/**
 * Three cards, one per channel, each leading with the job rather than
 * the feature name. They go to the flows that exist today — this is a
 * hub over the existing creation paths, not a new one.
 *
 * The Email card's second link is labelled honestly: the legacy Email
 * wizard pushes its audience to Action Network and leaves no in-app
 * send record, so nothing it sends can appear in this list. It is the
 * one place in the hub that promises less than it lists, and it says
 * so rather than letting an organiser find out afterwards.
 *
 * The campaign picker lists campaigns and offers no way to create one:
 * campaign creation has exactly one entry point, on the campaigns page.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils/cn'
import { smsCreateHref, SMS_ACTION_KINDS } from '@/lib/sms/hub-actions'
import { useSmsHubCampaigns } from '@/lib/hooks/useSmsHub'
import { SMS_ACTION_KIND_META } from '@/components/sms/hub/SmsActionKindPicker'
import { CampaignCombobox } from '@/components/sms/hub/SmsScopePicker'

type PickerTarget = 'email' | 'calls'

export function StartSomethingCards() {
  const router = useRouter()
  const [picker, setPicker] = useState<PickerTarget | null>(null)

  return (
    <>
      <section aria-label="Start something" className="space-y-2">
        <h2 className="text-sm font-medium">Start something</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {/* SMS */}
          <StartCard
            title="SMS"
            headline="Text people and get replies back"
            primary={
              <Link href={smsCreateHref({})} className={PRIMARY_CLASS}>
                New SMS action
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            }
          >
            <ul className="space-y-1">
              {SMS_ACTION_KINDS.map((kind) => {
                const meta = SMS_ACTION_KIND_META[kind]
                return (
                  <li key={kind}>
                    <Link
                      href={smsCreateHref({ kind })}
                      className="group flex items-start gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-muted/60"
                    >
                      <meta.icon
                        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', meta.tone)}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="font-medium">New {meta.label.toLowerCase()}</span>
                        <span className="text-muted-foreground"> — {meta.headline}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </StartCard>

          {/* Email */}
          <StartCard
            title="Email"
            headline="Write to a list and track what landed"
            icon={Mail}
            iconTone="text-sky-500"
            primary={
              <button type="button" className={PRIMARY_CLASS} onClick={() => setPicker('email')}>
                Email from a campaign
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            }
          >
            <p className="text-xs text-muted-foreground">
              Builds the audience from the campaign&rsquo;s own lists and records every send, so
              it shows up here.
            </p>
            <p className="text-xs">
              <Link href="/campaigns/email-wizard" className="underline underline-offset-4">
                Send without a campaign (Email wizard)
              </Link>
              <span className="text-muted-foreground">
                {' '}
                — pushes the audience to Action Network. Nothing about the send is recorded here,
                so it will not appear in this list.
              </span>
            </p>
          </StartCard>

          {/* Calls */}
          <StartCard
            title="Calls"
            headline="Work a list on the phone, one at a time"
            icon={Phone}
            iconTone="text-rose-500"
            primary={
              <Link href="/campaigns/phone-wizard" className={PRIMARY_CLASS}>
                New call list
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            }
          >
            <p className="text-xs text-muted-foreground">
              Picks who to call, builds the script and opens the dialler. Standalone unless you
              link it to a campaign.
            </p>
            <p className="text-xs">
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => setPicker('calls')}
              >
                Call list in a campaign
              </button>
              <span className="text-muted-foreground">
                {' '}
                — uses that campaign&rsquo;s lists, and shows in its Outreach tab.
              </span>
            </p>
          </StartCard>
        </div>
      </section>

      <HubCampaignPickerDialog
        target={picker}
        onClose={() => setPicker(null)}
        onPick={(campaignId) => {
          setPicker(null)
          router.push(
            picker === 'email'
              ? `/campaigns/${campaignId}/email/setup/order`
              : `/campaigns/${campaignId}/phone/lists/new`,
          )
        }}
      />
    </>
  )
}

const PRIMARY_CLASS =
  'inline-flex h-8 w-full items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/10'

function StartCard({
  title,
  headline,
  icon: Icon,
  iconTone,
  primary,
  children,
}: {
  title: string
  headline: string
  icon?: React.ComponentType<{ className?: string }>
  iconTone?: string
  primary: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className={cn('h-4 w-4 shrink-0', iconTone)} aria-hidden />}
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{headline}</p>
        </div>
      </div>
      {primary}
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

/**
 * Pick the campaign an email or call list belongs to. Lists campaigns
 * only — no create-a-campaign affordance.
 */
function HubCampaignPickerDialog({
  target,
  onClose,
  onPick,
}: {
  target: PickerTarget | null
  onClose: () => void
  onPick: (campaignId: number) => void
}) {
  const [campaignId, setCampaignId] = useState<number | null>(null)
  const { data: campaigns = [], isLoading } = useSmsHubCampaigns(target != null)

  return (
    <Dialog
      open={target != null}
      onOpenChange={(open) => {
        if (!open) {
          setCampaignId(null)
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target === 'email' ? 'Which campaign is this email for?' : 'Which campaign is this call list for?'}
          </DialogTitle>
          <DialogDescription>
            It will use that campaign&rsquo;s lists and show in its Outreach tab.
          </DialogDescription>
        </DialogHeader>
        <CampaignCombobox
          value={campaignId}
          campaigns={campaigns}
          loading={isLoading}
          onChange={setCampaignId}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={campaignId == null}
            onClick={() => campaignId != null && onPick(campaignId)}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
