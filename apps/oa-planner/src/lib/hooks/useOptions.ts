'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useAmbitionOptions(stageNumber: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['ambition-options', stageNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ambition_options')
        .select('*')
        .eq('stage_number', stageNumber)
        .eq('is_active', true)
        .order('use_count', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!stageNumber,
  })
}

export function useWtpCategories(stageNumber?: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['wtp-categories', stageNumber],
    queryFn: async () => {
      const query = supabase
        .from('wtp_categories')
        .select('*, wtp_options(*)')
        .eq('is_active', true)
        .order('sort_order')

      const { data, error } = await query

      if (error) throw error

      // Filter by stage if provided
      if (stageNumber) {
        return data.filter(
          (cat) => !cat.applies_to_stages || cat.applies_to_stages.includes(stageNumber)
        )
      }

      return data
    },
  })
}

export function useCapacityOptions(stageNumber: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['capacity-options', stageNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('capacity_options')
        .select('*')
        .eq('stage_number', stageNumber)
        .eq('is_active', true)
        .order('use_count', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!stageNumber,
  })
}

export function useManagementSystemOptions(stageNumber: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['management-system-options', stageNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('management_system_options')
        .select('*')
        .eq('stage_number', stageNumber)
        .eq('is_active', true)
        .order('use_count', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!stageNumber,
  })
}

export function useAgreements() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['agreements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agreements')
        .select(`
          agreement_id,
          agreement_name,
          short_name,
          status,
          expiry_date,
          commencement_date,
          employer_id,
          sector_id,
          employers(employer_id, employer_name),
          sectors(sector_name),
          agreement_worksites(worksites(worksite_id, worksite_name))
        `)
        .in('status', ['Current', 'Expired', 'Under_Negotiation'])
        .order('agreement_name')

      if (error) throw error
      return data
    },
  })
}

export function useOrganisers() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['organisers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organisers')
        .select('*')
        .eq('is_active', true)
        .order('organiser_name')

      if (error) throw error
      return data
    },
  })
}

export function useLeadOrganisers() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['lead-organisers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, organiser_id, reports_to, organisers(organiser_id, organiser_name, email)')
        .eq('work_role', 'lead_organiser')
        .not('organiser_id', 'is', null)

      if (error) throw error

      return data.filter((up) => (up.organisers as { organiser_id: number } | null)?.organiser_id)
        .map((up) => {
          const org = up.organisers as { organiser_id: number; organiser_name: string; email: string | null }
          return {
            organiser_id: up.organiser_id as number,
            organiser_name: org.organiser_name,
            email: org.email,
            user_profile_id: up.user_id,
          }
        })
        .sort((a, b) => a.organiser_name.localeCompare(b.organiser_name))
    },
  })
}

export function useCurrentUserProfile() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['current-user-profile'],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('not authenticated')

      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, work_role, organiser_id, reports_to')
        .eq('user_id', user.id)
        .single()

      if (error) throw error
      return data
    },
  })
}

export function useWorksites(agreementId?: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['worksites', agreementId],
    queryFn: async () => {
      if (agreementId) {
        const { data, error } = await supabase
          .from('agreement_worksites')
          .select('worksites(*)')
          .eq('agreement_id', agreementId)

        if (error) throw error
        return data?.map((aw) => aw.worksites).filter(Boolean) || []
      }

      const { data, error } = await supabase
        .from('worksites')
        .select('*')
        .order('worksite_name')

      if (error) throw error
      return data
    },
  })
}

export function useSectors() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['sectors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sectors')
        .select('*')
        .order('sector_name')

      if (error) throw error
      return data
    },
  })
}

export function useAddCustomAmbitionOption() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      stage_number: number
      category: string
      option_text: string
      has_variable: boolean
      variable_label?: string
      variable_type?: string
    }) => {
      const { data, error } = await supabase
        .from('ambition_options')
        .insert({ ...params, is_system_default: false })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ambition-options', variables.stage_number] })
    },
  })
}

// Returns all active organisers regardless of work_role — used for campaign team picker
export function useAllOrganisers() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['all-organisers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organisers')
        .select('organiser_id, organiser_name, email, user_profiles(user_id, work_role, display_name)')
        .eq('is_active', true)
        .order('organiser_name')

      if (error) throw error
      return data
    },
  })
}

export function useAddCustomWtpOption() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { category_id: number; option_text: string; description?: string }) => {
      const { data, error } = await supabase
        .from('wtp_options')
        .insert({ ...params, is_system_default: false })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wtp-categories'] })
    },
  })
}
