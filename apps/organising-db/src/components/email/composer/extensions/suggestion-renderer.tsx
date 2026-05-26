'use client'

import { createRoot, type Root } from 'react-dom/client'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { ComponentType } from 'react'

/**
 * Lightweight popover renderer for TipTap Suggestion plugins.
 *
 * Avoids depending on the deprecated `tippy.js` package: instead we just
 * position a div absolutely off the editor's selection client-rect and
 * mount a React component into it. Falls back to bottom-of-screen if the
 * client-rect is unavailable.
 */

export interface SuggestionRendererListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

interface RendererInternals<I> {
  el: HTMLDivElement | null
  root: Root | null
  component: ComponentType<{
    items: I[]
    command: (item: I) => void
    ref: React.RefObject<SuggestionRendererListRef | null>
  }>
  listRef: React.RefObject<SuggestionRendererListRef | null>
}

export function makeSuggestionRenderer<I>(
  Component: ComponentType<{
    items: I[]
    command: (item: I) => void
  }>,
) {
  return () => {
    let state: RendererInternals<I> | null = null
    let listRef: { current: SuggestionRendererListRef | null } = { current: null }

    function mount(props: SuggestionProps<I>) {
      const el = document.createElement('div')
      el.style.position = 'absolute'
      el.style.zIndex = '60'
      document.body.appendChild(el)
      const root = createRoot(el)

      const InnerWithRef = (innerProps: { items: I[]; command: (item: I) => void }) => {
        const RefForwarded = Component as unknown as React.ComponentType<{
          items: I[]
          command: (item: I) => void
          ref?: React.Ref<SuggestionRendererListRef>
        }>
        return (
          <RefForwarded
            items={innerProps.items}
            command={innerProps.command}
            ref={(r: SuggestionRendererListRef | null) => {
              listRef.current = r
            }}
          />
        )
      }

      // Reset list ref when remounting
      listRef = { current: null }

      state = {
        el,
        root,
        component: InnerWithRef as unknown as RendererInternals<I>['component'],
        listRef: listRef as unknown as RendererInternals<I>['listRef'],
      }
      root.render(<InnerWithRef items={props.items} command={props.command} />)
      position(el, props)
    }

    function position(el: HTMLDivElement, props: SuggestionProps<I>) {
      const rect = props.clientRect?.()
      if (!rect) {
        el.style.top = '40%'
        el.style.left = '40%'
        return
      }
      const elWidth = 280
      const elHeight = 200 // rough max
      let top = rect.bottom + window.scrollY + 4
      let left = rect.left + window.scrollX
      // Clip to viewport
      if (left + elWidth > window.scrollX + window.innerWidth - 8) {
        left = window.scrollX + window.innerWidth - elWidth - 8
      }
      if (top + elHeight > window.scrollY + window.innerHeight - 8) {
        top = rect.top + window.scrollY - elHeight - 4
      }
      el.style.top = `${top}px`
      el.style.left = `${left}px`
    }

    return {
      onStart: (props: SuggestionProps<I>) => {
        mount(props)
      },
      onUpdate: (props: SuggestionProps<I>) => {
        if (!state) return
        const Inner = state.component as unknown as React.ComponentType<{
          items: I[]
          command: (item: I) => void
        }>
        state.root!.render(<Inner items={props.items} command={props.command} />)
        position(state.el!, props)
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === 'Escape') return false
        return listRef.current?.onKeyDown(props) ?? false
      },
      onExit: () => {
        if (!state) return
        state.root?.unmount()
        state.el?.remove()
        state = null
        listRef.current = null
      },
    }
  }
}
