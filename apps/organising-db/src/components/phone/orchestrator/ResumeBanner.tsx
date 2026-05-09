'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { Button } from '@/components/ui/button'
import { Phone, X } from 'lucide-react'
import { toast } from 'sonner'
import type { PhoneCallAction } from '@/types/phone-call-action'

interface Props {
  campaignId: number | string
}

export function ResumeBanner({ campaignId }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [dismissed, setDismissed] = useState(false)

  const { data: inProgressAction } = useQuery<PhoneCallAction | null>({
    queryKey: ['phone-call-actions', 'in-progress', String(campaignId)],
    queryFn: async () => {
      if (!user) return null
      const { data, error } = await supabase
        .from('phone_call_actions')
        .select('*')
        .eq('campaign_id', Number(campaignId))
        .eq('created_by', user.id)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) return null
      return data ? (data as PhoneCallAction) : null
    },
    enabled: !!user,
    retry: false,
  })

  const abandonMutation = useMutation({
    mutationFn: async (actionId: number) => {
      const { error } = await supabase
        .from('phone_call_actions')
        .update({ status: 'abandoned' })
        .eq('action_id', actionId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['phone-call-actions', 'in-progress', String(campaignId)],
      })
    },
    onError: (err) => {
      toast.error('Could not dismiss action', {
        description: err instanceof Error ? err.message : String(err),
      })
    },
  })

  if (dismissed || !inProgressAction) return null

  function handleDismiss() {
    setDismissed(true)
    if (inProgressAction) {
      abandonMutation.mutate(inProgressAction.action_id)
    }
  }

  function handleResume() {
    if (!inProgressAction) return
    const { action_id, entry_branch, script_id } = inProgressAction
    if (entry_branch === 'script_first') {
      const url = script_id
        ? `/campaigns/phone-wizard?campaign_id=${campaignId}&action_id=${action_id}&script_id=${script_id}`
        : `/campaigns/phone-wizard?campaign_id=${campaignId}&action_id=${action_id}`
      router.push(url)
    } else {
      router.push(
        `/campaigns/${campaignId}/phone/lists/new?action_id=${action_id}`
      )
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <Phone className="h-4 w-4 text-amber-600 flex-shrink-0" />
      <p className="flex-1 text-amber-800">
        You have an in-progress phone call action for this campaign.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-300 text-amber-800 hover:bg-amber-100"
        onClick={handleResume}
      >
        Resume
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        className="text-amber-500 hover:text-amber-700 transition-colors"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
