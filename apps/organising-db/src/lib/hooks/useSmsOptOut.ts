'use client'

/**
 * Shared staff "Do not contact (SMS)" mutation — the single pathway for
 * staff-sourced opt-out writes, extracted from SmsMemberSidebar so
 * every chat surface (member sidebar, P2P board rows, thread
 * quick-view) uses the identical write:
 *
 *   workers.sms_opt_out = true, sms_opt_out_source = 'staff'
 *   (or a plain sms_opt_out = false to lift it).
 *
 * Opting out suppresses ALL SMS to the member (blasts, surveys, chats,
 * 1:1 replies) union-wide — callers must confirm with the user before
 * mutating (see confirmSmsDoNotContact).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface StaffSmsOptOutInput {
  workerId: number
  optOut: boolean
}

/**
 * Standard confirm wording for the "Do not contact (SMS)" control.
 * Returns true when the user confirmed (opt-out only; lifting an
 * opt-out is not destructive and needs no confirm).
 */
export function confirmSmsDoNotContact(memberName?: string | null): boolean {
  return window.confirm(
    `Mark ${memberName || 'this member'} as "Do not contact (SMS)"?\n\n` +
      'This opts them out of ALL SMS from the union — blasts, surveys, ' +
      'chat boards and 1:1 replies — until a staff member lifts it or ' +
      'they text START.',
  )
}

export function useStaffSmsOptOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ workerId, optOut }: StaffSmsOptOutInput) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('workers')
        .update(
          optOut
            ? {
                sms_opt_out: true,
                sms_opt_out_at: new Date().toISOString(),
                sms_opt_out_source: 'staff',
              }
            : { sms_opt_out: false },
        )
        .eq('worker_id', workerId)
      if (error) throw error
      return { workerId, optOut }
    },
    onSuccess: () => {
      // Every chat surface re-reads opt-out state from its own query.
      queryClient.invalidateQueries({ queryKey: ['sms-conversation'] })
      queryClient.invalidateQueries({ queryKey: ['sms-conversations'] })
      queryClient.invalidateQueries({ queryKey: ['sms-p2p-board'] })
      queryClient.invalidateQueries({ queryKey: ['worker-sms-conversations'] })
      // New-chat dialog: both the search results and the preset-worker
      // lookup carry sms_opt_out.
      queryClient.invalidateQueries({ queryKey: ['sms-new-chat-workers'] })
      queryClient.invalidateQueries({ queryKey: ['sms-new-chat-worker'] })
    },
  })
}
