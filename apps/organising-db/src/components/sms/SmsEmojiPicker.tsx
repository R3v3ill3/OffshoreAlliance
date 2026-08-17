'use client'

/**
 * Emoji button for the SMS composers — inserts at the cursor via the
 * same `onSelect` contract the merge-field chips use.
 *
 * Shared by the blast composer, both P2P board editors and the inbox
 * reply box so the palette and the UCS-2 warning stay identical
 * everywhere. The OS emoji keyboard already worked in these
 * textareas; this is for people who don't know that, and it puts the
 * cost of an emoji next to the emoji itself.
 */
import { Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SMS_EMOJI_GROUPS } from '@/lib/sms/emoji'

export function SmsEmojiPicker({
  onSelect,
  disabled,
  /** Rendered inside a dialog — keeps the popover above the overlay. */
  className,
}: {
  onSelect: (emoji: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          title="Insert emoji — switches the message to UCS-2 (70 characters per part)"
          className={className}
        >
          <Smile className="h-3.5 w-3.5" />
          <span className="sr-only">Insert emoji</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[60] w-72 p-2">
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {SMS_EMOJI_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-0.5">
                {group.emoji.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="rounded p-1 text-lg leading-none hover:bg-muted"
                    onClick={() => onSelect(e)}
                    aria-label={`Insert ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">
          Emoji switch the message to UCS-2: 70 characters per part
          instead of 160.
        </p>
      </PopoverContent>
    </Popover>
  )
}
