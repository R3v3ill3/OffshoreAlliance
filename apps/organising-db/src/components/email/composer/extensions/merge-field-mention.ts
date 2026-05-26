/**
 * MergeFieldMention — TipTap node that renders {{first_name}}-style
 * merge tokens as atomic, read-only "chips" inside the editor.
 *
 * Output strategy:
 *   - `renderText` → "{{key}}" — what flows into editor.getText() and
 *     ultimately into `campaign_comms_drafts.body` (plain text).
 *   - `renderHTML` → "{{key}}" wrapped in a `<span data-merge-field>`
 *     chip with the user-friendly label as the visible text. The wrapping
 *     span is stripped by the post-export sanitizer
 *     (`stripMergeFieldChips`) before the HTML is pushed to AN or stored.
 *   - On LOAD, `parseHtmlWithMergeFields` rewrites raw `{{key}}` tokens
 *     into the same chip markup so TipTap can re-hydrate them as
 *     Mention nodes. Existing drafts (which only have raw tokens) round-
 *     trip cleanly.
 */

import { mergeAttributes, Node } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import {
  ALL_TEMPLATE_VARIABLES,
  type TemplateVariable,
} from '@/lib/comms/template-variables'

export interface MergeFieldOptions {
  HTMLAttributes: Record<string, unknown>
  suggestion: Omit<SuggestionOptions, 'editor'>
}

export const MergeFieldPluginKey = new PluginKey('mergeField')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mergeField: {
      insertMergeField: (key: string) => ReturnType
    }
  }
}

export const MergeFieldMention = Node.create<MergeFieldOptions>({
  name: 'mergeField',

  inline: true,
  group: 'inline',
  selectable: true,
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      suggestion: {
        char: '{{',
        pluginKey: MergeFieldPluginKey,
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: 'mergeField',
                attrs: { id: (props as { id: string }).id },
              },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          const type = state.schema.nodes.mergeField
          return !!$from.parent.type.contentMatch.matchType(type)
        },
      },
    }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-merge-field') || null,
        renderHTML: (attrs) =>
          attrs.id ? { 'data-merge-field': attrs.id } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-merge-field]',
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const id: string = node.attrs.id
    return [
      'span',
      mergeAttributes(
        {
          class: 'merge-field-chip',
          'data-merge-field': id,
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      `{{${id}}}`,
    ]
  },

  renderText({ node }) {
    return `{{${node.attrs.id}}}`
  },

  addCommands() {
    return {
      insertMergeField:
        (key: string) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent([
              { type: 'mergeField', attrs: { id: key } },
              { type: 'text', text: ' ' },
            ])
            .run(),
    }
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          let isMention = false
          const { selection } = state
          const { empty, anchor } = selection
          if (!empty) return false
          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              isMention = true
              tr.insertText('', pos, pos + node.nodeSize)
              return false
            }
            return true
          })
          return isMention
        }),
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

export function variableSuggestions(query: string): TemplateVariable[] {
  const q = query.trim().toLowerCase()
  const all = ALL_TEMPLATE_VARIABLES
  if (!q) return all
  return all.filter(
    (v) =>
      v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q),
  )
}

// Chip-HTML transforms moved to `@/lib/comms/chip-html` so server code can
// import them without dragging in TipTap. Re-exported here for backward
// compatibility with existing call sites.
export {
  parseHtmlWithMergeFields,
  plainTextToChipHtml,
  stripMergeFieldChips,
} from '@/lib/comms/chip-html'
