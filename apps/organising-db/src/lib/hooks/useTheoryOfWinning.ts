'use client'

import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import type { TheoryOfWinningRequest, TheoryOfWinningResponse } from '@/types/planner-types'

export function useGenerateTheory() {
  return useAuthAwareMutation({
    mutationFn: async (request: TheoryOfWinningRequest): Promise<TheoryOfWinningResponse> => {
      const response = await fetch('/api/theory-of-winning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      const text = await response.text()
      const parsePos = 7369
      // #region agent log
      fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a95cb3' },
        body: JSON.stringify({
          sessionId: 'a95cb3',
          runId: 'pre-fix',
          hypothesisId: 'H1-H2-H5',
          location: 'useTheoryOfWinning.ts:mutationFn',
          message: 'theory-of-winning raw response',
          data: {
            status: response.status,
            ok: response.ok,
            contentType: response.headers.get('content-type'),
            bodyLength: text.length,
            bodyHead: text.slice(0, 500),
            bodyAround7369: text.slice(Math.max(0, parsePos - 80), parsePos + 80),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion

      if (!response.ok) {
        let message = `HTTP error ${response.status}`
        try {
          const errJson = JSON.parse(text) as { error?: string }
          message = errJson.error || message
        } catch {
          // #region agent log
          fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a95cb3' },
            body: JSON.stringify({
              sessionId: 'a95cb3',
              runId: 'pre-fix',
              hypothesisId: 'H1',
              location: 'useTheoryOfWinning.ts:mutationFn',
              message: 'error response body not JSON',
              data: { status: response.status, bodyHead: text.slice(0, 600) },
              timestamp: Date.now(),
            }),
          }).catch(() => {})
          // #endregion
        }
        throw new Error(message)
      }

      try {
        return JSON.parse(text) as TheoryOfWinningResponse
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a95cb3' },
          body: JSON.stringify({
            sessionId: 'a95cb3',
            runId: 'pre-fix',
            hypothesisId: 'H2-H5',
            location: 'useTheoryOfWinning.ts:mutationFn',
            message: 'JSON.parse failed on ok response',
            data: {
              err: e instanceof Error ? e.message : String(e),
              bodyLength: text.length,
              bodyAround7369: text.slice(Math.max(0, parsePos - 120), parsePos + 120),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        throw e
      }
    },
  })
}
