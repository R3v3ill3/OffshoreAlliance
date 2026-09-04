'use client'

/**
 * "Who does the launch text come from?" — the one decision that changes
 * what happens to every reply, so it is asked in the same words
 * wherever it is asked: in the relay wizard's Launch text step, and at
 * the top of the blast sheet on the `/sms/new?launch_relay=` path.
 *
 * Different number (recommended): replies are ordinary inbox traffic;
 * members text the relay themselves from the number in the message.
 * The relay number: every reply is a message to the target, which is
 * occasionally what you want and never what you want by accident —
 * hence RELAY_NUMBER_SENDER_WARNING and the moderation nudge.
 */
import { useEffect, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toDisplay } from '@/lib/phone/normalise-phone'
import { useSmsSenders } from '@/lib/hooks/useSmsBroadcast'
import { filterInboxSafeSenders } from '@/lib/sms/sender-purpose'
import {
  RELAY_NUMBER_SENDER_WARNING,
  type RelayLaunchSenderMode,
} from '@/lib/sms/relay-launch'

/** The sender the blast actually goes out on, given the choice. */
export function relayLaunchSenderNumberId(args: {
  mode: RelayLaunchSenderMode
  relayNumberId: number
  organiserNumberId: number | null
}): number | null {
  return args.mode === 'relay_number'
    ? args.relayNumberId
    : args.organiserNumberId
}

export function RelayLaunchSenderChoice({
  mode,
  onModeChange,
  organiserNumberId,
  onOrganiserNumberChange,
  relayPhoneE164,
  moderationRequired,
  onModerationChange,
  disabled,
}: {
  mode: RelayLaunchSenderMode
  onModeChange: (mode: RelayLaunchSenderMode) => void
  /** The 'different_number' choice; the parent owns it so it survives a mode flip. */
  organiserNumberId: number | null
  onOrganiserNumberChange: (numberId: number | null) => void
  relayPhoneE164: string
  moderationRequired: boolean
  /** Omit when there is nothing to toggle here (hides the nudge). */
  onModerationChange?: (value: boolean) => void
  disabled?: boolean
}) {
  const { data: senders, isLoading } = useSmsSenders()
  const organiserSenders = useMemo(
    () => filterInboxSafeSenders(senders ?? []),
    [senders],
  )

  // Default to the signed-in organiser's own number, exactly as the
  // composer does — the recommended path should need no clicks.
  useEffect(() => {
    if (organiserNumberId != null || organiserSenders.length === 0) return
    const mine = organiserSenders.find((s) => s.is_mine)
    if (mine) onOrganiserNumberChange(mine.number_id)
  }, [organiserNumberId, organiserSenders, onOrganiserNumberChange])

  return (
    <div className="space-y-3">
      <RadioGroup
        value={mode}
        onValueChange={(v) => onModeChange(v as RelayLaunchSenderMode)}
        disabled={disabled}
      >
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-start gap-2">
            <RadioGroupItem
              value="different_number"
              id="launch-sender-different"
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="launch-sender-different" className="font-medium">
                Send from a different number (recommended)
              </Label>
              <p className="text-xs text-muted-foreground">
                Replies to the launch text land in the Inbox as usual. Members
                text the relay number themselves — the message carries it and a
                tap-to-text link.
              </p>
            </div>
          </div>
          {mode === 'different_number' && (
            <div className="space-y-1.5 pl-6">
              <Label className="text-xs text-muted-foreground">
                Sender number
              </Label>
              <Select
                disabled={disabled || isLoading}
                value={organiserNumberId != null ? String(organiserNumberId) : ''}
                onValueChange={(v) =>
                  onOrganiserNumberChange(v ? Number(v) : null)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={isLoading ? 'Loading…' : 'Choose a number…'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {organiserSenders.map((s) => (
                    <SelectItem key={s.number_id} value={String(s.number_id)}>
                      {toDisplay(s.phone_e164)}
                      {s.organiser_name
                        ? ` — ${s.organiser_name}`
                        : s.label
                          ? ` — ${s.label}`
                          : ''}
                      {s.is_mine ? ' (you)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isLoading && organiserSenders.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No organiser numbers available — add one in Administration →
                  SMS, or send the launch text from the relay number below.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-start gap-2">
            <RadioGroupItem
              value="relay_number"
              id="launch-sender-relay"
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="launch-sender-relay" className="font-medium">
                Send from the relay number
                {relayPhoneE164 ? ` (${toDisplay(relayPhoneE164)})` : ''}
              </Label>
              <p className="text-xs text-muted-foreground">
                The invitation arrives from the number members are being asked
                to text.
              </p>
            </div>
          </div>
          {mode === 'relay_number' && (
            <div className="space-y-2 pl-6">
              <p className="flex items-start gap-1 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {RELAY_NUMBER_SENDER_WARNING}
              </p>
              {onModerationChange && !moderationRequired && (
                <div className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-2">
                  <Label
                    htmlFor="launch-moderation"
                    className="text-xs font-normal leading-snug text-amber-900"
                  >
                    Turn on the moderation queue so you approve what goes
                    through
                  </Label>
                  <Switch
                    id="launch-moderation"
                    disabled={disabled}
                    checked={moderationRequired}
                    onCheckedChange={onModerationChange}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </RadioGroup>
    </div>
  )
}
