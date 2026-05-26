/**
 * SlashMenu — TipTap suggestion plugin invoked by typing `/` at the
 * start of a block. Surfaces editor + AI commands.
 *
 * Concrete commands are wired in by the host editor (so they can dispatch
 * AI requests, open the brief panel, etc). This file defines the
 * extension and the React renderer wiring; the command callbacks are
 * supplied at extension-configuration time.
 */

import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'

export interface SlashCommand {
  title: string
  description: string
  keywords?: string[]
  /** Optional icon component — host passes a lucide-react node. */
  iconKey?: string
  /** Run when the command is selected. range is the slash-trigger range to delete. */
  command: (props: {
    editor: import('@tiptap/core').Editor
    range: { from: number; to: number }
  }) => void
}

export interface SlashMenuOptions {
  commands: SlashCommand[]
  suggestion: Omit<SuggestionOptions, 'editor'>
}

export const SlashMenuPluginKey = new PluginKey('slashMenu')

export const SlashMenu = Extension.create<SlashMenuOptions>({
  name: 'slashMenu',

  addOptions() {
    return {
      commands: [],
      suggestion: {
        char: '/',
        pluginKey: SlashMenuPluginKey,
        startOfLine: false,
        allowSpaces: true,
        command: ({ editor, range, props }) => {
          const cmd = (props as unknown as SlashCommand).command
          if (typeof cmd === 'function') cmd({ editor, range })
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})

export function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  return commands.filter((c) => {
    if (c.title.toLowerCase().includes(q)) return true
    if (c.description.toLowerCase().includes(q)) return true
    return (c.keywords ?? []).some((k) => k.toLowerCase().includes(q))
  })
}
