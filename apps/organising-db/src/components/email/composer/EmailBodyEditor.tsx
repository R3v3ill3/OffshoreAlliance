'use client'

/**
 * EmailBodyEditor — TipTap rich-text editor for email bodies, with a
 * plain-text fallback mode for organisers who prefer monospace.
 *
 * Behaviour summary:
 *   - Mention extension (MergeFieldMention) renders {{key}} tokens as
 *     atomic chips. Both `{{` autocomplete and the toolbar "Insert merge
 *     field" button feed the same node type.
 *   - Slash menu (custom extension) surfaces AI commands.
 *   - Bubble menu on selection routes via `onSelectionAction` to the
 *     host's AI selection toolbar.
 *   - Output is serialised to HTML (`onChange.html`), plain text
 *     (`onChange.text`), and JSON (`onChange.json`) so the host can store
 *     all three.
 *   - On load, the host supplies either rich HTML (preferred) or plain
 *     text; `{{key}}` tokens are rewritten to chip markup before TipTap
 *     parses them so they hydrate as Mention nodes.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import {
  MergeFieldMention,
  parseHtmlWithMergeFields,
  plainTextToChipHtml,
  stripMergeFieldChips,
  variableSuggestions,
} from './extensions/merge-field-mention'
import { MergeFieldSuggestionList } from './extensions/MergeFieldSuggestionList'
import { SlashMenu, filterCommands, type SlashCommand } from './extensions/slash-menu'
import { SlashCommandList } from './extensions/SlashCommandList'
import { makeSuggestionRenderer } from './extensions/suggestion-renderer'
import DOMPurify from 'isomorphic-dompurify'
import {
  Bold,
  Italic,
  UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Heading2,
  Heading3,
  Variable as VariableIcon,
  Wand2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Megaphone,
  Heart,
  BookOpen,
  Pilcrow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils/cn'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  RECIPIENT_VARIABLES,
  CAMPAIGN_CONTEXT_VARIABLES,
} from '@/lib/comms/template-variables'

export type SelectionAction =
  | 'rewrite'
  | 'shorten'
  | 'lengthen'
  | 'tone:militant'
  | 'tone:solidarity'
  | 'tone:plain'

export interface EditorOutput {
  html: string
  text: string
  json: JSONContent
}

export interface EmailBodyEditorProps {
  initialHtml?: string | null
  initialText?: string
  mode: 'rich' | 'plain'
  onChange: (out: EditorOutput) => void
  onSelectionAction?: (action: SelectionAction, selectedText: string) => void
  onOpenBriefPanel?: () => void
  placeholder?: string
  /** Notified when slash-menu sends an AI command (selection empty). */
  onWholeBodyAction?: (action: SelectionAction) => void
  /** Notified when slash-menu opens the brief panel. */
}

export interface EmailBodyEditorRef {
  getOutput: () => EditorOutput
  setContent: (html: string, plain?: string) => void
  insertMergeField: (key: string) => void
  focus: () => void
  getSelectedText: () => string
  replaceSelectionWith: (text: string) => void
  replaceAllWith: (text: string) => void
}

const ALLOWED_TAGS_EXPORT = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'blockquote',
]

function sanitizeForExport(html: string): string {
  // Strip the visual chip wrapper first so the sanitizer sees plain
  // {{key}} text (kept) rather than data-merge-field spans (would be
  // dropped against the AN-friendly allowlist).
  const stripped = stripMergeFieldChips(html)
  const result = DOMPurify.sanitize(stripped, {
    ALLOWED_TAGS: ALLOWED_TAGS_EXPORT,
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
  return typeof result === 'string' ? result : String(result)
}

export const EmailBodyEditor = forwardRef<EmailBodyEditorRef, EmailBodyEditorProps>(
  function EmailBodyEditor(
    {
      initialHtml,
      initialText,
      mode,
      onChange,
      onSelectionAction,
      onOpenBriefPanel,
      placeholder,
      onWholeBodyAction,
    },
    ref,
  ) {
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const onSelectionActionRef = useRef(onSelectionAction)
    onSelectionActionRef.current = onSelectionAction
    const onWholeBodyActionRef = useRef(onWholeBodyAction)
    onWholeBodyActionRef.current = onWholeBodyAction
    const onOpenBriefRef = useRef(onOpenBriefPanel)
    onOpenBriefRef.current = onOpenBriefPanel

    // Plain-text mode state
    const [plainValue, setPlainValue] = useState<string>(() => initialText ?? '')
    const plainRef = useRef<HTMLTextAreaElement>(null)

    // Build the initial document (HTML with chips re-injected) once.
    const initialContent = useMemo(() => {
      if (initialHtml && initialHtml.trim()) {
        return parseHtmlWithMergeFields(initialHtml)
      }
      if (initialText && initialText.trim()) {
        return plainTextToChipHtml(initialText)
      }
      return ''
    }, [initialHtml, initialText])

    const slashCommands = useMemo<SlashCommand[]>(
      () => [
        {
          title: 'Draft from brief',
          description: 'Open the AI panel to draft this email from a prompt.',
          iconKey: 'sparkles',
          keywords: ['ai', 'draft', 'generate', 'brief'],
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).run()
            onOpenBriefRef.current?.()
          },
        },
        {
          title: 'Rewrite selection',
          description: 'Reword the highlighted text. Select text first.',
          iconKey: 'rewrite',
          keywords: ['ai', 'rewrite', 'reword'],
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).run()
            const selected = getEditorSelectedText(editor)
            if (selected) onSelectionActionRef.current?.('rewrite', selected)
            else onWholeBodyActionRef.current?.('rewrite')
          },
        },
        {
          title: 'Shorten selection',
          description: 'Tighten the highlighted text. Select text first.',
          iconKey: 'shorten',
          keywords: ['ai', 'shorten', 'tighten'],
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).run()
            const selected = getEditorSelectedText(editor)
            if (selected) onSelectionActionRef.current?.('shorten', selected)
            else onWholeBodyActionRef.current?.('shorten')
          },
        },
        {
          title: 'Lengthen selection',
          description: 'Expand the highlighted text. Select text first.',
          iconKey: 'lengthen',
          keywords: ['ai', 'expand', 'lengthen'],
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).run()
            const selected = getEditorSelectedText(editor)
            if (selected) onSelectionActionRef.current?.('lengthen', selected)
            else onWholeBodyActionRef.current?.('lengthen')
          },
        },
        {
          title: 'Tone — More militant',
          description: 'Sharpen the language to a more militant, mobilising tone.',
          iconKey: 'militant',
          keywords: ['tone', 'militant', 'fight', 'fierce'],
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).run()
            const selected = getEditorSelectedText(editor)
            if (selected) onSelectionActionRef.current?.('tone:militant', selected)
            else onWholeBodyActionRef.current?.('tone:militant')
          },
        },
        {
          title: 'Tone — Solidarity',
          description: 'Warmer, collective tone emphasising solidarity.',
          iconKey: 'solidarity',
          keywords: ['tone', 'solidarity', 'warm', 'collective'],
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).run()
            const selected = getEditorSelectedText(editor)
            if (selected) onSelectionActionRef.current?.('tone:solidarity', selected)
            else onWholeBodyActionRef.current?.('tone:solidarity')
          },
        },
        {
          title: 'Tone — Plain English (worksite)',
          description: 'Plain, direct language suited to a worksite leaflet.',
          iconKey: 'plain',
          keywords: ['tone', 'plain', 'simple', 'leaflet'],
          command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).run()
            const selected = getEditorSelectedText(editor)
            if (selected) onSelectionActionRef.current?.('tone:plain', selected)
            else onWholeBodyActionRef.current?.('tone:plain')
          },
        },
      ],
      [],
    )

    type AnyListComponent = React.ComponentType<{
      items: unknown[]
      command: (item: unknown) => void
    }>
    const SlashRenderer = useMemo(
      () => makeSuggestionRenderer(SlashCommandList as unknown as AnyListComponent),
      [],
    )
    const MergeRenderer = useMemo(
      () =>
        makeSuggestionRenderer(MergeFieldSuggestionList as unknown as AnyListComponent),
      [],
    )

    const editor = useEditor(
      {
        immediatelyRender: false,
        extensions: [
          StarterKit.configure({
            heading: { levels: [2, 3] },
            // We supply our own placeholder & character count.
          }),
          Link.configure({
            openOnClick: false,
            HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
          }),
          Underline,
          Placeholder.configure({
            placeholder: placeholder ?? 'Write the email body. Type / for AI, {{ for merge fields.',
          }),
          CharacterCount,
          MergeFieldMention.configure({
            HTMLAttributes: { class: 'merge-field-chip' },
            suggestion: {
              char: '{{',
              items: ({ query }: { query: string }) => variableSuggestions(query),
              render: MergeRenderer,
            },
          }),
          SlashMenu.configure({
            commands: slashCommands,
            suggestion: {
              char: '/',
              items: ({ query }: { query: string }) =>
                filterCommands(slashCommands, query),
              render: SlashRenderer,
            },
          }),
        ],
        content: initialContent,
        editorProps: {
          attributes: {
            class:
              'prose prose-sm max-w-none focus:outline-none min-h-[420px] px-6 py-5 text-[15px] leading-relaxed',
          },
        },
        onUpdate: ({ editor }) => {
          const html = editor.getHTML()
          const text = editor.getText({ blockSeparator: '\n\n' })
          const json = editor.getJSON()
          onChangeRef.current({
            html: sanitizeForExport(html),
            text,
            json,
          })
        },
      },
      // Editor instance is created once on mount; subsequent content
      // updates go through the imperative ref API (setContent / replaceAllWith).
      [],
    )

    // Track which mode we're in. If switching to plain from rich, take the
    // current text snapshot. If switching back to rich, re-inject that text
    // into the editor as chip HTML.
    useEffect(() => {
      if (!editor) return
      if (mode === 'plain') {
        const text = editor.getText({ blockSeparator: '\n\n' })
        setPlainValue(text)
      } else {
        const chipHtml = plainTextToChipHtml(plainValue)
        editor.commands.setContent(chipHtml, { emitUpdate: false })
        // Notify host that mode swap stabilised content
        onChangeRef.current({
          html: sanitizeForExport(editor.getHTML()),
          text: editor.getText({ blockSeparator: '\n\n' }),
          json: editor.getJSON(),
        })
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, editor])

    useImperativeHandle(
      ref,
      () => ({
        getOutput: () => {
          if (mode === 'plain') {
            return {
              html: sanitizeForExport(plainTextToChipHtml(plainValue)),
              text: plainValue,
              json: { type: 'doc', content: [] },
            }
          }
          return {
            html: sanitizeForExport(editor?.getHTML() ?? ''),
            text: editor?.getText({ blockSeparator: '\n\n' }) ?? '',
            json: editor?.getJSON() ?? { type: 'doc', content: [] },
          }
        },
        setContent: (html: string, plain?: string) => {
          if (mode === 'plain') {
            const text = plain ?? stripHtmlToText(html)
            setPlainValue(text)
            onChangeRef.current({
              html: sanitizeForExport(plainTextToChipHtml(text)),
              text,
              json: { type: 'doc', content: [] },
            })
            return
          }
          const withChips = parseHtmlWithMergeFields(html)
          editor?.commands.setContent(withChips, { emitUpdate: true })
        },
        insertMergeField: (key: string) => {
          if (mode === 'plain') {
            const ta = plainRef.current
            if (!ta) {
              setPlainValue((p) => `${p}{{${key}}}`)
              return
            }
            const start = ta.selectionStart
            const end = ta.selectionEnd
            const next = plainValue.slice(0, start) + `{{${key}}}` + plainValue.slice(end)
            setPlainValue(next)
            requestAnimationFrame(() => {
              const pos = start + `{{${key}}}`.length
              ta.setSelectionRange(pos, pos)
              ta.focus()
            })
            return
          }
          editor?.commands.insertMergeField(key)
        },
        focus: () => {
          if (mode === 'plain') plainRef.current?.focus()
          else editor?.commands.focus()
        },
        getSelectedText: () => {
          if (mode === 'plain') {
            const ta = plainRef.current
            if (!ta) return ''
            return plainValue.slice(ta.selectionStart, ta.selectionEnd)
          }
          return editor ? getEditorSelectedText(editor) : ''
        },
        replaceSelectionWith: (text: string) => {
          if (mode === 'plain') {
            const ta = plainRef.current
            if (!ta) {
              setPlainValue((p) => p + text)
              return
            }
            const start = ta.selectionStart
            const end = ta.selectionEnd
            const next = plainValue.slice(0, start) + text + plainValue.slice(end)
            setPlainValue(next)
            return
          }
          if (!editor) return
          const chipHtml = plainTextToChipHtml(text)
          editor.chain().focus().deleteSelection().insertContent(chipHtml).run()
        },
        replaceAllWith: (text: string) => {
          if (mode === 'plain') {
            setPlainValue(text)
            return
          }
          if (!editor) return
          const chipHtml = plainTextToChipHtml(text)
          editor.commands.setContent(chipHtml, { emitUpdate: true })
        },
      }),
      [editor, mode, plainValue],
    )

    const handlePlainChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const v = e.target.value
        setPlainValue(v)
        onChangeRef.current({
          html: sanitizeForExport(plainTextToChipHtml(v)),
          text: v,
          json: { type: 'doc', content: [] },
        })
      },
      [],
    )

    if (mode === 'plain') {
      return (
        <div className="flex flex-col">
          <PlainMergeFieldToolbar
            onInsert={(key) => {
              const ta = plainRef.current
              if (!ta) {
                setPlainValue((p) => `${p}{{${key}}}`)
                return
              }
              const start = ta.selectionStart
              const end = ta.selectionEnd
              const next =
                plainValue.slice(0, start) + `{{${key}}}` + plainValue.slice(end)
              setPlainValue(next)
              onChangeRef.current({
                html: sanitizeForExport(plainTextToChipHtml(next)),
                text: next,
                json: { type: 'doc', content: [] },
              })
              requestAnimationFrame(() => {
                const pos = start + `{{${key}}}`.length
                ta.setSelectionRange(pos, pos)
                ta.focus()
              })
            }}
          />
          <textarea
            ref={plainRef}
            value={plainValue}
            onChange={handlePlainChange}
            placeholder={placeholder ?? 'Write the email body in plain text.'}
            className="w-full min-h-[420px] px-6 py-5 font-mono text-sm leading-relaxed resize-none outline-none border-t bg-background"
          />
        </div>
      )
    }

    return (
      <div className="flex flex-col relative">
        <EditorToolbar editor={editor} />
        {editor && (
          <SelectionFloatingToolbar
            editor={editor}
            onAction={(action) => {
              const selected = getEditorSelectedText(editor)
              if (selected) onSelectionActionRef.current?.(action, selected)
            }}
          />
        )}
        <EditorContent editor={editor} className="border-t bg-background" />
      </div>
    )
  },
)

function SelectionFloatingToolbar({
  editor,
  onAction,
}: {
  editor: Editor
  onAction: (action: SelectionAction) => void
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const update = () => {
      const { from, to, empty } = editor.state.selection
      if (empty) {
        setPos(null)
        return
      }
      try {
        const start = editor.view.coordsAtPos(from)
        const end = editor.view.coordsAtPos(to)
        const top = Math.min(start.top, end.top) - 44
        const left = (start.left + end.left) / 2
        setPos({ top, left })
      } catch {
        setPos(null)
      }
    }
    const handleBlur = () => {
      setTimeout(() => {
        if (editor.state.selection.empty) setPos(null)
      }, 150)
    }
    editor.on('selectionUpdate', update)
    editor.on('blur', handleBlur)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('blur', handleBlur)
    }
  }, [editor])

  if (!pos) return null

  return (
    <div
      role="toolbar"
      aria-label="AI selection actions"
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)', zIndex: 60 }}
      className="rounded-md border bg-popover text-popover-foreground shadow-md p-1 flex items-center gap-0.5"
    >
      <BubbleAction
        label="Rewrite"
        icon={<Wand2 className="h-3.5 w-3.5" />}
        onClick={() => onAction('rewrite')}
      />
      <BubbleAction
        label="Shorten"
        icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
        onClick={() => onAction('shorten')}
      />
      <BubbleAction
        label="Lengthen"
        icon={<ArrowUpFromLine className="h-3.5 w-3.5" />}
        onClick={() => onAction('lengthen')}
      />
      <Separator orientation="vertical" className="h-5 mx-0.5" />
      <BubbleAction
        label="Militant"
        icon={<Megaphone className="h-3.5 w-3.5" />}
        onClick={() => onAction('tone:militant')}
      />
      <BubbleAction
        label="Solidarity"
        icon={<Heart className="h-3.5 w-3.5" />}
        onClick={() => onAction('tone:solidarity')}
      />
      <BubbleAction
        label="Plain English"
        icon={<BookOpen className="h-3.5 w-3.5" />}
        onClick={() => onAction('tone:plain')}
      />
    </div>
  )
}

function BubbleAction({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs gap-1"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  )
}

function EditorToolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null

  const isActive = (name: string, opts?: Record<string, unknown>) =>
    editor.isActive(name, opts)

  return (
    <div
      role="toolbar"
      aria-label="Email formatting"
      className="flex items-center gap-0.5 flex-wrap px-3 py-1.5 bg-muted/30"
    >
      <ToolbarToggle
        active={isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold (Cmd/Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle
        active={isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic (Cmd/Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle
        active={isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        label="Underline (Cmd/Ctrl+U)"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <Separator orientation="vertical" className="h-5 mx-0.5" />
      <ToolbarToggle
        active={isActive('paragraph') && !isActive('heading')}
        onClick={() => editor.chain().focus().setParagraph().run()}
        label="Paragraph"
      >
        <Pilcrow className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle
        active={isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Heading 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle
        active={isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        label="Heading 3"
      >
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <Separator orientation="vertical" className="h-5 mx-0.5" />
      <ToolbarToggle
        active={isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Bullet list"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <ToolbarToggle
        active={isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Numbered list"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <Separator orientation="vertical" className="h-5 mx-0.5" />
      <ToolbarToggle
        active={isActive('link')}
        onClick={() => {
          const prev = editor.getAttributes('link').href as string | undefined
          const url = window.prompt('Link URL', prev ?? 'https://')
          if (url === null) return
          if (!url || url === '') {
            editor.chain().focus().unsetLink().run()
            return
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
        }}
        label="Link (Cmd/Ctrl+K)"
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolbarToggle>
      <Separator orientation="vertical" className="h-5 mx-0.5" />
      <MergeFieldDropdown
        onPick={(key) => editor.commands.insertMergeField(key)}
      />
    </div>
  )
}

function ToolbarToggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn('h-7 w-7 p-0', active && 'bg-accent text-accent-foreground')}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function MergeFieldDropdown({ onPick }: { onPick: (key: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
          <VariableIcon className="h-3.5 w-3.5" />
          Merge field
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="start">
        <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Recipient (resolved by Action Network)
        </p>
        {RECIPIENT_VARIABLES.map((v) => (
          <button
            key={v.key}
            className="w-full text-left px-2 py-1.5 rounded-sm text-sm flex items-center justify-between hover:bg-accent/60"
            onClick={() => onPick(v.key)}
          >
            <span className="font-medium">{v.label}</span>
            <code className="text-[10px] text-muted-foreground font-mono">
              {`{{${v.key}}}`}
            </code>
          </button>
        ))}
        <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
          Campaign context
        </p>
        {CAMPAIGN_CONTEXT_VARIABLES.map((v) => (
          <button
            key={v.key}
            className="w-full text-left px-2 py-1.5 rounded-sm text-sm flex items-center justify-between hover:bg-accent/60"
            onClick={() => onPick(v.key)}
          >
            <span className="font-medium truncate">{v.label}</span>
            <code className="text-[10px] text-muted-foreground font-mono ml-2">
              {`{{${v.key}}}`}
            </code>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function PlainMergeFieldToolbar({
  onInsert,
}: {
  onInsert: (key: string) => void
}) {
  return (
    <div
      role="toolbar"
      aria-label="Plain-text merge fields"
      className="flex items-center gap-1 flex-wrap px-3 py-1.5 bg-muted/30 border-b"
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">
        Recipient:
      </span>
      {RECIPIENT_VARIABLES.map((v) => (
        <Button
          key={v.key}
          type="button"
          variant="outline"
          size="sm"
          className="h-6 text-[10px] font-mono px-1.5"
          title={v.description}
          onClick={() => onInsert(v.key)}
        >
          {v.key}
        </Button>
      ))}
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mx-1">
        Campaign:
      </span>
      {CAMPAIGN_CONTEXT_VARIABLES.map((v) => (
        <Button
          key={v.key}
          type="button"
          variant="outline"
          size="sm"
          className="h-6 text-[10px] font-mono px-1.5"
          title={v.description}
          onClick={() => onInsert(v.key)}
        >
          {v.key}
        </Button>
      ))}
    </div>
  )
}

function getEditorSelectedText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection
  if (empty) return ''
  return editor.state.doc.textBetween(from, to, '\n')
}

function stripHtmlToText(html: string): string {
  if (typeof window === 'undefined') return html.replace(/<[^>]+>/g, '')
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || ''
}
