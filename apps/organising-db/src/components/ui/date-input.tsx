'use client'

import * as React from 'react'
import { format, parse, isValid } from 'date-fns'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** ISO yyyy-MM-dd string, or empty string */
  value: string
  /** Called with ISO yyyy-MM-dd string when a valid date is committed */
  onChange: (iso: string) => void
}

/**
 * A date input that displays and accepts dates in dd/mm/yyyy (Australian) format.
 * Internally works with ISO yyyy-MM-dd strings.
 * The calendar icon opens the browser's native date picker as a fallback.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, className, disabled, ...rest }, _ref) => {
    const [text, setText] = React.useState(() => isoToDisplay(value))
    const nativeRef = React.useRef<HTMLInputElement>(null)

    // Sync display text when the controlled value changes externally
    React.useEffect(() => {
      setText(isoToDisplay(value))
    }, [value])

    function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
      const raw = e.target.value
      // Allow free typing; auto-insert slashes for UX
      const cleaned = raw.replace(/[^\d/]/g, '')
      setText(cleaned)
    }

    function handleBlur() {
      const parsed = parseDisplay(text)
      if (parsed) {
        const iso = format(parsed, 'yyyy-MM-dd')
        onChange(iso)
        setText(format(parsed, 'dd/MM/yyyy'))
      } else if (text.trim() === '') {
        onChange('')
        setText('')
      } else {
        // Revert to last valid value
        setText(isoToDisplay(value))
      }
    }

    function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
      const iso = e.target.value
      if (iso) {
        onChange(iso)
        setText(isoToDisplay(iso))
      }
    }

    function openNativePicker() {
      nativeRef.current?.showPicker?.()
      nativeRef.current?.click()
    }

    return (
      <div className="relative flex items-center">
        <input
          type="text"
          inputMode="numeric"
          placeholder="dd/mm/yyyy"
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
          disabled={disabled}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          {...rest}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={openNativePicker}
          className="absolute right-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="Open date picker"
        >
          <Calendar className="h-4 w-4" />
        </button>
        {/* Hidden native date input — browser date picker only */}
        <input
          ref={nativeRef}
          type="date"
          value={value}
          onChange={handleNativeChange}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only absolute inset-0 opacity-0 pointer-events-none"
        />
      </div>
    )
  }
)
DateInput.displayName = 'DateInput'

// ── helpers ──────────────────────────────────────────────────────────────────

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  if (!isValid(d)) return ''
  return format(d, 'dd/MM/yyyy')
}

/** Accepts dd/mm/yyyy or dd/mm/yy */
function parseDisplay(text: string): Date | null {
  const t = text.trim()
  if (!t) return null
  const fmts = ['dd/MM/yyyy', 'dd/MM/yy', 'd/M/yyyy', 'd/M/yy']
  for (const fmt of fmts) {
    const d = parse(t, fmt, new Date())
    if (isValid(d)) return d
  }
  return null
}
