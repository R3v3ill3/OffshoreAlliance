export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      _archive_call_attempt_outcomes_20260613: {
        Row: {
          attempt_id: number | null
          outcome_id: number | null
          response_value: string | null
        }
        Insert: {
          attempt_id?: number | null
          outcome_id?: number | null
          response_value?: string | null
        }
        Update: {
          attempt_id?: number | null
          outcome_id?: number | null
          response_value?: string | null
        }
        Relationships: []
      }
      _archive_orphan_call_lists_20260612: {
        Row: {
          campaign_id: number | null
          completed_items: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          list_id: number | null
          name: string | null
          priority_strategy: string | null
          script_id: number | null
          source_filters: Json | null
          status: string | null
          total_items: number | null
          updated_at: string | null
        }
        Insert: {
          campaign_id?: number | null
          completed_items?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          list_id?: number | null
          name?: string | null
          priority_strategy?: string | null
          script_id?: number | null
          source_filters?: Json | null
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
        }
        Update: {
          campaign_id?: number | null
          completed_items?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          list_id?: number | null
          name?: string | null
          priority_strategy?: string | null
          script_id?: number | null
          source_filters?: Json | null
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      _archive_orphan_call_scripts_20260612: {
        Row: {
          base_script_id: number | null
          call_objective: string | null
          campaign_id: number | null
          created_at: string | null
          created_by: string | null
          draft_id: number | null
          estimated_duration_minutes: number | null
          script_id: number | null
          status: string | null
          title: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          base_script_id?: number | null
          call_objective?: string | null
          campaign_id?: number | null
          created_at?: string | null
          created_by?: string | null
          draft_id?: number | null
          estimated_duration_minutes?: number | null
          script_id?: number | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          base_script_id?: number | null
          call_objective?: string | null
          campaign_id?: number | null
          created_at?: string | null
          created_by?: string | null
          draft_id?: number | null
          estimated_duration_minutes?: number | null
          script_id?: number | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: []
      }
      activist_tasks: {
        Row: {
          acknowledgement: string | null
          activist_task_id: number
          activity_id: number | null
          assigned_at: string | null
          campaign_id: number
          campaign_moment: string | null
          checkin_dates: Json | null
          commitment: string | null
          created_at: string
          created_by: string | null
          debrief_date: string | null
          due_date: string | null
          inoculation: string | null
          next_task_id: number | null
          outcome: string | null
          outcome_notes: string | null
          reassessment_notes: string | null
          resources_provided: string | null
          responsibility: string
          rung: number | null
          set_in_woc_meeting_id: number | null
          six_conditions: Json
          status: string
          task_list_id: number | null
          updated_at: string
          walkthrough_plan: string | null
          why_it_matters: string | null
          worker_id: number
        }
        Insert: {
          acknowledgement?: string | null
          activist_task_id?: number
          activity_id?: number | null
          assigned_at?: string | null
          campaign_id: number
          campaign_moment?: string | null
          checkin_dates?: Json | null
          commitment?: string | null
          created_at?: string
          created_by?: string | null
          debrief_date?: string | null
          due_date?: string | null
          inoculation?: string | null
          next_task_id?: number | null
          outcome?: string | null
          outcome_notes?: string | null
          reassessment_notes?: string | null
          resources_provided?: string | null
          responsibility: string
          rung?: number | null
          set_in_woc_meeting_id?: number | null
          six_conditions?: Json
          status?: string
          task_list_id?: number | null
          updated_at?: string
          walkthrough_plan?: string | null
          why_it_matters?: string | null
          worker_id: number
        }
        Update: {
          acknowledgement?: string | null
          activist_task_id?: number
          activity_id?: number | null
          assigned_at?: string | null
          campaign_id?: number
          campaign_moment?: string | null
          checkin_dates?: Json | null
          commitment?: string | null
          created_at?: string
          created_by?: string | null
          debrief_date?: string | null
          due_date?: string | null
          inoculation?: string | null
          next_task_id?: number | null
          outcome?: string | null
          outcome_notes?: string | null
          reassessment_notes?: string | null
          resources_provided?: string | null
          responsibility?: string
          rung?: number | null
          set_in_woc_meeting_id?: number | null
          six_conditions?: Json
          status?: string
          task_list_id?: number | null
          updated_at?: string
          walkthrough_plan?: string | null
          why_it_matters?: string | null
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "activist_tasks_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "activist_tasks_next_task_id_fkey"
            columns: ["next_task_id"]
            isOneToOne: false
            referencedRelation: "activist_tasks"
            referencedColumns: ["activist_task_id"]
          },
          {
            foreignKeyName: "activist_tasks_next_task_id_fkey"
            columns: ["next_task_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_activist_register"
            referencedColumns: ["current_task_id"]
          },
          {
            foreignKeyName: "activist_tasks_set_in_woc_meeting_id_fkey"
            columns: ["set_in_woc_meeting_id"]
            isOneToOne: false
            referencedRelation: "woc_committee_meetings"
            referencedColumns: ["meeting_id"]
          },
          {
            foreignKeyName: "activist_tasks_task_list_id_fkey"
            columns: ["task_list_id"]
            isOneToOne: false
            referencedRelation: "campaign_task_lists"
            referencedColumns: ["task_list_id"]
          },
          {
            foreignKeyName: "activist_tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "activist_tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "activist_tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      activity_ambitions: {
        Row: {
          activity_id: number
          created_at: string
          created_by: string | null
          id: number
          is_primary: boolean
          notes: string | null
          plan_ambition_id: number
          weight: number
        }
        Insert: {
          activity_id: number
          created_at?: string
          created_by?: string | null
          id?: number
          is_primary?: boolean
          notes?: string | null
          plan_ambition_id: number
          weight?: number
        }
        Update: {
          activity_id?: number
          created_at?: string
          created_by?: string | null
          id?: number
          is_primary?: boolean
          notes?: string | null
          plan_ambition_id?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_ambitions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "activity_ambitions_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "activity_ambitions_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "activity_ambitions_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "activity_ambitions_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
        ]
      }
      activity_events: {
        Row: {
          activity_id: number
          concluded_at: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          event_id: number
          event_kind: string
          is_concluded: boolean
          location: string | null
          name: string
          notes: string | null
          outcome: Json | null
          pia_action_id: number | null
          scheduled_at: string | null
        }
        Insert: {
          activity_id: number
          concluded_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          event_id?: number
          event_kind?: string
          is_concluded?: boolean
          location?: string | null
          name: string
          notes?: string | null
          outcome?: Json | null
          pia_action_id?: number | null
          scheduled_at?: string | null
        }
        Update: {
          activity_id?: number
          concluded_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          event_id?: number
          event_kind?: string
          is_concluded?: boolean
          location?: string | null
          name?: string
          notes?: string | null
          outcome?: Json | null
          pia_action_id?: number | null
          scheduled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "activity_events_pia_action_id_fkey"
            columns: ["pia_action_id"]
            isOneToOne: false
            referencedRelation: "pia_actions"
            referencedColumns: ["action_id"]
          },
          {
            foreignKeyName: "activity_events_pia_action_id_fkey"
            columns: ["pia_action_id"]
            isOneToOne: false
            referencedRelation: "v_pia_participation_by_action"
            referencedColumns: ["action_id"]
          },
        ]
      }
      activity_sequence_runs: {
        Row: {
          materialised_activity_id: number | null
          notes: string | null
          run_id: number
          state: string
          step_id: number
          triggered_at: string
        }
        Insert: {
          materialised_activity_id?: number | null
          notes?: string | null
          run_id?: number
          state?: string
          step_id: number
          triggered_at?: string
        }
        Update: {
          materialised_activity_id?: number | null
          notes?: string | null
          run_id?: number
          state?: string
          step_id?: number
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_sequence_runs_materialised_activity_id_fkey"
            columns: ["materialised_activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "activity_sequence_runs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "activity_sequence_steps"
            referencedColumns: ["step_id"]
          },
        ]
      }
      activity_sequence_steps: {
        Row: {
          created_at: string
          delay_minutes: number
          sequence_id: number
          source_activity_id: number | null
          step_id: number
          step_order: number
          target_activity_kind: string
          target_activity_template_key: string
          target_payload: Json
        }
        Insert: {
          created_at?: string
          delay_minutes?: number
          sequence_id: number
          source_activity_id?: number | null
          step_id?: number
          step_order: number
          target_activity_kind: string
          target_activity_template_key: string
          target_payload?: Json
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          sequence_id?: number
          source_activity_id?: number | null
          step_id?: number
          step_order?: number
          target_activity_kind?: string
          target_activity_template_key?: string
          target_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "activity_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "activity_sequences"
            referencedColumns: ["sequence_id"]
          },
          {
            foreignKeyName: "activity_sequence_steps_source_activity_id_fkey"
            columns: ["source_activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
        ]
      }
      activity_sequence_triggers: {
        Row: {
          created_at: string
          event_kind: string
          outcome: string | null
          step_id: number
          threshold_kind: string
          threshold_value: number | null
          trigger_id: number
        }
        Insert: {
          created_at?: string
          event_kind: string
          outcome?: string | null
          step_id: number
          threshold_kind: string
          threshold_value?: number | null
          trigger_id?: number
        }
        Update: {
          created_at?: string
          event_kind?: string
          outcome?: string | null
          step_id?: number
          threshold_kind?: string
          threshold_value?: number | null
          trigger_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_sequence_triggers_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "activity_sequence_steps"
            referencedColumns: ["step_id"]
          },
        ]
      }
      activity_sequences: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          section_plan_id: number
          sequence_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          section_plan_id: number
          sequence_id?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          section_plan_id?: number
          sequence_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_sequences_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "activity_sequences_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "activity_sequences_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "activity_sequences_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      agreement_employers: {
        Row: {
          agreement_id: number
          employer_id: number
          id: number
          is_primary: boolean
        }
        Insert: {
          agreement_id: number
          employer_id: number
          id?: number
          is_primary?: boolean
        }
        Update: {
          agreement_id?: number
          employer_id?: number
          id?: number
          is_primary?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agreement_employers_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_employers_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_employers_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "agreement_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "agreement_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      agreement_organisers: {
        Row: {
          agreement_id: number
          agreement_role: string
          id: number
          is_primary: boolean
          organiser_id: number
        }
        Insert: {
          agreement_id: number
          agreement_role?: string
          id?: number
          is_primary?: boolean
          organiser_id: number
        }
        Update: {
          agreement_id?: number
          agreement_role?: string
          id?: number
          is_primary?: boolean
          organiser_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreement_organisers_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_organisers_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_organisers_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_organisers_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
        ]
      }
      agreement_scopes: {
        Row: {
          agreement_id: number
          id: number
          scope_id: number
        }
        Insert: {
          agreement_id: number
          id?: number
          scope_id: number
        }
        Update: {
          agreement_id?: number
          id?: number
          scope_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreement_scopes_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_scopes_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_scopes_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_scopes_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "work_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      agreement_unions: {
        Row: {
          agreement_id: number
          id: number
          is_primary: boolean
          union_id: number
        }
        Insert: {
          agreement_id: number
          id?: number
          is_primary?: boolean
          union_id: number
        }
        Update: {
          agreement_id?: number
          id?: number
          is_primary?: boolean
          union_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreement_unions_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_unions_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_unions_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_unions_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["union_id"]
          },
        ]
      }
      agreement_worksites: {
        Row: {
          agreement_id: number
          id: number
          mapping_confidence: string | null
          mapping_notes: string | null
          notes: string | null
          worksite_id: number
        }
        Insert: {
          agreement_id: number
          id?: number
          mapping_confidence?: string | null
          mapping_notes?: string | null
          notes?: string | null
          worksite_id: number
        }
        Update: {
          agreement_id?: number
          id?: number
          mapping_confidence?: string | null
          mapping_notes?: string | null
          notes?: string | null
          worksite_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreement_worksites_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_worksites_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_worksites_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreement_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "agreement_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "agreement_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "agreement_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "agreement_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      agreements: {
        Row: {
          agreement_id: number
          agreement_name: string
          agreement_scope: string | null
          commencement_date: string | null
          created_at: string
          date_of_decision: string | null
          decision_no: string
          employer_id: number | null
          expiry_date: string | null
          fwc_link: string | null
          industry_classification: string | null
          is_greenfield: boolean
          is_variation: boolean
          notes: string | null
          sector_id: number | null
          short_name: string | null
          source_sheet: string | null
          status: string
          supersedes_id: number | null
          updated_at: string
          variation_of_id: number | null
        }
        Insert: {
          agreement_id?: number
          agreement_name: string
          agreement_scope?: string | null
          commencement_date?: string | null
          created_at?: string
          date_of_decision?: string | null
          decision_no: string
          employer_id?: number | null
          expiry_date?: string | null
          fwc_link?: string | null
          industry_classification?: string | null
          is_greenfield?: boolean
          is_variation?: boolean
          notes?: string | null
          sector_id?: number | null
          short_name?: string | null
          source_sheet?: string | null
          status?: string
          supersedes_id?: number | null
          updated_at?: string
          variation_of_id?: number | null
        }
        Update: {
          agreement_id?: number
          agreement_name?: string
          agreement_scope?: string | null
          commencement_date?: string | null
          created_at?: string
          date_of_decision?: string | null
          decision_no?: string
          employer_id?: number | null
          expiry_date?: string | null
          fwc_link?: string | null
          industry_classification?: string | null
          is_greenfield?: boolean
          is_variation?: boolean
          notes?: string | null
          sector_id?: number | null
          short_name?: string | null
          source_sheet?: string | null
          status?: string
          supersedes_id?: number | null
          updated_at?: string
          variation_of_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agreements_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "agreements_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "agreements_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "agreements_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["sector_id"]
          },
          {
            foreignKeyName: "agreements_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["sector_id"]
          },
          {
            foreignKeyName: "agreements_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreements_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreements_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreements_variation_of_id_fkey"
            columns: ["variation_of_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreements_variation_of_id_fkey"
            columns: ["variation_of_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreements_variation_of_id_fkey"
            columns: ["variation_of_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
        ]
      }
      ai_cache_audit_log: {
        Row: {
          audit_id: number
          cache_id: number | null
          created_at: string | null
          ip_address: unknown
          metadata: Json | null
          operation: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          audit_id?: number
          cache_id?: number | null
          created_at?: string | null
          ip_address?: unknown
          metadata?: Json | null
          operation: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          audit_id?: number
          cache_id?: number | null
          created_at?: string | null
          ip_address?: unknown
          metadata?: Json | null
          operation?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_cache_audit_log_cache_id_fkey"
            columns: ["cache_id"]
            isOneToOne: false
            referencedRelation: "ai_response_cache"
            referencedColumns: ["cache_id"]
          },
        ]
      }
      ai_response_cache: {
        Row: {
          access_count: number | null
          cache_id: number
          cache_key: string
          cost_usd: number | null
          created_at: string | null
          expires_at: string | null
          is_active: boolean | null
          last_accessed_at: string | null
          metadata: Json | null
          model_name: string
          model_version: string | null
          prompt: string
          prompt_hash: string
          response: Json
          tokens_used: number | null
        }
        Insert: {
          access_count?: number | null
          cache_id?: number
          cache_key: string
          cost_usd?: number | null
          created_at?: string | null
          expires_at?: string | null
          is_active?: boolean | null
          last_accessed_at?: string | null
          metadata?: Json | null
          model_name: string
          model_version?: string | null
          prompt: string
          prompt_hash: string
          response: Json
          tokens_used?: number | null
        }
        Update: {
          access_count?: number | null
          cache_id?: number
          cache_key?: string
          cost_usd?: number | null
          created_at?: string | null
          expires_at?: string | null
          is_active?: boolean | null
          last_accessed_at?: string | null
          metadata?: Json | null
          model_name?: string
          model_version?: string | null
          prompt?: string
          prompt_hash?: string
          response?: Json
          tokens_used?: number | null
        }
        Relationships: []
      }
      ambition_options: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          default_scope: string
          has_variable: boolean | null
          is_active: boolean | null
          is_system_default: boolean | null
          option_id: number
          option_text: string
          stage_number: number
          use_count: number | null
          variable_label: string | null
          variable_type: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          default_scope?: string
          has_variable?: boolean | null
          is_active?: boolean | null
          is_system_default?: boolean | null
          option_id?: number
          option_text: string
          stage_number: number
          use_count?: number | null
          variable_label?: string | null
          variable_type?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          default_scope?: string
          has_variable?: boolean | null
          is_active?: boolean | null
          is_system_default?: boolean | null
          option_id?: number
          option_text?: string
          stage_number?: number
          use_count?: number | null
          variable_label?: string | null
          variable_type?: string | null
        }
        Relationships: []
      }
      ambition_progress_events: {
        Row: {
          ambition_id: number
          attempt_id: number | null
          campaign_id: number
          created_at: string
          delta_numeric: number
          event_id: number
          metadata: Json | null
          outcome_id: number | null
          source: string
          worker_id: number
        }
        Insert: {
          ambition_id: number
          attempt_id?: number | null
          campaign_id: number
          created_at?: string
          delta_numeric?: number
          event_id?: number
          metadata?: Json | null
          outcome_id?: number | null
          source?: string
          worker_id: number
        }
        Update: {
          ambition_id?: number
          attempt_id?: number | null
          campaign_id?: number
          created_at?: string
          delta_numeric?: number
          event_id?: number
          metadata?: Json | null
          outcome_id?: number | null
          source?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ambition_progress_events_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_campaign_worker_call_status"
            referencedColumns: ["last_attempt_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "call_outcome_definitions"
            referencedColumns: ["outcome_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "call_outcome_summary"
            referencedColumns: ["outcome_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      an_tag_sync_log: {
        Row: {
          an_tag_id: string | null
          an_tag_name: string | null
          campaign_id: number
          sync_direction: string
          sync_id: number
          synced_at: string
          synced_by: string | null
          workers_affected: number
        }
        Insert: {
          an_tag_id?: string | null
          an_tag_name?: string | null
          campaign_id: number
          sync_direction: string
          sync_id?: number
          synced_at?: string
          synced_by?: string | null
          workers_affected?: number
        }
        Update: {
          an_tag_id?: string | null
          an_tag_name?: string | null
          campaign_id?: number
          sync_direction?: string
          sync_id?: number
          synced_at?: string
          synced_by?: string | null
          workers_affected?: number
        }
        Relationships: [
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "an_tag_sync_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      bargaining_decision_points: {
        Row: {
          campaign_id: number
          created_at: string
          created_by: string | null
          decision_id: number
          member_vote_outcome: string | null
          notes: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          scenario: string | null
          strength_assessment_id: number | null
          strength_outcome: string | null
          triggered_at: string
        }
        Insert: {
          campaign_id: number
          created_at?: string
          created_by?: string | null
          decision_id?: number
          member_vote_outcome?: string | null
          notes?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scenario?: string | null
          strength_assessment_id?: number | null
          strength_outcome?: string | null
          triggered_at?: string
        }
        Update: {
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          decision_id?: number
          member_vote_outcome?: string | null
          notes?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scenario?: string | null
          strength_assessment_id?: number | null
          strength_outcome?: string | null
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_decision_points_strength_assessment_id_fkey"
            columns: ["strength_assessment_id"]
            isOneToOne: false
            referencedRelation: "bargaining_strength_assessments"
            referencedColumns: ["assessment_id"]
          },
        ]
      }
      bargaining_gate_definitions: {
        Row: {
          campaign_id: number
          created_at: string
          enforcement_stage: number
          gate_criteria: Json
          gate_id: number
          gate_name: string
          gate_number: number
          gate_type: string
          is_active: boolean
        }
        Insert: {
          campaign_id: number
          created_at?: string
          enforcement_stage: number
          gate_criteria?: Json
          gate_id?: number
          gate_name: string
          gate_number: number
          gate_type?: string
          is_active?: boolean
        }
        Update: {
          campaign_id?: number
          created_at?: string
          enforcement_stage?: number
          gate_criteria?: Json
          gate_id?: number
          gate_name?: string
          gate_number?: number
          gate_type?: string
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      bargaining_strength_assessments: {
        Row: {
          assessed_at: string
          assessment_id: number
          campaign_id: number
          created_by: string | null
          eligible_count: number | null
          neutral_count: number | null
          notes: string | null
          opposed_count: number | null
          oppositional_count: number | null
          outcome: string | null
          percent_paid_membership: number | null
          percent_strike_ready: number | null
          readiness_criteria: Json | null
          supporter_count: number | null
          supportive_leader_count: number | null
          unassessed_count: number | null
        }
        Insert: {
          assessed_at?: string
          assessment_id?: number
          campaign_id: number
          created_by?: string | null
          eligible_count?: number | null
          neutral_count?: number | null
          notes?: string | null
          opposed_count?: number | null
          oppositional_count?: number | null
          outcome?: string | null
          percent_paid_membership?: number | null
          percent_strike_ready?: number | null
          readiness_criteria?: Json | null
          supporter_count?: number | null
          supportive_leader_count?: number | null
          unassessed_count?: number | null
        }
        Update: {
          assessed_at?: string
          assessment_id?: number
          campaign_id?: number
          created_by?: string | null
          eligible_count?: number | null
          neutral_count?: number | null
          notes?: string | null
          opposed_count?: number | null
          oppositional_count?: number | null
          outcome?: string | null
          percent_paid_membership?: number | null
          percent_strike_ready?: number | null
          readiness_criteria?: Json | null
          supporter_count?: number | null
          supportive_leader_count?: number | null
          unassessed_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "bargaining_strength_assessments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      call_attempt_assessment_ratings: {
        Row: {
          activity_id: number
          attempt_id: number
          created_at: string
          notes: string | null
          rating: number | null
        }
        Insert: {
          activity_id: number
          attempt_id: number
          created_at?: string
          notes?: string | null
          rating?: number | null
        }
        Update: {
          activity_id?: number
          attempt_id?: number
          created_at?: string
          notes?: string | null
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_attempt_assessment_ratings_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "call_attempt_assessment_ratings_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_assessment_ratings_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_assessment_ratings_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_campaign_worker_call_status"
            referencedColumns: ["last_attempt_id"]
          },
        ]
      }
      call_attempt_cta_ratings: {
        Row: {
          activity_id: number | null
          attempt_id: number
          binary_value: string | null
          created_at: string
          created_by: string | null
          cta_ambition_id: number
          cta_rating_id: number
          notes: string | null
          rating: number | null
          worker_id: number
        }
        Insert: {
          activity_id?: number | null
          attempt_id: number
          binary_value?: string | null
          created_at?: string
          created_by?: string | null
          cta_ambition_id: number
          cta_rating_id?: number
          notes?: string | null
          rating?: number | null
          worker_id: number
        }
        Update: {
          activity_id?: number | null
          attempt_id?: number
          binary_value?: string | null
          created_at?: string
          created_by?: string | null
          cta_ambition_id?: number
          cta_rating_id?: number
          notes?: string | null
          rating?: number | null
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_attempt_cta_ratings_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "call_attempt_cta_ratings_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_cta_ratings_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_cta_ratings_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_campaign_worker_call_status"
            referencedColumns: ["last_attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_cta_ratings_cta_ambition_id_fkey"
            columns: ["cta_ambition_id"]
            isOneToOne: false
            referencedRelation: "call_script_cta_ambitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_attempt_cta_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_attempt_cta_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_attempt_cta_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      call_attempt_objections: {
        Row: {
          attempt_id: number
          created_at: string
          custom_label: string | null
          id: number
          notes: string | null
          objection_id: number | null
          outcome: string
          worker_id: number
        }
        Insert: {
          attempt_id: number
          created_at?: string
          custom_label?: string | null
          id?: number
          notes?: string | null
          objection_id?: number | null
          outcome: string
          worker_id: number
        }
        Update: {
          attempt_id?: number
          created_at?: string
          custom_label?: string | null
          id?: number
          notes?: string | null
          objection_id?: number | null
          outcome?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_attempt_objections_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_objections_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_objections_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_campaign_worker_call_status"
            referencedColumns: ["last_attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_objections_objection_id_fkey"
            columns: ["objection_id"]
            isOneToOne: false
            referencedRelation: "call_objections"
            referencedColumns: ["objection_id"]
          },
          {
            foreignKeyName: "call_attempt_objections_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_attempt_objections_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_attempt_objections_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      call_attempt_outcomes: {
        Row: {
          attempt_id: number
          outcome_id: number
          response_value: string | null
        }
        Insert: {
          attempt_id: number
          outcome_id: number
          response_value?: string | null
        }
        Update: {
          attempt_id?: number
          outcome_id?: number
          response_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_attempt_outcomes_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_outcomes_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_outcomes_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_campaign_worker_call_status"
            referencedColumns: ["last_attempt_id"]
          },
          {
            foreignKeyName: "call_attempt_outcomes_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "call_outcome_definitions"
            referencedColumns: ["outcome_id"]
          },
          {
            foreignKeyName: "call_attempt_outcomes_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "call_outcome_summary"
            referencedColumns: ["outcome_id"]
          },
        ]
      }
      call_attempts: {
        Row: {
          attempt_id: number
          call_disposition: string | null
          callback_datetime: string | null
          caller_leader_worker_id: number | null
          caller_session_label: string | null
          caller_session_worker_id: number | null
          caller_user_id: string
          created_at: string
          cta_response: string | null
          dial_disposition: string
          duration_seconds: number | null
          ended_at: string | null
          follow_up_action: string | null
          list_item_id: number
          outcome_classification: string | null
          overall_notes: string | null
          script_id: number | null
          share_token_id: number | null
          started_at: string
          support_level_assessed: string | null
        }
        Insert: {
          attempt_id?: number
          call_disposition?: string | null
          callback_datetime?: string | null
          caller_leader_worker_id?: number | null
          caller_session_label?: string | null
          caller_session_worker_id?: number | null
          caller_user_id: string
          created_at?: string
          cta_response?: string | null
          dial_disposition: string
          duration_seconds?: number | null
          ended_at?: string | null
          follow_up_action?: string | null
          list_item_id: number
          outcome_classification?: string | null
          overall_notes?: string | null
          script_id?: number | null
          share_token_id?: number | null
          started_at?: string
          support_level_assessed?: string | null
        }
        Update: {
          attempt_id?: number
          call_disposition?: string | null
          callback_datetime?: string | null
          caller_leader_worker_id?: number | null
          caller_session_label?: string | null
          caller_session_worker_id?: number | null
          caller_user_id?: string
          created_at?: string
          cta_response?: string | null
          dial_disposition?: string
          duration_seconds?: number | null
          ended_at?: string | null
          follow_up_action?: string | null
          list_item_id?: number
          outcome_classification?: string | null
          overall_notes?: string | null
          script_id?: number | null
          share_token_id?: number | null
          started_at?: string
          support_level_assessed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_attempts_caller_leader_worker_id_fkey"
            columns: ["caller_leader_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_attempts_caller_leader_worker_id_fkey"
            columns: ["caller_leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_attempts_caller_leader_worker_id_fkey"
            columns: ["caller_leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_attempts_caller_session_worker_id_fkey"
            columns: ["caller_session_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_attempts_caller_session_worker_id_fkey"
            columns: ["caller_session_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_attempts_caller_session_worker_id_fkey"
            columns: ["caller_session_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_attempts_list_item_id_fkey"
            columns: ["list_item_id"]
            isOneToOne: false
            referencedRelation: "call_list_items"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "call_attempts_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_attempts_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_attempts_share_token_id_fkey"
            columns: ["share_token_id"]
            isOneToOne: false
            referencedRelation: "call_share_tokens"
            referencedColumns: ["token_id"]
          },
        ]
      }
      call_issue_observations: {
        Row: {
          attempt_id: number
          campaign_id: number
          created_at: string
          heat: number
          id: number
          issue_label: string
          notes: string | null
          source_top_issue_index: number | null
          worker_id: number
        }
        Insert: {
          attempt_id: number
          campaign_id: number
          created_at?: string
          heat: number
          id?: number
          issue_label: string
          notes?: string | null
          source_top_issue_index?: number | null
          worker_id: number
        }
        Update: {
          attempt_id?: number
          campaign_id?: number
          created_at?: string
          heat?: number
          id?: number
          issue_label?: string
          notes?: string | null
          source_top_issue_index?: number | null
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_issue_observations_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_issue_observations_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_issue_observations_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_campaign_worker_call_status"
            referencedColumns: ["last_attempt_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_issue_observations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_issue_observations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_issue_observations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      call_list_items: {
        Row: {
          assigned_to: string | null
          attempts_count: number
          best_disposition: string | null
          claimed_at: string | null
          claimed_by_session_label: string | null
          claimed_by_share_token_id: number | null
          claimed_by_worker_id: number | null
          created_at: string
          excluded_from_share: boolean
          item_id: number
          last_attempt_at: string | null
          list_id: number
          next_call_at: string | null
          notes: string | null
          priority_score: number | null
          skip_count: number
          sort_order: number
          status: string
          updated_at: string
          worker_id: number
        }
        Insert: {
          assigned_to?: string | null
          attempts_count?: number
          best_disposition?: string | null
          claimed_at?: string | null
          claimed_by_session_label?: string | null
          claimed_by_share_token_id?: number | null
          claimed_by_worker_id?: number | null
          created_at?: string
          excluded_from_share?: boolean
          item_id?: number
          last_attempt_at?: string | null
          list_id: number
          next_call_at?: string | null
          notes?: string | null
          priority_score?: number | null
          skip_count?: number
          sort_order?: number
          status?: string
          updated_at?: string
          worker_id: number
        }
        Update: {
          assigned_to?: string | null
          attempts_count?: number
          best_disposition?: string | null
          claimed_at?: string | null
          claimed_by_session_label?: string | null
          claimed_by_share_token_id?: number | null
          claimed_by_worker_id?: number | null
          created_at?: string
          excluded_from_share?: boolean
          item_id?: number
          last_attempt_at?: string | null
          list_id?: number
          next_call_at?: string | null
          notes?: string | null
          priority_score?: number | null
          skip_count?: number
          sort_order?: number
          status?: string
          updated_at?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_list_items_claimed_by_share_token_id_fkey"
            columns: ["claimed_by_share_token_id"]
            isOneToOne: false
            referencedRelation: "call_share_tokens"
            referencedColumns: ["token_id"]
          },
          {
            foreignKeyName: "call_list_items_claimed_by_worker_id_fkey"
            columns: ["claimed_by_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_list_items_claimed_by_worker_id_fkey"
            columns: ["claimed_by_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_list_items_claimed_by_worker_id_fkey"
            columns: ["claimed_by_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_section_funnel"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      call_list_scripts: {
        Row: {
          is_current: boolean
          linked_at: string
          linked_by: string | null
          list_id: number
          notes: string | null
          script_id: number
          wave_label: string | null
        }
        Insert: {
          is_current?: boolean
          linked_at?: string
          linked_by?: string | null
          list_id: number
          notes?: string | null
          script_id: number
          wave_label?: string | null
        }
        Update: {
          is_current?: boolean
          linked_at?: string
          linked_by?: string | null
          list_id?: number
          notes?: string | null
          script_id?: number
          wave_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_list_scripts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_scripts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_scripts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_section_funnel"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_scripts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_scripts_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_list_scripts_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["script_id"]
          },
        ]
      }
      call_lists: {
        Row: {
          campaign_id: number
          completed_items: number
          created_at: string
          created_by: string | null
          description: string | null
          list_id: number
          name: string
          priority_strategy: string
          script_id: number | null
          section_plan_id: number | null
          source_filters: Json | null
          status: string
          total_items: number
          updated_at: string
        }
        Insert: {
          campaign_id: number
          completed_items?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          list_id?: number
          name: string
          priority_strategy?: string
          script_id?: number | null
          section_plan_id?: number | null
          source_filters?: Json | null
          status?: string
          total_items?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: number
          completed_items?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          list_id?: number
          name?: string
          priority_strategy?: string
          script_id?: number | null
          section_plan_id?: number | null
          source_filters?: Json | null
          status?: string
          total_items?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_lists_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      call_objections: {
        Row: {
          campaign_id: number | null
          created_at: string
          created_by: string | null
          description: string | null
          is_default: boolean
          label: string
          objection_id: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          is_default?: boolean
          label: string
          objection_id?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          is_default?: boolean
          label?: string
          objection_id?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_objections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      call_outcome_definitions: {
        Row: {
          activity_id: number | null
          campaign_id: number | null
          created_at: string
          description: string | null
          is_positive: boolean
          maps_to_ambition_id: number | null
          maps_to_binary_value: string | null
          maps_to_rating_level: number | null
          name: string
          outcome_category: string
          outcome_id: number
          response_options: Json | null
          response_type: string
          script_id: number | null
          side_effect: string
          side_effect_payload: Json | null
          sort_order: number
        }
        Insert: {
          activity_id?: number | null
          campaign_id?: number | null
          created_at?: string
          description?: string | null
          is_positive?: boolean
          maps_to_ambition_id?: number | null
          maps_to_binary_value?: string | null
          maps_to_rating_level?: number | null
          name: string
          outcome_category: string
          outcome_id?: number
          response_options?: Json | null
          response_type?: string
          script_id?: number | null
          side_effect?: string
          side_effect_payload?: Json | null
          sort_order?: number
        }
        Update: {
          activity_id?: number | null
          campaign_id?: number | null
          created_at?: string
          description?: string | null
          is_positive?: boolean
          maps_to_ambition_id?: number | null
          maps_to_binary_value?: string | null
          maps_to_rating_level?: number | null
          name?: string
          outcome_category?: string
          outcome_id?: number
          response_options?: Json | null
          response_type?: string
          script_id?: number | null
          side_effect?: string
          side_effect_payload?: Json | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_outcome_definitions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_maps_to_ambition_id_fkey"
            columns: ["maps_to_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_maps_to_ambition_id_fkey"
            columns: ["maps_to_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_maps_to_ambition_id_fkey"
            columns: ["maps_to_ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_maps_to_ambition_id_fkey"
            columns: ["maps_to_ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["script_id"]
          },
        ]
      }
      call_script_cta_ambitions: {
        Row: {
          activity_id: number | null
          created_at: string
          cta_label: string
          id: number
          is_join_cta: boolean
          min_call_threshold_pct: number | null
          notes: string | null
          outcome_definition_id: number | null
          script_id: number
          target_binary: boolean | null
          target_min_rating: number | null
          target_response: string | null
          target_support_level: string | null
          updated_at: string
        }
        Insert: {
          activity_id?: number | null
          created_at?: string
          cta_label: string
          id?: number
          is_join_cta?: boolean
          min_call_threshold_pct?: number | null
          notes?: string | null
          outcome_definition_id?: number | null
          script_id: number
          target_binary?: boolean | null
          target_min_rating?: number | null
          target_response?: string | null
          target_support_level?: string | null
          updated_at?: string
        }
        Update: {
          activity_id?: number | null
          created_at?: string
          cta_label?: string
          id?: number
          is_join_cta?: boolean
          min_call_threshold_pct?: number | null
          notes?: string | null
          outcome_definition_id?: number | null
          script_id?: number
          target_binary?: boolean | null
          target_min_rating?: number | null
          target_response?: string | null
          target_support_level?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_script_cta_ambitions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "call_script_cta_ambitions_outcome_definition_id_fkey"
            columns: ["outcome_definition_id"]
            isOneToOne: false
            referencedRelation: "call_outcome_definitions"
            referencedColumns: ["outcome_id"]
          },
          {
            foreignKeyName: "call_script_cta_ambitions_outcome_definition_id_fkey"
            columns: ["outcome_definition_id"]
            isOneToOne: false
            referencedRelation: "call_outcome_summary"
            referencedColumns: ["outcome_id"]
          },
          {
            foreignKeyName: "call_script_cta_ambitions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_script_cta_ambitions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["script_id"]
          },
        ]
      }
      call_script_sections: {
        Row: {
          body_text: string
          created_at: string
          expected_outcomes: Json | null
          is_optional: boolean
          prompt_text: string | null
          script_id: number
          section_id: number
          section_type: string
          sort_order: number
          talking_points: Json | null
          title: string
          updated_at: string
        }
        Insert: {
          body_text?: string
          created_at?: string
          expected_outcomes?: Json | null
          is_optional?: boolean
          prompt_text?: string | null
          script_id: number
          section_id?: number
          section_type?: string
          sort_order?: number
          talking_points?: Json | null
          title: string
          updated_at?: string
        }
        Update: {
          body_text?: string
          created_at?: string
          expected_outcomes?: Json | null
          is_optional?: boolean
          prompt_text?: string | null
          script_id?: number
          section_id?: number
          section_type?: string
          sort_order?: number
          talking_points?: Json | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_script_sections_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_script_sections_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["script_id"]
          },
        ]
      }
      call_scripts: {
        Row: {
          audience_descriptor: Json | null
          base_script_id: number | null
          call_objective: string | null
          campaign_id: number
          created_at: string
          created_by: string | null
          draft_id: number | null
          estimated_duration_minutes: number | null
          script_id: number
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          audience_descriptor?: Json | null
          base_script_id?: number | null
          call_objective?: string | null
          campaign_id: number
          created_at?: string
          created_by?: string | null
          draft_id?: number | null
          estimated_duration_minutes?: number | null
          script_id?: number
          status?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          audience_descriptor?: Json | null
          base_script_id?: number | null
          call_objective?: string | null
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          draft_id?: number | null
          estimated_duration_minutes?: number | null
          script_id?: number
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_scripts_base_script_id_fkey"
            columns: ["base_script_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_scripts_base_script_id_fkey"
            columns: ["base_script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_scripts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "campaign_comms_drafts"
            referencedColumns: ["draft_id"]
          },
        ]
      }
      call_share_form_events: {
        Row: {
          created_at: string
          event_id: number
          event_type: string
          ip_hash: string | null
          payload: Json | null
          token_id: number
          worker_id: number | null
        }
        Insert: {
          created_at?: string
          event_id?: number
          event_type: string
          ip_hash?: string | null
          payload?: Json | null
          token_id: number
          worker_id?: number | null
        }
        Update: {
          created_at?: string
          event_id?: number
          event_type?: string
          ip_hash?: string | null
          payload?: Json | null
          token_id?: number
          worker_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_share_form_events_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "call_share_tokens"
            referencedColumns: ["token_id"]
          },
          {
            foreignKeyName: "call_share_form_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_share_form_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_share_form_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      call_share_tokens: {
        Row: {
          created_at: string
          designated_worker_id: number | null
          expires_at: string
          failed_attempts: number
          issued_by: string
          last_used_at: string | null
          leader_worker_id: number | null
          list_id: number
          locked_until: string | null
          password_algo: string
          password_hash: string
          revoked_at: string | null
          token_hash: string
          token_id: number
        }
        Insert: {
          created_at?: string
          designated_worker_id?: number | null
          expires_at: string
          failed_attempts?: number
          issued_by: string
          last_used_at?: string | null
          leader_worker_id?: number | null
          list_id: number
          locked_until?: string | null
          password_algo: string
          password_hash: string
          revoked_at?: string | null
          token_hash: string
          token_id?: number
        }
        Update: {
          created_at?: string
          designated_worker_id?: number | null
          expires_at?: string
          failed_attempts?: number
          issued_by?: string
          last_used_at?: string | null
          leader_worker_id?: number | null
          list_id?: number
          locked_until?: string | null
          password_algo?: string
          password_hash?: string
          revoked_at?: string | null
          token_hash?: string
          token_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_share_tokens_designated_worker_id_fkey"
            columns: ["designated_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_share_tokens_designated_worker_id_fkey"
            columns: ["designated_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_share_tokens_designated_worker_id_fkey"
            columns: ["designated_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_share_tokens_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_share_tokens_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_share_tokens_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_share_tokens_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_share_tokens_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_share_tokens_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_section_funnel"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_share_tokens_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["list_id"]
          },
        ]
      }
      call_step_outcomes: {
        Row: {
          attempt_id: number
          created_at: string
          duration_seconds: number | null
          notes: string | null
          outcome_value: string | null
          reached: boolean
          section_id: number
          sort_order: number
          step_outcome_id: number
        }
        Insert: {
          attempt_id: number
          created_at?: string
          duration_seconds?: number | null
          notes?: string | null
          outcome_value?: string | null
          reached?: boolean
          section_id: number
          sort_order?: number
          step_outcome_id?: number
        }
        Update: {
          attempt_id?: number
          created_at?: string
          duration_seconds?: number | null
          notes?: string | null
          outcome_value?: string | null
          reached?: boolean
          section_id?: number
          sort_order?: number
          step_outcome_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_step_outcomes_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "call_attempts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_step_outcomes_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "call_step_outcomes_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "vw_campaign_worker_call_status"
            referencedColumns: ["last_attempt_id"]
          },
          {
            foreignKeyName: "call_step_outcomes_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "call_script_sections"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "call_step_outcomes_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "call_section_funnel"
            referencedColumns: ["section_id"]
          },
        ]
      }
      campaign_action_results: {
        Row: {
          action_date: string
          action_id: number
          notes: string | null
          organiser_id: number | null
          result_id: number
          result_type: string
          worker_id: number
        }
        Insert: {
          action_date?: string
          action_id: number
          notes?: string | null
          organiser_id?: number | null
          result_id?: number
          result_type: string
          worker_id: number
        }
        Update: {
          action_date?: string
          action_id?: number
          notes?: string | null
          organiser_id?: number | null
          result_id?: number
          result_type?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_action_results_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "campaign_actions"
            referencedColumns: ["action_id"]
          },
          {
            foreignKeyName: "campaign_action_results_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "campaign_action_results_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_action_results_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_action_results_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_actions: {
        Row: {
          action_id: number
          action_type: string
          assigned_organiser_id: number | null
          campaign_id: number
          created_at: string
          description: string | null
          due_date: string | null
          status: string
          title: string
          universe_id: number | null
        }
        Insert: {
          action_id?: number
          action_type: string
          assigned_organiser_id?: number | null
          campaign_id: number
          created_at?: string
          description?: string | null
          due_date?: string | null
          status?: string
          title: string
          universe_id?: number | null
        }
        Update: {
          action_id?: number
          action_type?: string
          assigned_organiser_id?: number | null
          campaign_id?: number
          created_at?: string
          description?: string | null
          due_date?: string | null
          status?: string
          title?: string
          universe_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_actions_assigned_organiser_id_fkey"
            columns: ["assigned_organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_actions_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "campaign_universes"
            referencedColumns: ["universe_id"]
          },
        ]
      }
      campaign_activist_profiles: {
        Row: {
          campaign_id: number
          created_at: string
          created_by: string | null
          current_rung: number | null
          domain: string | null
          followers_evidence: string | null
          four_a_stage: string
          identified_via: string | null
          is_archived: boolean
          last_contact_date: string | null
          next_contact_date: string | null
          notes: string | null
          profile_id: number
          recruited_at: string | null
          recruited_by: string | null
          recruited_by_text: string | null
          skab_notes: string | null
          source: string
          updated_at: string
          worker_id: number
        }
        Insert: {
          campaign_id: number
          created_at?: string
          created_by?: string | null
          current_rung?: number | null
          domain?: string | null
          followers_evidence?: string | null
          four_a_stage?: string
          identified_via?: string | null
          is_archived?: boolean
          last_contact_date?: string | null
          next_contact_date?: string | null
          notes?: string | null
          profile_id?: number
          recruited_at?: string | null
          recruited_by?: string | null
          recruited_by_text?: string | null
          skab_notes?: string | null
          source?: string
          updated_at?: string
          worker_id: number
        }
        Update: {
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          current_rung?: number | null
          domain?: string | null
          followers_evidence?: string | null
          four_a_stage?: string
          identified_via?: string | null
          is_archived?: boolean
          last_contact_date?: string | null
          next_contact_date?: string | null
          notes?: string | null
          profile_id?: number
          recruited_at?: string | null
          recruited_by?: string | null
          recruited_by_text?: string | null
          skab_notes?: string | null
          source?: string
          updated_at?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_activities: {
        Row: {
          activity_id: number
          activity_kind: string
          an_browser_url: string | null
          an_last_synced_at: string | null
          an_resource_id: string | null
          an_resource_type: string | null
          assessment_type: string
          campaign_id: number
          created_at: string
          description: string | null
          is_binary: boolean
          is_custom: boolean
          is_perception: boolean
          rating_labels: Json | null
          section_plan_id: number | null
          supporter_outcome_value: string | null
          template_key: string | null
          title: string
        }
        Insert: {
          activity_id?: number
          activity_kind?: string
          an_browser_url?: string | null
          an_last_synced_at?: string | null
          an_resource_id?: string | null
          an_resource_type?: string | null
          assessment_type?: string
          campaign_id: number
          created_at?: string
          description?: string | null
          is_binary?: boolean
          is_custom?: boolean
          is_perception?: boolean
          rating_labels?: Json | null
          section_plan_id?: number | null
          supporter_outcome_value?: string | null
          template_key?: string | null
          title: string
        }
        Update: {
          activity_id?: number
          activity_kind?: string
          an_browser_url?: string | null
          an_last_synced_at?: string | null
          an_resource_id?: string | null
          an_resource_type?: string | null
          assessment_type?: string
          campaign_id?: number
          created_at?: string
          description?: string | null
          is_binary?: boolean
          is_custom?: boolean
          is_perception?: boolean
          rating_labels?: Json | null
          section_plan_id?: number | null
          supporter_outcome_value?: string | null
          template_key?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "campaign_activities_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "campaign_activities_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "campaign_activities_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      campaign_activity_ratings: {
        Row: {
          activity_id: number
          assessment_type_override: string | null
          binary_value: string | null
          event_id: number | null
          import_batch_id: number | null
          notes: string | null
          rated_at: string
          rated_by_user_id: string | null
          rating: number | null
          rating_id: number
          rating_phase: string
          source: string
          worker_id: number
        }
        Insert: {
          activity_id: number
          assessment_type_override?: string | null
          binary_value?: string | null
          event_id?: number | null
          import_batch_id?: number | null
          notes?: string | null
          rated_at?: string
          rated_by_user_id?: string | null
          rating?: number | null
          rating_id?: number
          rating_phase?: string
          source?: string
          worker_id: number
        }
        Update: {
          activity_id?: number
          assessment_type_override?: string | null
          binary_value?: string | null
          event_id?: number | null
          import_batch_id?: number | null
          notes?: string | null
          rated_at?: string
          rated_by_user_id?: string | null
          rating?: number | null
          rating_id?: number
          rating_phase?: string
          source?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activity_ratings_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "campaign_activity_ratings_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "participation_import_batches"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "campaign_activity_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_activity_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_activity_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "car_event_id_fk"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["event_id"]
          },
        ]
      }
      campaign_agreements: {
        Row: {
          agreement_id: number
          campaign_id: number
          created_at: string
          id: number
          is_primary: boolean
          relationship_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          agreement_id: number
          campaign_id: number
          created_at?: string
          id?: number
          is_primary?: boolean
          relationship_type?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          agreement_id?: number
          campaign_id?: number
          created_at?: string
          id?: number
          is_primary?: boolean
          relationship_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_agreements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "campaign_agreements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "campaign_agreements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_agreements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_ambition_revisions: {
        Row: {
          ambition_id: number
          created_at: string
          id: number
          new_value: Json | null
          previous_value: Json | null
          reason: string | null
          reviewed_without_change: boolean
          triggered_by_event_id: number | null
          triggered_by_event_type: string | null
          triggered_by_vote_id: number | null
        }
        Insert: {
          ambition_id: number
          created_at?: string
          id?: never
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          reviewed_without_change?: boolean
          triggered_by_event_id?: number | null
          triggered_by_event_type?: string | null
          triggered_by_vote_id?: number | null
        }
        Update: {
          ambition_id?: number
          created_at?: string
          id?: never
          new_value?: Json | null
          previous_value?: Json | null
          reason?: string | null
          reviewed_without_change?: boolean
          triggered_by_event_id?: number | null
          triggered_by_event_type?: string | null
          triggered_by_vote_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_ambition_revisions_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "campaign_ambition_progress"
            referencedColumns: ["campaign_ambition_id"]
          },
          {
            foreignKeyName: "campaign_ambition_revisions_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "campaign_ambitions"
            referencedColumns: ["campaign_ambition_id"]
          },
          {
            foreignKeyName: "campaign_ambition_revisions_triggered_by_event_id_fkey"
            columns: ["triggered_by_event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "campaign_ambition_revisions_triggered_by_vote_id_fkey"
            columns: ["triggered_by_vote_id"]
            isOneToOne: false
            referencedRelation: "member_endorsement_votes"
            referencedColumns: ["vote_id"]
          },
        ]
      }
      campaign_ambitions: {
        Row: {
          campaign_ambition_id: number
          campaign_id: number
          category: string
          created_at: string
          current_value: string | null
          current_value_overridden: boolean
          current_value_override_reason: string | null
          label: string
          notes: string | null
          review_due_since: string | null
          sort_order: number
          subcategory: string | null
          target_date: string | null
          target_unit: string | null
          target_value: string | null
          target_value_max: string | null
          updated_at: string
        }
        Insert: {
          campaign_ambition_id?: number
          campaign_id: number
          category: string
          created_at?: string
          current_value?: string | null
          current_value_overridden?: boolean
          current_value_override_reason?: string | null
          label: string
          notes?: string | null
          review_due_since?: string | null
          sort_order?: number
          subcategory?: string | null
          target_date?: string | null
          target_unit?: string | null
          target_value?: string | null
          target_value_max?: string | null
          updated_at?: string
        }
        Update: {
          campaign_ambition_id?: number
          campaign_id?: number
          category?: string
          created_at?: string
          current_value?: string | null
          current_value_overridden?: boolean
          current_value_override_reason?: string | null
          label?: string
          notes?: string | null
          review_due_since?: string | null
          sort_order?: number
          subcategory?: string | null
          target_date?: string | null
          target_unit?: string | null
          target_value?: string | null
          target_value_max?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_comms_drafts: {
        Row: {
          ai_model_used: string | null
          ai_prompt_hash: string | null
          approved_at: string | null
          approved_by: string | null
          audience_segment: string | null
          body: string
          body_html: string | null
          body_json: Json | null
          campaign_id: number
          created_at: string
          created_by: string | null
          custom_instructions: string | null
          draft_id: number
          email_list_id: number | null
          entry_branch: string | null
          external_message_id: string | null
          plan_id: number | null
          platform: string
          preheader: string | null
          send_stats: Json | null
          sent_via: string | null
          sms_list_id: number | null
          source_template_ids: number[] | null
          stage_number: number
          status: string
          structured_script_id: number | null
          subject: string | null
          title: string | null
          tone: string | null
          updated_at: string
          variables_used: string[] | null
          wrapper_id: number | null
          wtp_context_snapshot: Json | null
        }
        Insert: {
          ai_model_used?: string | null
          ai_prompt_hash?: string | null
          approved_at?: string | null
          approved_by?: string | null
          audience_segment?: string | null
          body: string
          body_html?: string | null
          body_json?: Json | null
          campaign_id: number
          created_at?: string
          created_by?: string | null
          custom_instructions?: string | null
          draft_id?: number
          email_list_id?: number | null
          entry_branch?: string | null
          external_message_id?: string | null
          plan_id?: number | null
          platform: string
          preheader?: string | null
          send_stats?: Json | null
          sent_via?: string | null
          sms_list_id?: number | null
          source_template_ids?: number[] | null
          stage_number: number
          status?: string
          structured_script_id?: number | null
          subject?: string | null
          title?: string | null
          tone?: string | null
          updated_at?: string
          variables_used?: string[] | null
          wrapper_id?: number | null
          wtp_context_snapshot?: Json | null
        }
        Update: {
          ai_model_used?: string | null
          ai_prompt_hash?: string | null
          approved_at?: string | null
          approved_by?: string | null
          audience_segment?: string | null
          body?: string
          body_html?: string | null
          body_json?: Json | null
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          custom_instructions?: string | null
          draft_id?: number
          email_list_id?: number | null
          entry_branch?: string | null
          external_message_id?: string | null
          plan_id?: number | null
          platform?: string
          preheader?: string | null
          send_stats?: Json | null
          sent_via?: string | null
          sms_list_id?: number | null
          source_template_ids?: number[] | null
          stage_number?: number
          status?: string
          structured_script_id?: number | null
          subject?: string | null
          title?: string | null
          tone?: string | null
          updated_at?: string
          variables_used?: string[] | null
          wrapper_id?: number | null
          wtp_context_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_email_list_id_fkey"
            columns: ["email_list_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_email_list_id_fkey"
            columns: ["email_list_id"]
            isOneToOne: false
            referencedRelation: "vw_email_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_stage_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_sms_list_id_fkey"
            columns: ["sms_list_id"]
            isOneToOne: false
            referencedRelation: "sms_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_sms_list_id_fkey"
            columns: ["sms_list_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_sms_list_id_fkey"
            columns: ["sms_list_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_chat_session_report"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_structured_script_id_fkey"
            columns: ["structured_script_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_structured_script_id_fkey"
            columns: ["structured_script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "campaign_comms_drafts_wrapper_id_fkey"
            columns: ["wrapper_id"]
            isOneToOne: false
            referencedRelation: "email_wrappers"
            referencedColumns: ["wrapper_id"]
          },
        ]
      }
      campaign_data_fields: {
        Row: {
          campaign_id: number
          category: string
          created_at: string
          created_by: string | null
          enum_options: Json | null
          field_id: number
          fieldset_id: number | null
          filterable: boolean
          key: string
          label: string
          scale_max: number | null
          scale_min: number | null
          sort_order: number
          sortable: boolean
          updated_at: string
          value_type: string
        }
        Insert: {
          campaign_id: number
          category?: string
          created_at?: string
          created_by?: string | null
          enum_options?: Json | null
          field_id?: number
          fieldset_id?: number | null
          filterable?: boolean
          key: string
          label: string
          scale_max?: number | null
          scale_min?: number | null
          sort_order?: number
          sortable?: boolean
          updated_at?: string
          value_type: string
        }
        Update: {
          campaign_id?: number
          category?: string
          created_at?: string
          created_by?: string | null
          enum_options?: Json | null
          field_id?: number
          fieldset_id?: number | null
          filterable?: boolean
          key?: string
          label?: string
          scale_max?: number | null
          scale_min?: number | null
          sort_order?: number
          sortable?: boolean
          updated_at?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fields_fieldset_id_fkey"
            columns: ["fieldset_id"]
            isOneToOne: false
            referencedRelation: "campaign_data_fieldsets"
            referencedColumns: ["fieldset_id"]
          },
        ]
      }
      campaign_data_fieldsets: {
        Row: {
          campaign_id: number
          category: string
          created_at: string
          created_by: string | null
          fieldset_id: number
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          campaign_id: number
          category?: string
          created_at?: string
          created_by?: string | null
          fieldset_id?: number
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          campaign_id?: number
          category?: string
          created_at?: string
          created_by?: string | null
          fieldset_id?: number
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_data_fieldsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_edit_permissions: {
        Row: {
          campaign_id: number
          granted_at: string | null
          granted_by: string
          granted_to: string
          is_persistent: boolean | null
          permission_id: number
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string | null
        }
        Insert: {
          campaign_id: number
          granted_at?: string | null
          granted_by: string
          granted_to: string
          is_persistent?: boolean | null
          permission_id?: number
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: number
          granted_at?: string | null
          granted_by?: string
          granted_to?: string
          is_persistent?: boolean | null
          permission_id?: number
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_employers: {
        Row: {
          campaign_id: number
          created_at: string
          employer_id: number
          id: number
        }
        Insert: {
          campaign_id: number
          created_at?: string
          employer_id: number
          id?: number
        }
        Update: {
          campaign_id?: number
          created_at?: string
          employer_id?: number
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "campaign_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "campaign_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      campaign_leader_form_events: {
        Row: {
          created_at: string
          event_id: number
          event_type: string
          ip_hash: string | null
          payload: Json | null
          token_id: number
          worker_id: number | null
        }
        Insert: {
          created_at?: string
          event_id?: number
          event_type: string
          ip_hash?: string | null
          payload?: Json | null
          token_id: number
          worker_id?: number | null
        }
        Update: {
          created_at?: string
          event_id?: number
          event_type?: string
          ip_hash?: string | null
          payload?: Json | null
          token_id?: number
          worker_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leader_form_events_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "campaign_leader_tokens"
            referencedColumns: ["token_id"]
          },
          {
            foreignKeyName: "campaign_leader_form_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_leader_form_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_leader_form_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_leader_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          failed_attempts: number
          issued_by: string | null
          last_used_at: string | null
          locked_until: string | null
          password_algo: string
          password_hash: string
          revoked_at: string | null
          task_list_id: number
          token_hash: string
          token_id: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          failed_attempts?: number
          issued_by?: string | null
          last_used_at?: string | null
          locked_until?: string | null
          password_algo?: string
          password_hash: string
          revoked_at?: string | null
          task_list_id: number
          token_hash: string
          token_id?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          failed_attempts?: number
          issued_by?: string | null
          last_used_at?: string | null
          locked_until?: string | null
          password_algo?: string
          password_hash?: string
          revoked_at?: string | null
          task_list_id?: number
          token_hash?: string
          token_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leader_tokens_task_list_id_fkey"
            columns: ["task_list_id"]
            isOneToOne: false
            referencedRelation: "campaign_task_lists"
            referencedColumns: ["task_list_id"]
          },
        ]
      }
      campaign_leader_worker_links: {
        Row: {
          campaign_id: number
          created_at: string
          created_by: string | null
          follower_worker_id: number
          leader_worker_id: number
          link_id: number
          notes: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: number
          created_at?: string
          created_by?: string | null
          follower_worker_id: number
          leader_worker_id: number
          link_id?: number
          notes?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          follower_worker_id?: number
          leader_worker_id?: number
          link_id?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_follower_worker_id_fkey"
            columns: ["follower_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_follower_worker_id_fkey"
            columns: ["follower_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_follower_worker_id_fkey"
            columns: ["follower_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_leader_worker_links_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_organisers: {
        Row: {
          added_at: string | null
          campaign_id: number
          campaign_role: string
          id: number
          organiser_id: number
          reports_to_organiser_id: number | null
        }
        Insert: {
          added_at?: string | null
          campaign_id: number
          campaign_role?: string
          id?: number
          organiser_id: number
          reports_to_organiser_id?: number | null
        }
        Update: {
          added_at?: string | null
          campaign_id?: number
          campaign_role?: string
          id?: number
          organiser_id?: number
          reports_to_organiser_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organisers_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "campaign_organisers_reports_to_organiser_id_fkey"
            columns: ["reports_to_organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
        ]
      }
      campaign_organising_units: {
        Row: {
          anchor_worker_id: number | null
          campaign_id: number
          commonality_logic: string | null
          created_at: string
          display_order: number
          is_group_container: boolean
          name: string
          ou_group_id: number | null
          ou_id: number
          ou_type: string
          parent_ou_id: number | null
          source: string | null
          source_metadata: Json | null
          target_size: number | null
          total_workers_estimated: number | null
          unit_basis: Json | null
          updated_at: string
          user_rating: number | null
        }
        Insert: {
          anchor_worker_id?: number | null
          campaign_id: number
          commonality_logic?: string | null
          created_at?: string
          display_order?: number
          is_group_container?: boolean
          name: string
          ou_group_id?: number | null
          ou_id?: number
          ou_type: string
          parent_ou_id?: number | null
          source?: string | null
          source_metadata?: Json | null
          target_size?: number | null
          total_workers_estimated?: number | null
          unit_basis?: Json | null
          updated_at?: string
          user_rating?: number | null
        }
        Update: {
          anchor_worker_id?: number | null
          campaign_id?: number
          commonality_logic?: string | null
          created_at?: string
          display_order?: number
          is_group_container?: boolean
          name?: string
          ou_group_id?: number | null
          ou_id?: number
          ou_type?: string
          parent_ou_id?: number | null
          source?: string | null
          source_metadata?: Json | null
          target_size?: number | null
          total_workers_estimated?: number | null
          unit_basis?: Json | null
          updated_at?: string
          user_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_organising_units_anchor_worker_id_fkey"
            columns: ["anchor_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_anchor_worker_id_fkey"
            columns: ["anchor_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_anchor_worker_id_fkey"
            columns: ["anchor_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_ou_group_id_fkey"
            columns: ["ou_group_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_ou_group_id_fkey"
            columns: ["ou_group_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_ou_group_id_fkey"
            columns: ["ou_group_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_ou_group_id_fkey"
            columns: ["ou_group_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_ou_group_id_fkey"
            columns: ["ou_group_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
        ]
      }
      campaign_ou_candidates: {
        Row: {
          accepted_ou_id: number | null
          campaign_id: number
          candidate_id: number
          commonality_logic: string | null
          created_at: string
          estimated_workers: number | null
          source: string
          source_wtp_id: number | null
          status: string
          suggested_name: string
          suggested_ou_type: string
          updated_at: string
        }
        Insert: {
          accepted_ou_id?: number | null
          campaign_id: number
          candidate_id?: number
          commonality_logic?: string | null
          created_at?: string
          estimated_workers?: number | null
          source: string
          source_wtp_id?: number | null
          status?: string
          suggested_name: string
          suggested_ou_type: string
          updated_at?: string
        }
        Update: {
          accepted_ou_id?: number | null
          campaign_id?: number
          candidate_id?: number
          commonality_logic?: string | null
          created_at?: string
          estimated_workers?: number | null
          source?: string
          source_wtp_id?: number | null
          status?: string
          suggested_name?: string
          suggested_ou_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_ou_candidates_accepted_ou_id_fkey"
            columns: ["accepted_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_accepted_ou_id_fkey"
            columns: ["accepted_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_accepted_ou_id_fkey"
            columns: ["accepted_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_accepted_ou_id_fkey"
            columns: ["accepted_ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_accepted_ou_id_fkey"
            columns: ["accepted_ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ou_candidates_source_wtp_id_fkey"
            columns: ["source_wtp_id"]
            isOneToOne: false
            referencedRelation: "plan_where_to_play"
            referencedColumns: ["wtp_id"]
          },
        ]
      }
      campaign_ou_coverage: {
        Row: {
          coverage_id: number
          created_at: string
          leader_worker_id: number | null
          ou_id: number
          priority_action: string | null
          reachable_48h: boolean | null
          second_worker_id: number | null
          updated_at: string
        }
        Insert: {
          coverage_id?: number
          created_at?: string
          leader_worker_id?: number | null
          ou_id: number
          priority_action?: string | null
          reachable_48h?: boolean | null
          second_worker_id?: number | null
          updated_at?: string
        }
        Update: {
          coverage_id?: number
          created_at?: string
          leader_worker_id?: number | null
          ou_id?: number
          priority_action?: string | null
          reachable_48h?: boolean | null
          second_worker_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_ou_coverage_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: true
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: true
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: true
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: true
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: true
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_second_worker_id_fkey"
            columns: ["second_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_second_worker_id_fkey"
            columns: ["second_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_second_worker_id_fkey"
            columns: ["second_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_permission_requests: {
        Row: {
          approved_permission_id: number | null
          campaign_id: number
          reason: string | null
          request_id: number
          requested_at: string | null
          requested_by: string
          response_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          approved_permission_id?: number | null
          campaign_id: number
          reason?: string | null
          request_id?: number
          requested_at?: string | null
          requested_by: string
          response_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          approved_permission_id?: number | null
          campaign_id?: number
          reason?: string | null
          request_id?: number
          requested_at?: string | null
          requested_by?: string
          response_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_permission_requests_approved_permission_id_fkey"
            columns: ["approved_permission_id"]
            isOneToOne: false
            referencedRelation: "campaign_edit_permissions"
            referencedColumns: ["permission_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_approved_permission_id_fkey"
            columns: ["approved_permission_id"]
            isOneToOne: false
            referencedRelation: "campaign_permissions_detail"
            referencedColumns: ["permission_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_prospective_workers: {
        Row: {
          campaign_id: number
          created_at: string
          email: string | null
          first_name: string
          last_name: string
          merged_worker_id: number | null
          notes: string | null
          phone: string | null
          prospective_id: number
          rating: number | null
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_leader_worker_id: number | null
          source_token_id: number | null
          task_list_id: number | null
        }
        Insert: {
          campaign_id: number
          created_at?: string
          email?: string | null
          first_name: string
          last_name: string
          merged_worker_id?: number | null
          notes?: string | null
          phone?: string | null
          prospective_id?: number
          rating?: number | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_leader_worker_id?: number | null
          source_token_id?: number | null
          task_list_id?: number | null
        }
        Update: {
          campaign_id?: number
          created_at?: string
          email?: string | null
          first_name?: string
          last_name?: string
          merged_worker_id?: number | null
          notes?: string | null
          phone?: string | null
          prospective_id?: number
          rating?: number | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_leader_worker_id?: number | null
          source_token_id?: number | null
          task_list_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_merged_worker_id_fkey"
            columns: ["merged_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_merged_worker_id_fkey"
            columns: ["merged_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_merged_worker_id_fkey"
            columns: ["merged_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_source_leader_worker_id_fkey"
            columns: ["source_leader_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_source_leader_worker_id_fkey"
            columns: ["source_leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_source_leader_worker_id_fkey"
            columns: ["source_leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_source_token_id_fkey"
            columns: ["source_token_id"]
            isOneToOne: false
            referencedRelation: "campaign_leader_tokens"
            referencedColumns: ["token_id"]
          },
          {
            foreignKeyName: "campaign_prospective_workers_task_list_id_fkey"
            columns: ["task_list_id"]
            isOneToOne: false
            referencedRelation: "campaign_task_lists"
            referencedColumns: ["task_list_id"]
          },
        ]
      }
      campaign_situation_analyses: {
        Row: {
          ai_generated: boolean
          ai_model: string | null
          ai_prompt_snapshot: Json | null
          balloted_count: number | null
          bargaining_phase_state: string | null
          campaign_id: number
          company_playbook: Json
          created_at: string
          created_by: string | null
          employer_ballot_intent: string | null
          employer_interaction_state: string | null
          employer_relationships: Json
          employer_state_notes: string | null
          hr_posture: Json
          information_gaps: Json
          is_current: boolean
          key_disputes: Json
          leverage_and_maths: Json
          nerr_issued_at: string | null
          nerr_status: string | null
          prior_employer_ballots: Json
          situation_id: number
          strategic_context_summary: string | null
          top_issues: Json
          union_history: Json
          upcoming_workforce_changes: Json
          updated_at: string
          version: number
          worker_support_estimate: Json
          workforce_populations: Json
        }
        Insert: {
          ai_generated?: boolean
          ai_model?: string | null
          ai_prompt_snapshot?: Json | null
          balloted_count?: number | null
          bargaining_phase_state?: string | null
          campaign_id: number
          company_playbook?: Json
          created_at?: string
          created_by?: string | null
          employer_ballot_intent?: string | null
          employer_interaction_state?: string | null
          employer_relationships?: Json
          employer_state_notes?: string | null
          hr_posture?: Json
          information_gaps?: Json
          is_current?: boolean
          key_disputes?: Json
          leverage_and_maths?: Json
          nerr_issued_at?: string | null
          nerr_status?: string | null
          prior_employer_ballots?: Json
          situation_id?: number
          strategic_context_summary?: string | null
          top_issues?: Json
          union_history?: Json
          upcoming_workforce_changes?: Json
          updated_at?: string
          version?: number
          worker_support_estimate?: Json
          workforce_populations?: Json
        }
        Update: {
          ai_generated?: boolean
          ai_model?: string | null
          ai_prompt_snapshot?: Json | null
          balloted_count?: number | null
          bargaining_phase_state?: string | null
          campaign_id?: number
          company_playbook?: Json
          created_at?: string
          created_by?: string | null
          employer_ballot_intent?: string | null
          employer_interaction_state?: string | null
          employer_relationships?: Json
          employer_state_notes?: string | null
          hr_posture?: Json
          information_gaps?: Json
          is_current?: boolean
          key_disputes?: Json
          leverage_and_maths?: Json
          nerr_issued_at?: string | null
          nerr_status?: string | null
          prior_employer_ballots?: Json
          situation_id?: number
          strategic_context_summary?: string | null
          top_issues?: Json
          union_history?: Json
          upcoming_workforce_changes?: Json
          updated_at?: string
          version?: number
          worker_support_estimate?: Json
          workforce_populations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_analyses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_situation_revisions: {
        Row: {
          campaign_id: number
          changed_at: string
          changed_by: string | null
          diff: Json | null
          notes: string | null
          revision_id: number
          revision_type: string
          situation_id: number
        }
        Insert: {
          campaign_id: number
          changed_at?: string
          changed_by?: string | null
          diff?: Json | null
          notes?: string | null
          revision_id?: number
          revision_type: string
          situation_id: number
        }
        Update: {
          campaign_id?: number
          changed_at?: string
          changed_by?: string | null
          diff?: Json | null
          notes?: string | null
          revision_id?: number
          revision_type?: string
          situation_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_situation_revisions_situation_id_fkey"
            columns: ["situation_id"]
            isOneToOne: false
            referencedRelation: "campaign_situation_analyses"
            referencedColumns: ["situation_id"]
          },
        ]
      }
      campaign_stage_plans: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          campaign_id: number
          created_at: string | null
          created_by: string | null
          phase: Database["public"]["Enums"]["campaign_phase_enum"]
          plan_id: number
          planned_end_date: string | null
          planned_start_date: string | null
          stage_name: string
          stage_number: number
          status: string
          step_overrides: Json
          updated_at: string | null
          workplan_status: string | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          campaign_id: number
          created_at?: string | null
          created_by?: string | null
          phase?: Database["public"]["Enums"]["campaign_phase_enum"]
          plan_id?: number
          planned_end_date?: string | null
          planned_start_date?: string | null
          stage_name: string
          stage_number: number
          status?: string
          step_overrides?: Json
          updated_at?: string | null
          workplan_status?: string | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          campaign_id?: number
          created_at?: string | null
          created_by?: string | null
          phase?: Database["public"]["Enums"]["campaign_phase_enum"]
          plan_id?: number
          planned_end_date?: string | null
          planned_start_date?: string | null
          stage_name?: string
          stage_number?: number
          status?: string
          step_overrides?: Json
          updated_at?: string | null
          workplan_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_stage_workplan_tasks: {
        Row: {
          assigned_organiser_id: number | null
          assigned_ou_id: number | null
          assigned_worker_id: number | null
          campaign_id: number
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          outcome_notes: string | null
          plan_ambition_id: number | null
          priority: number
          stage_number: number
          status: string
          task_id: number
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_organiser_id?: number | null
          assigned_ou_id?: number | null
          assigned_worker_id?: number | null
          campaign_id: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          outcome_notes?: string | null
          plan_ambition_id?: number | null
          priority?: number
          stage_number: number
          status?: string
          task_id?: number
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_organiser_id?: number | null
          assigned_ou_id?: number | null
          assigned_worker_id?: number | null
          campaign_id?: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          outcome_notes?: string | null
          plan_ambition_id?: number | null
          priority?: number
          stage_number?: number
          status?: string
          task_id?: number
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_stage_workplan_tasks_assigned_organiser_id_fkey"
            columns: ["assigned_organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_assigned_ou_id_fkey"
            columns: ["assigned_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_assigned_ou_id_fkey"
            columns: ["assigned_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_assigned_ou_id_fkey"
            columns: ["assigned_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_assigned_ou_id_fkey"
            columns: ["assigned_ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_assigned_ou_id_fkey"
            columns: ["assigned_ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_assigned_worker_id_fkey"
            columns: ["assigned_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
        ]
      }
      campaign_task_list_items: {
        Row: {
          created_at: string
          id: number
          sort_order: number
          task_list_id: number
          worker_id: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          sort_order?: number
          task_list_id: number
          worker_id?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          sort_order?: number
          task_list_id?: number
          worker_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_task_list_items_task_list_id_fkey"
            columns: ["task_list_id"]
            isOneToOne: false
            referencedRelation: "campaign_task_lists"
            referencedColumns: ["task_list_id"]
          },
          {
            foreignKeyName: "campaign_task_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_task_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_task_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_task_lists: {
        Row: {
          activity_id: number | null
          campaign_id: number
          created_at: string
          draft_notes: string | null
          include_membership_ask: boolean
          leader_instructions: string | null
          leader_organiser_id: number | null
          leader_worker_id: number | null
          status: string
          task_list_id: number
          title: string | null
        }
        Insert: {
          activity_id?: number | null
          campaign_id: number
          created_at?: string
          draft_notes?: string | null
          include_membership_ask?: boolean
          leader_instructions?: string | null
          leader_organiser_id?: number | null
          leader_worker_id?: number | null
          status?: string
          task_list_id?: number
          title?: string | null
        }
        Update: {
          activity_id?: number | null
          campaign_id?: number
          created_at?: string
          draft_notes?: string | null
          include_membership_ask?: boolean
          leader_instructions?: string | null
          leader_organiser_id?: number | null
          leader_worker_id?: number | null
          status?: string
          task_list_id?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_task_lists_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_leader_organiser_id_fkey"
            columns: ["leader_organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_task_lists_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_timelines: {
        Row: {
          agreement_expiry_date: string | null
          agreement_id: number | null
          campaign_id: number
          created_at: string | null
          notes: string | null
          pabo_available_date: string | null
          peak_engagement_target_date: string | null
          timeline_id: number
          updated_at: string | null
          working_backwards: boolean | null
        }
        Insert: {
          agreement_expiry_date?: string | null
          agreement_id?: number | null
          campaign_id: number
          created_at?: string | null
          notes?: string | null
          pabo_available_date?: string | null
          peak_engagement_target_date?: string | null
          timeline_id?: number
          updated_at?: string | null
          working_backwards?: boolean | null
        }
        Update: {
          agreement_expiry_date?: string | null
          agreement_id?: number | null
          campaign_id?: number
          created_at?: string | null
          notes?: string | null
          pabo_available_date?: string | null
          peak_engagement_target_date?: string | null
          timeline_id?: number
          updated_at?: string | null
          working_backwards?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_timelines_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "campaign_timelines_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "campaign_timelines_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_timelines_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_unit_rules: {
        Row: {
          campaign_id: number
          created_at: string
          dimension_type: string
          include: boolean
          operator: string
          ou_id: number
          rule_id: number
          updated_at: string
          value_int: number | null
          value_text: string | null
        }
        Insert: {
          campaign_id: number
          created_at?: string
          dimension_type: string
          include?: boolean
          operator?: string
          ou_id: number
          rule_id?: number
          updated_at?: string
          value_int?: number | null
          value_text?: string | null
        }
        Update: {
          campaign_id?: number
          created_at?: string
          dimension_type?: string
          include?: boolean
          operator?: string
          ou_id?: number
          rule_id?: number
          updated_at?: string
          value_int?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_unit_rules_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
        ]
      }
      campaign_universe_rules: {
        Row: {
          include: boolean
          rule_entity_id: number
          rule_id: number
          rule_type: string
          universe_id: number
        }
        Insert: {
          include?: boolean
          rule_entity_id: number
          rule_id?: number
          rule_type: string
          universe_id: number
        }
        Update: {
          include?: boolean
          rule_entity_id?: number
          rule_id?: number
          rule_type?: string
          universe_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_universe_rules_universe_id_fkey"
            columns: ["universe_id"]
            isOneToOne: false
            referencedRelation: "campaign_universes"
            referencedColumns: ["universe_id"]
          },
        ]
      }
      campaign_universes: {
        Row: {
          campaign_id: number
          description: string | null
          name: string
          universe_id: number
        }
        Insert: {
          campaign_id: number
          description?: string | null
          name: string
          universe_id?: number
        }
        Update: {
          campaign_id?: number
          description?: string | null
          name?: string
          universe_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_universes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_wocs: {
        Row: {
          cadence: string | null
          campaign_id: number
          created_at: string
          created_by: string | null
          format: string | null
          name: string
          notes: string | null
          scope_ou_id: number | null
          status: string
          updated_at: string
          woc_id: number
        }
        Insert: {
          cadence?: string | null
          campaign_id: number
          created_at?: string
          created_by?: string | null
          format?: string | null
          name: string
          notes?: string | null
          scope_ou_id?: number | null
          status?: string
          updated_at?: string
          woc_id?: number
        }
        Update: {
          cadence?: string | null
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          format?: string | null
          name?: string
          notes?: string | null
          scope_ou_id?: number | null
          status?: string
          updated_at?: string
          woc_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_scope_ou_id_fkey"
            columns: ["scope_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_wocs_scope_ou_id_fkey"
            columns: ["scope_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_wocs_scope_ou_id_fkey"
            columns: ["scope_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_wocs_scope_ou_id_fkey"
            columns: ["scope_ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_wocs_scope_ou_id_fkey"
            columns: ["scope_ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
        ]
      }
      campaign_worker_list_items: {
        Row: {
          added_at: string
          id: number
          list_id: number
          sort_order: number
          source_ou_id: number | null
          worker_id: number
        }
        Insert: {
          added_at?: string
          id?: number
          list_id: number
          sort_order?: number
          source_ou_id?: number | null
          worker_id: number
        }
        Update: {
          added_at?: string
          id?: number
          list_id?: number
          sort_order?: number
          source_ou_id?: number | null
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_worker_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "campaign_worker_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_worker_list_items_source_ou_id_fkey"
            columns: ["source_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_list_items_source_ou_id_fkey"
            columns: ["source_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_list_items_source_ou_id_fkey"
            columns: ["source_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_list_items_source_ou_id_fkey"
            columns: ["source_ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_list_items_source_ou_id_fkey"
            columns: ["source_ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_worker_lists: {
        Row: {
          campaign_id: number
          created_at: string
          created_by: string | null
          default_purpose: string | null
          description: string | null
          fired_at: string | null
          fired_call_list_id: number | null
          fired_draft_id: number | null
          fired_email_list_id: number | null
          fired_sms_list_id: number | null
          fired_task_list_id: number | null
          leader_organiser_id: number | null
          leader_worker_id: number | null
          list_id: number
          name: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: number
          created_at?: string
          created_by?: string | null
          default_purpose?: string | null
          description?: string | null
          fired_at?: string | null
          fired_call_list_id?: number | null
          fired_draft_id?: number | null
          fired_email_list_id?: number | null
          fired_sms_list_id?: number | null
          fired_task_list_id?: number | null
          leader_organiser_id?: number | null
          leader_worker_id?: number | null
          list_id?: number
          name: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          default_purpose?: string | null
          description?: string | null
          fired_at?: string | null
          fired_call_list_id?: number | null
          fired_draft_id?: number | null
          fired_email_list_id?: number | null
          fired_sms_list_id?: number | null
          fired_task_list_id?: number | null
          leader_organiser_id?: number | null
          leader_worker_id?: number | null
          list_id?: number
          name?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_fired_email_list_id_fkey"
            columns: ["fired_email_list_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_fired_email_list_id_fkey"
            columns: ["fired_email_list_id"]
            isOneToOne: false
            referencedRelation: "vw_email_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_fired_sms_list_id_fkey"
            columns: ["fired_sms_list_id"]
            isOneToOne: false
            referencedRelation: "sms_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_fired_sms_list_id_fkey"
            columns: ["fired_sms_list_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_fired_sms_list_id_fkey"
            columns: ["fired_sms_list_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_chat_session_report"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_leader_organiser_id_fkey"
            columns: ["leader_organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_lists_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_worker_membership: {
        Row: {
          campaign_id: number
          created_at: string
          membership_id: number
          updated_at: string
          worker_id: number
        }
        Insert: {
          campaign_id: number
          created_at?: string
          membership_id?: number
          updated_at?: string
          worker_id: number
        }
        Update: {
          campaign_id?: number
          created_at?: string
          membership_id?: number
          updated_at?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_worker_ou: {
        Row: {
          assigned_rule_id: number | null
          assignment_source: string
          created_at: string
          id: number
          is_primary: boolean
          ou_id: number
          worker_id: number
        }
        Insert: {
          assigned_rule_id?: number | null
          assignment_source?: string
          created_at?: string
          id?: number
          is_primary?: boolean
          ou_id: number
          worker_id: number
        }
        Update: {
          assigned_rule_id?: number | null
          assignment_source?: string
          created_at?: string
          id?: number
          is_primary?: boolean
          ou_id?: number
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_worker_ou_assigned_rule_id_fkey"
            columns: ["assigned_rule_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_rules"
            referencedColumns: ["rule_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_worksites: {
        Row: {
          campaign_id: number
          created_at: string
          id: number
          sector_wide: boolean
          worksite_id: number | null
        }
        Insert: {
          campaign_id: number
          created_at?: string
          id?: number
          sector_wide?: boolean
          worksite_id?: number | null
        }
        Update: {
          campaign_id?: number
          created_at?: string
          id?: number
          sector_wide?: boolean
          worksite_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "campaign_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "campaign_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "campaign_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "campaign_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      campaigns: {
        Row: {
          bargaining_commenced_at: string | null
          campaign_id: number
          campaign_scope: string | null
          campaign_type: string
          created_at: string
          created_by: string | null
          current_phase: Database["public"]["Enums"]["campaign_phase_enum"]
          description: string | null
          end_date: string | null
          enterprise_agreement_subtype: string | null
          is_sms_episode: boolean
          is_standing: boolean
          msd_required: boolean
          name: string
          notes: string | null
          organiser_id: number | null
          plan_timeframe_weeks: number | null
          replaced_agreement_id: number | null
          sector_wide: boolean
          start_date: string | null
          status: string
          total_worker_estimate: number | null
          updated_at: string
          wizard_bargaining_triage: string | null
        }
        Insert: {
          bargaining_commenced_at?: string | null
          campaign_id?: number
          campaign_scope?: string | null
          campaign_type: string
          created_at?: string
          created_by?: string | null
          current_phase?: Database["public"]["Enums"]["campaign_phase_enum"]
          description?: string | null
          end_date?: string | null
          enterprise_agreement_subtype?: string | null
          is_sms_episode?: boolean
          is_standing?: boolean
          msd_required?: boolean
          name: string
          notes?: string | null
          organiser_id?: number | null
          plan_timeframe_weeks?: number | null
          replaced_agreement_id?: number | null
          sector_wide?: boolean
          start_date?: string | null
          status?: string
          total_worker_estimate?: number | null
          updated_at?: string
          wizard_bargaining_triage?: string | null
        }
        Update: {
          bargaining_commenced_at?: string | null
          campaign_id?: number
          campaign_scope?: string | null
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          current_phase?: Database["public"]["Enums"]["campaign_phase_enum"]
          description?: string | null
          end_date?: string | null
          enterprise_agreement_subtype?: string | null
          is_sms_episode?: boolean
          is_standing?: boolean
          msd_required?: boolean
          name?: string
          notes?: string | null
          organiser_id?: number | null
          plan_timeframe_weeks?: number | null
          replaced_agreement_id?: number | null
          sector_wide?: boolean
          start_date?: string | null
          status?: string
          total_worker_estimate?: number | null
          updated_at?: string
          wizard_bargaining_triage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "campaigns_replaced_agreement_id_fkey"
            columns: ["replaced_agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "campaigns_replaced_agreement_id_fkey"
            columns: ["replaced_agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "campaigns_replaced_agreement_id_fkey"
            columns: ["replaced_agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
        ]
      }
      capacity_options: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          is_active: boolean | null
          is_system_default: boolean | null
          linked_wtp_categories: number[] | null
          option_id: number
          option_text: string
          stage_number: number
          use_count: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          is_active?: boolean | null
          is_system_default?: boolean | null
          linked_wtp_categories?: number[] | null
          option_id?: number
          option_text: string
          stage_number: number
          use_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          is_active?: boolean | null
          is_system_default?: boolean | null
          linked_wtp_categories?: number[] | null
          option_id?: number
          option_text?: string
          stage_number?: number
          use_count?: number | null
        }
        Relationships: []
      }
      comms_template_library: {
        Row: {
          activity_type: string | null
          an_template_id: string | null
          audience_segment: string | null
          body_html: string | null
          body_text: string
          created_at: string
          created_by: string | null
          design_metadata: Json | null
          is_active: boolean
          platform: string
          source_import_id: number | null
          stage_number: number | null
          subject_line: string | null
          template_id: number
          title: string
          tone_tags: string[] | null
          updated_at: string
          variables: Json | null
        }
        Insert: {
          activity_type?: string | null
          an_template_id?: string | null
          audience_segment?: string | null
          body_html?: string | null
          body_text: string
          created_at?: string
          created_by?: string | null
          design_metadata?: Json | null
          is_active?: boolean
          platform: string
          source_import_id?: number | null
          stage_number?: number | null
          subject_line?: string | null
          template_id?: number
          title: string
          tone_tags?: string[] | null
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          activity_type?: string | null
          an_template_id?: string | null
          audience_segment?: string | null
          body_html?: string | null
          body_text?: string
          created_at?: string
          created_by?: string | null
          design_metadata?: Json | null
          is_active?: boolean
          platform?: string
          source_import_id?: number | null
          stage_number?: number | null
          subject_line?: string | null
          template_id?: number
          title?: string
          tone_tags?: string[] | null
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "comms_template_library_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "email_imports"
            referencedColumns: ["import_id"]
          },
        ]
      }
      communications_log: {
        Row: {
          action_network_id: string | null
          channel: string
          content: string | null
          direction: string
          log_id: number
          sent_at: string
          sent_by: number | null
          worker_id: number
          yabbr_message_id: string | null
        }
        Insert: {
          action_network_id?: string | null
          channel: string
          content?: string | null
          direction: string
          log_id?: number
          sent_at?: string
          sent_by?: number | null
          worker_id: number
          yabbr_message_id?: string | null
        }
        Update: {
          action_network_id?: string | null
          channel?: string
          content?: string | null
          direction?: string
          log_id?: number
          sent_at?: string
          sent_by?: number | null
          worker_id?: number
          yabbr_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_log_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "communications_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "communications_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "communications_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      documents: {
        Row: {
          agreement_id: number | null
          campaign_id: number | null
          created_at: string
          document_id: number
          document_type: string
          employer_id: number | null
          file_path: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          agreement_id?: number | null
          campaign_id?: number | null
          created_at?: string
          document_id?: number
          document_type?: string
          employer_id?: number | null
          file_path: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          agreement_id?: number | null
          campaign_id?: number | null
          created_at?: string
          document_id?: number
          document_type?: string
          employer_id?: number | null
          file_path?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "documents_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "documents_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "documents_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "documents_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "documents_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      dues_increases: {
        Row: {
          agreement_id: number
          effective_date: string | null
          increase_id: number
          increase_number: number
          increase_type: string | null
          maximum_pct: number | null
          minimum_pct: number | null
          percentage: number | null
          raw_description: string | null
        }
        Insert: {
          agreement_id: number
          effective_date?: string | null
          increase_id?: number
          increase_number: number
          increase_type?: string | null
          maximum_pct?: number | null
          minimum_pct?: number | null
          percentage?: number | null
          raw_description?: string | null
        }
        Update: {
          agreement_id?: number
          effective_date?: string | null
          increase_id?: number
          increase_number?: number
          increase_type?: string | null
          maximum_pct?: number | null
          minimum_pct?: number | null
          percentage?: number | null
          raw_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dues_increases_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "dues_increases_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "dues_increases_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
        ]
      }
      email_click_tokens: {
        Row: {
          created_at: string
          hits: number
          send_id: number
          target_url: string
          token: string
        }
        Insert: {
          created_at?: string
          hits?: number
          send_id: number
          target_url: string
          token: string
        }
        Update: {
          created_at?: string
          hits?: number
          send_id?: number
          target_url?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_click_tokens_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "email_send_log"
            referencedColumns: ["send_id"]
          },
        ]
      }
      email_conversations: {
        Row: {
          assignee_user_id: string | null
          campaign_id: number | null
          conversation_id: number
          created_at: string
          email_address: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_outbound_at: string | null
          state: string
          subject: string | null
          unread_count: number
          updated_at: string
          worker_id: number | null
        }
        Insert: {
          assignee_user_id?: string | null
          campaign_id?: number | null
          conversation_id?: number
          created_at?: string
          email_address: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          state?: string
          subject?: string | null
          unread_count?: number
          updated_at?: string
          worker_id?: number | null
        }
        Update: {
          assignee_user_id?: string | null
          campaign_id?: number | null
          conversation_id?: number
          created_at?: string
          email_address?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          state?: string
          subject?: string | null
          unread_count?: number
          updated_at?: string
          worker_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_conversations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "email_conversations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "email_conversations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      email_cta_responses: {
        Row: {
          activity_id: number | null
          campaign_id: number | null
          created_at: string
          created_by: string | null
          cta_response: string | null
          email_event: string
          external_event_id: string | null
          id: number
          maps_to_binary: string | null
          maps_to_rating: number | null
          notes: string | null
          occurred_at: string
          worker_id: number
        }
        Insert: {
          activity_id?: number | null
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          cta_response?: string | null
          email_event: string
          external_event_id?: string | null
          id?: number
          maps_to_binary?: string | null
          maps_to_rating?: number | null
          notes?: string | null
          occurred_at?: string
          worker_id: number
        }
        Update: {
          activity_id?: number | null
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          cta_response?: string | null
          email_event?: string
          external_event_id?: string | null
          id?: number
          maps_to_binary?: string | null
          maps_to_rating?: number | null
          notes?: string | null
          occurred_at?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_cta_responses_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_cta_responses_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "email_cta_responses_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "email_cta_responses_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      email_delivery_events: {
        Row: {
          event_id: number
          event_type: string
          occurred_at: string
          payload: Json | null
          provider_event_id: string
          provider_message_id: string | null
          send_id: number | null
        }
        Insert: {
          event_id?: number
          event_type: string
          occurred_at?: string
          payload?: Json | null
          provider_event_id: string
          provider_message_id?: string | null
          send_id?: number | null
        }
        Update: {
          event_id?: number
          event_type?: string
          occurred_at?: string
          payload?: Json | null
          provider_event_id?: string
          provider_message_id?: string | null
          send_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_delivery_events_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "email_send_log"
            referencedColumns: ["send_id"]
          },
        ]
      }
      email_engagement_events: {
        Row: {
          event_id: number
          event_type: string
          occurred_at: string
          payload: Json | null
          send_id: number
        }
        Insert: {
          event_id?: number
          event_type: string
          occurred_at?: string
          payload?: Json | null
          send_id: number
        }
        Update: {
          event_id?: number
          event_type?: string
          occurred_at?: string
          payload?: Json | null
          send_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_engagement_events_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "email_send_log"
            referencedColumns: ["send_id"]
          },
        ]
      }
      email_imports: {
        Row: {
          ai_analysis: Json | null
          analysis_status: string
          attachments: Json | null
          body_html: string | null
          body_text: string | null
          created_at: string
          created_by: string | null
          from_address: string | null
          import_id: number
          imported_template_id: number | null
          raw_headers: Json | null
          resend_email_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          subject: string
          subject_tag: string | null
          to_address: string | null
          updated_at: string
        }
        Insert: {
          ai_analysis?: Json | null
          analysis_status?: string
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          from_address?: string | null
          import_id?: number
          imported_template_id?: number | null
          raw_headers?: Json | null
          resend_email_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          subject: string
          subject_tag?: string | null
          to_address?: string | null
          updated_at?: string
        }
        Update: {
          ai_analysis?: Json | null
          analysis_status?: string
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          from_address?: string | null
          import_id?: number
          imported_template_id?: number | null
          raw_headers?: Json | null
          resend_email_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          subject?: string
          subject_tag?: string | null
          to_address?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_imports_imported_template_id_fkey"
            columns: ["imported_template_id"]
            isOneToOne: false
            referencedRelation: "comms_template_library"
            referencedColumns: ["template_id"]
          },
        ]
      }
      email_list_items: {
        Row: {
          claimed_at: string | null
          created_at: string
          delivered_at: string | null
          email: string | null
          failure_reason: string | null
          item_id: number
          list_id: number
          priority_score: number | null
          provider_message_id: string | null
          send_before: string | null
          send_status_detail: string | null
          sent_at: string | null
          sort_order: number
          status: string
          updated_at: string
          worker_id: number
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          email?: string | null
          failure_reason?: string | null
          item_id?: number
          list_id: number
          priority_score?: number | null
          provider_message_id?: string | null
          send_before?: string | null
          send_status_detail?: string | null
          sent_at?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          worker_id: number
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          email?: string | null
          failure_reason?: string | null
          item_id?: number
          list_id?: number
          priority_score?: number | null
          provider_message_id?: string | null
          send_before?: string | null
          send_status_detail?: string | null
          sent_at?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "email_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "email_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vw_email_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "email_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "email_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "email_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      email_lists: {
        Row: {
          blackout_override: boolean
          campaign_id: number
          created_at: string
          created_by: string | null
          delivered_items: number
          description: string | null
          draft_id: number | null
          failed_items: number
          list_id: number
          name: string
          scheduled_for: string | null
          sent_items: number
          source_filters: Json | null
          status: string
          timezone: string
          total_items: number
          updated_at: string
          wrapper_id: number | null
        }
        Insert: {
          blackout_override?: boolean
          campaign_id: number
          created_at?: string
          created_by?: string | null
          delivered_items?: number
          description?: string | null
          draft_id?: number | null
          failed_items?: number
          list_id?: number
          name: string
          scheduled_for?: string | null
          sent_items?: number
          source_filters?: Json | null
          status?: string
          timezone?: string
          total_items?: number
          updated_at?: string
          wrapper_id?: number | null
        }
        Update: {
          blackout_override?: boolean
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          delivered_items?: number
          description?: string | null
          draft_id?: number | null
          failed_items?: number
          list_id?: number
          name?: string
          scheduled_for?: string | null
          sent_items?: number
          source_filters?: Json | null
          status?: string
          timezone?: string
          total_items?: number
          updated_at?: string
          wrapper_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "campaign_comms_drafts"
            referencedColumns: ["draft_id"]
          },
          {
            foreignKeyName: "email_lists_wrapper_id_fkey"
            columns: ["wrapper_id"]
            isOneToOne: false
            referencedRelation: "email_wrappers"
            referencedColumns: ["wrapper_id"]
          },
        ]
      }
      email_messages: {
        Row: {
          attachments: Json | null
          body_html: string | null
          body_text: string | null
          conversation_id: number
          created_at: string
          direction: string
          error: string | null
          from_email: string | null
          in_reply_to: string | null
          message_id: number
          provider_message_id: string | null
          send_id: number | null
          sender_user_id: string | null
          status: string
          subject: string | null
          to_email: string | null
        }
        Insert: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          conversation_id: number
          created_at?: string
          direction: string
          error?: string | null
          from_email?: string | null
          in_reply_to?: string | null
          message_id?: number
          provider_message_id?: string | null
          send_id?: number | null
          sender_user_id?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
        }
        Update: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          conversation_id?: number
          created_at?: string
          direction?: string
          error?: string | null
          from_email?: string | null
          in_reply_to?: string | null
          message_id?: number
          provider_message_id?: string | null
          send_id?: number | null
          sender_user_id?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "email_conversations"
            referencedColumns: ["conversation_id"]
          },
          {
            foreignKeyName: "email_messages_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "email_send_log"
            referencedColumns: ["send_id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          bounce_reason: string | null
          bounced_at: string | null
          campaign_id: number
          click_count: number
          conversation_id: string | null
          created_at: string
          delivered_at: string | null
          draft_id: number
          external_message_id: string | null
          first_click_at: string | null
          first_open_at: string | null
          first_reply_message_id: string | null
          latest_reply_message_id: string | null
          open_count: number
          provider_message_id: string | null
          recipient_email: string
          replied_at: string | null
          reply_count: number
          reply_snippet: string | null
          send_id: number
          send_method: string
          unsubscribed_at: string | null
          user_id: string | null
          worker_id: number
        }
        Insert: {
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id: number
          click_count?: number
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          draft_id: number
          external_message_id?: string | null
          first_click_at?: string | null
          first_open_at?: string | null
          first_reply_message_id?: string | null
          latest_reply_message_id?: string | null
          open_count?: number
          provider_message_id?: string | null
          recipient_email: string
          replied_at?: string | null
          reply_count?: number
          reply_snippet?: string | null
          send_id?: number
          send_method: string
          unsubscribed_at?: string | null
          user_id?: string | null
          worker_id: number
        }
        Update: {
          bounce_reason?: string | null
          bounced_at?: string | null
          campaign_id?: number
          click_count?: number
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          draft_id?: number
          external_message_id?: string | null
          first_click_at?: string | null
          first_open_at?: string | null
          first_reply_message_id?: string | null
          latest_reply_message_id?: string | null
          open_count?: number
          provider_message_id?: string | null
          recipient_email?: string
          replied_at?: string | null
          reply_count?: number
          reply_snippet?: string | null
          send_id?: number
          send_method?: string
          unsubscribed_at?: string | null
          user_id?: string | null
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "campaign_comms_drafts"
            referencedColumns: ["draft_id"]
          },
          {
            foreignKeyName: "email_send_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "email_send_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "email_send_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          send_id: number | null
          token: string
          used_at: string | null
          worker_id: number
        }
        Insert: {
          created_at?: string
          send_id?: number | null
          token: string
          used_at?: string | null
          worker_id: number
        }
        Update: {
          created_at?: string
          send_id?: number | null
          token?: string
          used_at?: string | null
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_unsubscribe_tokens_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "email_send_log"
            referencedColumns: ["send_id"]
          },
          {
            foreignKeyName: "email_unsubscribe_tokens_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "email_unsubscribe_tokens_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "email_unsubscribe_tokens_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      email_wrappers: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          footer_html: string
          header_html: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
          wrapper_id: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          footer_html: string
          header_html?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
          wrapper_id?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          footer_html?: string
          header_html?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
          wrapper_id?: number
        }
        Relationships: []
      }
      employer_merge_events: {
        Row: {
          created_at: string
          id: number
          payload: Json
          performed_by: string | null
          survivor_employer_id: number | null
          victim_employer_ids: number[]
        }
        Insert: {
          created_at?: string
          id?: number
          payload?: Json
          performed_by?: string | null
          survivor_employer_id?: number | null
          victim_employer_ids: number[]
        }
        Update: {
          created_at?: string
          id?: number
          payload?: Json
          performed_by?: string | null
          survivor_employer_id?: number | null
          victim_employer_ids?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "employer_merge_events_survivor_employer_id_fkey"
            columns: ["survivor_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_merge_events_survivor_employer_id_fkey"
            columns: ["survivor_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_merge_events_survivor_employer_id_fkey"
            columns: ["survivor_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      employer_name_aliases: {
        Row: {
          alias_name: string
          created_at: string
          created_by: string | null
          employer_id: number
          id: number
          source: string
        }
        Insert: {
          alias_name: string
          created_at?: string
          created_by?: string | null
          employer_id: number
          id?: number
          source?: string
        }
        Update: {
          alias_name?: string
          created_at?: string
          created_by?: string | null
          employer_id?: number
          id?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "employer_name_aliases_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_name_aliases_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_name_aliases_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      employer_scopes: {
        Row: {
          employer_id: number
          id: number
          is_current: boolean
          scope_id: number
          source: string
        }
        Insert: {
          employer_id: number
          id?: number
          is_current?: boolean
          scope_id: number
          source?: string
        }
        Update: {
          employer_id?: number
          id?: number
          is_current?: boolean
          scope_id?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "employer_scopes_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_scopes_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_scopes_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "employer_scopes_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "work_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      employer_sectors: {
        Row: {
          employer_id: number
          id: number
          sector_id: number
        }
        Insert: {
          employer_id: number
          id?: number
          sector_id: number
        }
        Update: {
          employer_id?: number
          id?: number
          sector_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "employer_sectors_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_sectors_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_sectors_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "employer_sectors_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["sector_id"]
          },
          {
            foreignKeyName: "employer_sectors_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["sector_id"]
          },
        ]
      }
      employer_state_bargaining_phase_map: {
        Row: {
          bargaining_phase_state: string
          employer_interaction_state: string
        }
        Insert: {
          bargaining_phase_state: string
          employer_interaction_state: string
        }
        Update: {
          bargaining_phase_state?: string
          employer_interaction_state?: string
        }
        Relationships: []
      }
      employer_tags: {
        Row: {
          employer_id: number
          id: number
          tag_id: number
        }
        Insert: {
          employer_id: number
          id?: number
          tag_id: number
        }
        Update: {
          employer_id?: number
          id?: number
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "employer_tags_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_tags_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_tags_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "employer_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["tag_id"]
          },
        ]
      }
      employer_worksite_roles: {
        Row: {
          employer_id: number
          end_date: string | null
          id: number
          is_current: boolean
          notes: string | null
          role_type: string
          start_date: string | null
          worksite_id: number
        }
        Insert: {
          employer_id: number
          end_date?: string | null
          id?: number
          is_current?: boolean
          notes?: string | null
          role_type: string
          start_date?: string | null
          worksite_id: number
        }
        Update: {
          employer_id?: number
          end_date?: string | null
          id?: number
          is_current?: boolean
          notes?: string | null
          role_type?: string
          start_date?: string | null
          worksite_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      employers: {
        Row: {
          abn: string | null
          address: string | null
          created_at: string
          email: string | null
          employer_category: string | null
          employer_id: number
          employer_name: string
          is_active: boolean
          parent_company: string | null
          parent_employer_id: number | null
          phone: string | null
          postcode: string | null
          state: string | null
          trading_name: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          abn?: string | null
          address?: string | null
          created_at?: string
          email?: string | null
          employer_category?: string | null
          employer_id?: number
          employer_name: string
          is_active?: boolean
          parent_company?: string | null
          parent_employer_id?: number | null
          phone?: string | null
          postcode?: string | null
          state?: string | null
          trading_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          abn?: string | null
          address?: string | null
          created_at?: string
          email?: string | null
          employer_category?: string | null
          employer_id?: number
          employer_name?: string
          is_active?: boolean
          parent_company?: string | null
          parent_employer_id?: number | null
          phone?: string | null
          postcode?: string | null
          state?: string | null
          trading_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employers_parent_employer_id_fkey"
            columns: ["parent_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employers_parent_employer_id_fkey"
            columns: ["parent_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employers_parent_employer_id_fkey"
            columns: ["parent_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      gate_assessments: {
        Row: {
          approved_by: string | null
          assessed_by: string | null
          assessment_date: string | null
          assessment_id: number
          created_at: string | null
          gate_id: number
          notes: string | null
          outcome: string
          override_justification: string | null
          snapshot: Json | null
        }
        Insert: {
          approved_by?: string | null
          assessed_by?: string | null
          assessment_date?: string | null
          assessment_id?: number
          created_at?: string | null
          gate_id: number
          notes?: string | null
          outcome: string
          override_justification?: string | null
          snapshot?: Json | null
        }
        Update: {
          approved_by?: string | null
          assessed_by?: string | null
          assessment_date?: string | null
          assessment_id?: number
          created_at?: string | null
          gate_id?: number
          notes?: string | null
          outcome?: string
          override_justification?: string | null
          snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_assessments_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "gate_definitions"
            referencedColumns: ["gate_id"]
          },
        ]
      }
      gate_criteria: {
        Row: {
          assessed_at: string | null
          assessed_by: string | null
          calculation_source: string | null
          created_at: string | null
          criterion_id: number
          criterion_name: string
          current_value: string | null
          description: string | null
          evidence_notes: string | null
          gate_id: number
          is_hard_gate: boolean | null
          is_met: boolean | null
          last_calculated_at: string | null
          metric_type: string
          sort_order: number | null
          target_value: string
          updated_at: string | null
        }
        Insert: {
          assessed_at?: string | null
          assessed_by?: string | null
          calculation_source?: string | null
          created_at?: string | null
          criterion_id?: number
          criterion_name: string
          current_value?: string | null
          description?: string | null
          evidence_notes?: string | null
          gate_id: number
          is_hard_gate?: boolean | null
          is_met?: boolean | null
          last_calculated_at?: string | null
          metric_type: string
          sort_order?: number | null
          target_value: string
          updated_at?: string | null
        }
        Update: {
          assessed_at?: string | null
          assessed_by?: string | null
          calculation_source?: string | null
          created_at?: string | null
          criterion_id?: number
          criterion_name?: string
          current_value?: string | null
          description?: string | null
          evidence_notes?: string | null
          gate_id?: number
          is_hard_gate?: boolean | null
          is_met?: boolean | null
          last_calculated_at?: string | null
          metric_type?: string
          sort_order?: number | null
          target_value?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_criteria_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "gate_definitions"
            referencedColumns: ["gate_id"]
          },
        ]
      }
      gate_definitions: {
        Row: {
          campaign_id: number | null
          created_at: string | null
          description: string | null
          enforcement_type: string
          gate_id: number
          gate_name: string
          gate_number: number
          gate_type: string | null
          is_active: boolean | null
          name: string | null
          stage_number: number | null
        }
        Insert: {
          campaign_id?: number | null
          created_at?: string | null
          description?: string | null
          enforcement_type?: string
          gate_id?: number
          gate_name: string
          gate_number: number
          gate_type?: string | null
          is_active?: boolean | null
          name?: string | null
          stage_number?: number | null
        }
        Update: {
          campaign_id?: number | null
          created_at?: string | null
          description?: string | null
          enforcement_type?: string
          gate_id?: number
          gate_name?: string
          gate_number?: number
          gate_type?: string | null
          is_active?: boolean | null
          name?: string | null
          stage_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      import_logs: {
        Row: {
          archived_at: string | null
          deleted_at: string | null
          errors: string | null
          file_name: string
          import_id: number
          import_type: string
          imported_at: string
          imported_by: string | null
          is_archived: boolean | null
          records_created: number
          records_updated: number
        }
        Insert: {
          archived_at?: string | null
          deleted_at?: string | null
          errors?: string | null
          file_name: string
          import_id?: number
          import_type: string
          imported_at?: string
          imported_by?: string | null
          is_archived?: boolean | null
          records_created?: number
          records_updated?: number
        }
        Update: {
          archived_at?: string | null
          deleted_at?: string | null
          errors?: string | null
          file_name?: string
          import_id?: number
          import_type?: string
          imported_at?: string
          imported_by?: string | null
          is_archived?: boolean | null
          records_created?: number
          records_updated?: number
        }
        Relationships: []
      }
      import_logs_archive: {
        Row: {
          archive_id: number
          archived_at: string
          data: Json | null
          errors: string | null
          file_name: string
          import_id: number
          import_type: string
          imported_at: string
          imported_by: string | null
          records_created: number
          records_updated: number
        }
        Insert: {
          archive_id?: number
          archived_at?: string
          data?: Json | null
          errors?: string | null
          file_name: string
          import_id: number
          import_type: string
          imported_at: string
          imported_by?: string | null
          records_created: number
          records_updated: number
        }
        Update: {
          archive_id?: number
          archived_at?: string
          data?: Json | null
          errors?: string | null
          file_name?: string
          import_id?: number
          import_type?: string
          imported_at?: string
          imported_by?: string | null
          records_created?: number
          records_updated?: number
        }
        Relationships: []
      }
      intractable_bargaining_tracker: {
        Row: {
          arbitration_outcome_recorded_at: string | null
          bargaining_commenced_at: string
          campaign_id: number
          created_by: string | null
          intractable_application_filed_at: string | null
          intractable_declaration_made_at: string | null
          last_reviewed_at: string | null
          nine_month_threshold_at: string | null
          notes: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          arbitration_outcome_recorded_at?: string | null
          bargaining_commenced_at: string
          campaign_id: number
          created_by?: string | null
          intractable_application_filed_at?: string | null
          intractable_declaration_made_at?: string | null
          last_reviewed_at?: string | null
          nine_month_threshold_at?: string | null
          notes?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          arbitration_outcome_recorded_at?: string | null
          bargaining_commenced_at?: string
          campaign_id?: number
          created_by?: string | null
          intractable_application_filed_at?: string | null
          intractable_declaration_made_at?: string | null
          last_reviewed_at?: string | null
          nine_month_threshold_at?: string | null
          notes?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      management_system_options: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          default_frequency: string | null
          description: string | null
          is_active: boolean | null
          is_system_default: boolean | null
          option_id: number
          option_text: string
          stage_number: number
          use_count: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          default_frequency?: string | null
          description?: string | null
          is_active?: boolean | null
          is_system_default?: boolean | null
          option_id?: number
          option_text: string
          stage_number: number
          use_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          default_frequency?: string | null
          description?: string | null
          is_active?: boolean | null
          is_system_default?: boolean | null
          option_id?: number
          option_text?: string
          stage_number?: number
          use_count?: number | null
        }
        Relationships: []
      }
      meeting_attendance: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: number
          id: number
          notes: string | null
          recorded_at: string
          status: string
          worker_id: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: number
          id?: number
          notes?: string | null
          recorded_at?: string
          status: string
          worker_id: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: number
          id?: number
          notes?: string | null
          recorded_at?: string
          status?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "meeting_attendance_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "meeting_attendance_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "meeting_attendance_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      member_endorsement_votes: {
        Row: {
          campaign_id: number
          created_at: string
          created_by: string | null
          eligibility_definition: Json | null
          eligible_count: number | null
          fwc_application_number: string | null
          fwc_notification_sent_at: string | null
          informal_count: number | null
          notes: string | null
          outcome: string | null
          proposal_document_url: string | null
          proposal_label: string | null
          proposal_version: number
          updated_at: string
          vote_closes_at: string | null
          vote_id: number
          vote_kind: string
          vote_method: string | null
          vote_opens_at: string | null
          votes_abstain: number | null
          votes_no: number | null
          votes_yes: number | null
        }
        Insert: {
          campaign_id: number
          created_at?: string
          created_by?: string | null
          eligibility_definition?: Json | null
          eligible_count?: number | null
          fwc_application_number?: string | null
          fwc_notification_sent_at?: string | null
          informal_count?: number | null
          notes?: string | null
          outcome?: string | null
          proposal_document_url?: string | null
          proposal_label?: string | null
          proposal_version?: number
          updated_at?: string
          vote_closes_at?: string | null
          vote_id?: number
          vote_kind: string
          vote_method?: string | null
          vote_opens_at?: string | null
          votes_abstain?: number | null
          votes_no?: number | null
          votes_yes?: number | null
        }
        Update: {
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          eligibility_definition?: Json | null
          eligible_count?: number | null
          fwc_application_number?: string | null
          fwc_notification_sent_at?: string | null
          informal_count?: number | null
          notes?: string | null
          outcome?: string | null
          proposal_document_url?: string | null
          proposal_label?: string | null
          proposal_version?: number
          updated_at?: string
          vote_closes_at?: string | null
          vote_id?: number
          vote_kind?: string
          vote_method?: string | null
          vote_opens_at?: string | null
          votes_abstain?: number | null
          votes_no?: number | null
          votes_yes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "member_endorsement_votes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      member_role_types: {
        Row: {
          display_name: string
          is_active: boolean
          is_default: boolean
          role_name: string
          role_type_id: number
          sort_order: number
        }
        Insert: {
          display_name: string
          is_active?: boolean
          is_default?: boolean
          role_name: string
          role_type_id?: number
          sort_order?: number
        }
        Update: {
          display_name?: string
          is_active?: boolean
          is_default?: boolean
          role_name?: string
          role_type_id?: number
          sort_order?: number
        }
        Relationships: []
      }
      non_oa_union_options: {
        Row: {
          badge_initials: string
          created_at: string
          display_name: string
          is_builtin: boolean
          non_oa_union_option_id: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          badge_initials: string
          created_at?: string
          display_name: string
          is_builtin?: boolean
          non_oa_union_option_id?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          badge_initials?: string
          created_at?: string
          display_name?: string
          is_builtin?: boolean
          non_oa_union_option_id?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      oauth_send_batches: {
        Row: {
          batch_id: number
          connection_id: number | null
          created_at: string
          draft_id: number | null
          drafts_created: number
          drafts_failed: number
          errors: Json | null
          mode: string
          recipient_count: number
          user_id: string
        }
        Insert: {
          batch_id?: number
          connection_id?: number | null
          created_at?: string
          draft_id?: number | null
          drafts_created?: number
          drafts_failed?: number
          errors?: Json | null
          mode: string
          recipient_count?: number
          user_id: string
        }
        Update: {
          batch_id?: number
          connection_id?: number | null
          created_at?: string
          draft_id?: number | null
          drafts_created?: number
          drafts_failed?: number
          errors?: Json | null
          mode?: string
          recipient_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_send_batches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "user_oauth_connections"
            referencedColumns: ["connection_id"]
          },
          {
            foreignKeyName: "oauth_send_batches_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "campaign_comms_drafts"
            referencedColumns: ["draft_id"]
          },
        ]
      }
      occupation_aliases: {
        Row: {
          alias_name: string
          created_at: string
          created_by: string | null
          id: number
          occupation_id: number
          source: string
        }
        Insert: {
          alias_name: string
          created_at?: string
          created_by?: string | null
          id?: number
          occupation_id: number
          source?: string
        }
        Update: {
          alias_name?: string
          created_at?: string
          created_by?: string | null
          id?: number
          occupation_id?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "occupation_aliases_occupation_id_fkey"
            columns: ["occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["occupation_id"]
          },
        ]
      }
      occupation_groups: {
        Row: {
          created_at: string
          display_order: number
          group_id: number
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          group_id?: number
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          display_order?: number
          group_id?: number
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      occupations: {
        Row: {
          canonical_name: string
          category: string | null
          created_at: string
          is_active: boolean
          occupation_group_id: number | null
          occupation_id: number
          updated_at: string
        }
        Insert: {
          canonical_name: string
          category?: string | null
          created_at?: string
          is_active?: boolean
          occupation_group_id?: number | null
          occupation_id?: number
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          category?: string | null
          created_at?: string
          is_active?: boolean
          occupation_group_id?: number | null
          occupation_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "occupations_occupation_group_id_fkey"
            columns: ["occupation_group_id"]
            isOneToOne: false
            referencedRelation: "occupation_groups"
            referencedColumns: ["group_id"]
          },
        ]
      }
      organiser_patch_assignments: {
        Row: {
          assignment_id: number
          entity_id: number
          entity_type: string
          patch_id: number
        }
        Insert: {
          assignment_id?: number
          entity_id: number
          entity_type: string
          patch_id: number
        }
        Update: {
          assignment_id?: number
          entity_id?: number
          entity_type?: string
          patch_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "organiser_patch_assignments_patch_id_fkey"
            columns: ["patch_id"]
            isOneToOne: false
            referencedRelation: "organiser_patches"
            referencedColumns: ["patch_id"]
          },
        ]
      }
      organiser_patches: {
        Row: {
          description: string | null
          organiser_id: number
          patch_id: number
          patch_name: string
        }
        Insert: {
          description?: string | null
          organiser_id: number
          patch_id?: number
          patch_name: string
        }
        Update: {
          description?: string | null
          organiser_id?: number
          patch_id?: number
          patch_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "organiser_patches_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
        ]
      }
      organisers: {
        Row: {
          email: string | null
          is_active: boolean
          organiser_id: number
          organiser_name: string
          phone: string | null
        }
        Insert: {
          email?: string | null
          is_active?: boolean
          organiser_id?: number
          organiser_name: string
          phone?: string | null
        }
        Update: {
          email?: string | null
          is_active?: boolean
          organiser_id?: number
          organiser_name?: string
          phone?: string | null
        }
        Relationships: []
      }
      pabo_applications: {
        Row: {
          aec_ballot_agent: string | null
          application_filed_at: string | null
          ballot_closes_at: string | null
          ballot_opens_at: string | null
          ballot_order_made_at: string | null
          campaign_id: number
          created_at: string
          created_by: string | null
          eligible_voter_count: number | null
          fwc_application_number: string | null
          notes: string | null
          notice_period_required_days: number | null
          pabo_id: number
          status: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          voter_turnout_pct: number | null
          votes_cast: number | null
        }
        Insert: {
          aec_ballot_agent?: string | null
          application_filed_at?: string | null
          ballot_closes_at?: string | null
          ballot_opens_at?: string | null
          ballot_order_made_at?: string | null
          campaign_id: number
          created_at?: string
          created_by?: string | null
          eligible_voter_count?: number | null
          fwc_application_number?: string | null
          notes?: string | null
          notice_period_required_days?: number | null
          pabo_id?: number
          status?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          voter_turnout_pct?: number | null
          votes_cast?: number | null
        }
        Update: {
          aec_ballot_agent?: string | null
          application_filed_at?: string | null
          ballot_closes_at?: string | null
          ballot_opens_at?: string | null
          ballot_order_made_at?: string | null
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          eligible_voter_count?: number | null
          fwc_application_number?: string | null
          notes?: string | null
          notice_period_required_days?: number | null
          pabo_id?: number
          status?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          voter_turnout_pct?: number | null
          votes_cast?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pabo_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      pabo_ballot_questions: {
        Row: {
          action_type: string | null
          informal_count: number | null
          outcome: string | null
          pabo_id: number
          question_id: number
          question_order: number
          question_text: string
          votes_no: number | null
          votes_yes: number | null
        }
        Insert: {
          action_type?: string | null
          informal_count?: number | null
          outcome?: string | null
          pabo_id: number
          question_id?: number
          question_order: number
          question_text: string
          votes_no?: number | null
          votes_yes?: number | null
        }
        Update: {
          action_type?: string | null
          informal_count?: number | null
          outcome?: string | null
          pabo_id?: number
          question_id?: number
          question_order?: number
          question_text?: string
          votes_no?: number | null
          votes_yes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pabo_ballot_questions_pabo_id_fkey"
            columns: ["pabo_id"]
            isOneToOne: false
            referencedRelation: "pabo_applications"
            referencedColumns: ["pabo_id"]
          },
        ]
      }
      participation_import_batches: {
        Row: {
          activity_id: number
          an_resource_id: string | null
          an_resource_type: string | null
          batch_id: number
          campaign_id: number
          created_at: string
          created_by: string | null
          file_name: string | null
          mapping: Json | null
          rows_created: number
          rows_matched: number
          rows_skipped: number
          rows_total: number
          rows_updated: number
          source_kind: string
          workers_created: number
        }
        Insert: {
          activity_id: number
          an_resource_id?: string | null
          an_resource_type?: string | null
          batch_id?: number
          campaign_id: number
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          mapping?: Json | null
          rows_created?: number
          rows_matched?: number
          rows_skipped?: number
          rows_total?: number
          rows_updated?: number
          source_kind: string
          workers_created?: number
        }
        Update: {
          activity_id?: number
          an_resource_id?: string | null
          an_resource_type?: string | null
          batch_id?: number
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          mapping?: Json | null
          rows_created?: number
          rows_matched?: number
          rows_skipped?: number
          rows_total?: number
          rows_updated?: number
          source_kind?: string
          workers_created?: number
        }
        Relationships: [
          {
            foreignKeyName: "participation_import_batches_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "participation_import_batches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      petition_signatures: {
        Row: {
          activity_id: number
          campaign_id: number | null
          created_at: string
          created_by: string | null
          id: number
          notes: string | null
          signature_data: Json | null
          signed_at: string
          source: string
          worker_id: number
        }
        Insert: {
          activity_id: number
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          id?: number
          notes?: string | null
          signature_data?: Json | null
          signed_at?: string
          source?: string
          worker_id: number
        }
        Update: {
          activity_id?: number
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          id?: number
          notes?: string | null
          signature_data?: Json | null
          signed_at?: string
          source?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "petition_signatures_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "petition_signatures_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "petition_signatures_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "petition_signatures_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      phone_call_action_lists: {
        Row: {
          action_id: number
          linked_at: string
          list_id: number
          position: number
        }
        Insert: {
          action_id: number
          linked_at?: string
          list_id: number
          position?: number
        }
        Update: {
          action_id?: number
          linked_at?: string
          list_id?: number
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "phone_call_action_lists_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "phone_call_actions"
            referencedColumns: ["action_id"]
          },
          {
            foreignKeyName: "phone_call_action_lists_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "phone_call_action_lists_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "phone_call_action_lists_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_section_funnel"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "phone_call_action_lists_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["list_id"]
          },
        ]
      }
      phone_call_action_reports: {
        Row: {
          action_id: number
          generated_at: string
          generated_by: string | null
          report_id: number
          snapshot: Json
        }
        Insert: {
          action_id: number
          generated_at?: string
          generated_by?: string | null
          report_id?: number
          snapshot: Json
        }
        Update: {
          action_id?: number
          generated_at?: string
          generated_by?: string | null
          report_id?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "phone_call_action_reports_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: true
            referencedRelation: "phone_call_actions"
            referencedColumns: ["action_id"]
          },
        ]
      }
      phone_call_actions: {
        Row: {
          action_id: number
          assessment_id: number | null
          campaign_id: number
          created_at: string
          created_by: string | null
          entry_branch: string
          list_ids: number[] | null
          script_id: number | null
          selected_assessment_ids: number[]
          status: string
          updated_at: string
          variation_count: number
          variation_dimension: string | null
        }
        Insert: {
          action_id?: number
          assessment_id?: number | null
          campaign_id: number
          created_at?: string
          created_by?: string | null
          entry_branch: string
          list_ids?: number[] | null
          script_id?: number | null
          selected_assessment_ids?: number[]
          status?: string
          updated_at?: string
          variation_count?: number
          variation_dimension?: string | null
        }
        Update: {
          action_id?: number
          assessment_id?: number | null
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          entry_branch?: string
          list_ids?: number[] | null
          script_id?: number | null
          selected_assessment_ids?: number[]
          status?: string
          updated_at?: string
          variation_count?: number
          variation_dimension?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "phone_call_actions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "phone_call_actions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["script_id"]
          },
        ]
      }
      pia_actions: {
        Row: {
          action_ends_at: string | null
          action_id: number
          action_starts_at: string | null
          action_type: string
          campaign_id: number
          concluded_at: string | null
          created_at: string
          created_by: string | null
          escalation_level: number
          is_concluded: boolean
          notes: string | null
          notice_given_at: string | null
          outcome_summary: Json | null
          pabo_id: number | null
          pabo_question_id: number | null
          participation_target_count: number | null
          target_population_definition: Json | null
          updated_at: string
        }
        Insert: {
          action_ends_at?: string | null
          action_id?: number
          action_starts_at?: string | null
          action_type: string
          campaign_id: number
          concluded_at?: string | null
          created_at?: string
          created_by?: string | null
          escalation_level?: number
          is_concluded?: boolean
          notes?: string | null
          notice_given_at?: string | null
          outcome_summary?: Json | null
          pabo_id?: number | null
          pabo_question_id?: number | null
          participation_target_count?: number | null
          target_population_definition?: Json | null
          updated_at?: string
        }
        Update: {
          action_ends_at?: string | null
          action_id?: number
          action_starts_at?: string | null
          action_type?: string
          campaign_id?: number
          concluded_at?: string | null
          created_at?: string
          created_by?: string | null
          escalation_level?: number
          is_concluded?: boolean
          notes?: string | null
          notice_given_at?: string | null
          outcome_summary?: Json | null
          pabo_id?: number | null
          pabo_question_id?: number | null
          participation_target_count?: number | null
          target_population_definition?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_pabo_id_fkey"
            columns: ["pabo_id"]
            isOneToOne: false
            referencedRelation: "pabo_applications"
            referencedColumns: ["pabo_id"]
          },
          {
            foreignKeyName: "pia_actions_pabo_question_id_fkey"
            columns: ["pabo_question_id"]
            isOneToOne: false
            referencedRelation: "pabo_ballot_questions"
            referencedColumns: ["question_id"]
          },
        ]
      }
      pia_seed_packs: {
        Row: {
          action_types: string[]
          description: string | null
          label: string
          pack_key: string
        }
        Insert: {
          action_types: string[]
          description?: string | null
          label: string
          pack_key: string
        }
        Update: {
          action_types?: string[]
          description?: string | null
          label?: string
          pack_key?: string
        }
        Relationships: []
      }
      plan_ambitions: {
        Row: {
          achieved_date: string | null
          ambition_id: number
          ambition_option_id: number | null
          ambition_scope: string
          created_at: string | null
          current_value: string | null
          current_value_overridden: boolean
          current_value_override_reason: string | null
          custom_text: string | null
          evidence_notes: string | null
          is_achieved: boolean | null
          is_hard_gate: boolean
          is_system_default: boolean
          metric_type: string | null
          parent_campaign_ambition_id: number | null
          plan_id: number | null
          section_plan_id: number | null
          sort_order: number | null
          target_date: string | null
          target_date_user_overridden: boolean
          target_unit: string | null
          target_value: string | null
          target_value_max: string | null
        }
        Insert: {
          achieved_date?: string | null
          ambition_id?: number
          ambition_option_id?: number | null
          ambition_scope?: string
          created_at?: string | null
          current_value?: string | null
          current_value_overridden?: boolean
          current_value_override_reason?: string | null
          custom_text?: string | null
          evidence_notes?: string | null
          is_achieved?: boolean | null
          is_hard_gate?: boolean
          is_system_default?: boolean
          metric_type?: string | null
          parent_campaign_ambition_id?: number | null
          plan_id?: number | null
          section_plan_id?: number | null
          sort_order?: number | null
          target_date?: string | null
          target_date_user_overridden?: boolean
          target_unit?: string | null
          target_value?: string | null
          target_value_max?: string | null
        }
        Update: {
          achieved_date?: string | null
          ambition_id?: number
          ambition_option_id?: number | null
          ambition_scope?: string
          created_at?: string | null
          current_value?: string | null
          current_value_overridden?: boolean
          current_value_override_reason?: string | null
          custom_text?: string | null
          evidence_notes?: string | null
          is_achieved?: boolean | null
          is_hard_gate?: boolean
          is_system_default?: boolean
          metric_type?: string | null
          parent_campaign_ambition_id?: number | null
          plan_id?: number | null
          section_plan_id?: number | null
          sort_order?: number | null
          target_date?: string | null
          target_date_user_overridden?: boolean
          target_unit?: string | null
          target_value?: string | null
          target_value_max?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_ambitions_ambition_option_id_fkey"
            columns: ["ambition_option_id"]
            isOneToOne: false
            referencedRelation: "ambition_options"
            referencedColumns: ["option_id"]
          },
          {
            foreignKeyName: "plan_ambitions_parent_campaign_ambition_id_fkey"
            columns: ["parent_campaign_ambition_id"]
            isOneToOne: false
            referencedRelation: "campaign_ambition_progress"
            referencedColumns: ["campaign_ambition_id"]
          },
          {
            foreignKeyName: "plan_ambitions_parent_campaign_ambition_id_fkey"
            columns: ["parent_campaign_ambition_id"]
            isOneToOne: false
            referencedRelation: "campaign_ambitions"
            referencedColumns: ["campaign_ambition_id"]
          },
          {
            foreignKeyName: "plan_ambitions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_stage_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_ambitions_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_ambitions_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_ambitions_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_ambitions_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      plan_capacities: {
        Row: {
          assigned_to: number | null
          capacity_id: number
          capacity_option_id: number | null
          created_at: string | null
          custom_text: string | null
          gap_description: string | null
          linked_ambition_id: number | null
          plan_id: number | null
          resolution_date: string | null
          resolution_plan: string | null
          section_plan_id: number | null
          sort_order: number | null
          status: string
        }
        Insert: {
          assigned_to?: number | null
          capacity_id?: number
          capacity_option_id?: number | null
          created_at?: string | null
          custom_text?: string | null
          gap_description?: string | null
          linked_ambition_id?: number | null
          plan_id?: number | null
          resolution_date?: string | null
          resolution_plan?: string | null
          section_plan_id?: number | null
          sort_order?: number | null
          status?: string
        }
        Update: {
          assigned_to?: number | null
          capacity_id?: number
          capacity_option_id?: number | null
          created_at?: string | null
          custom_text?: string | null
          gap_description?: string | null
          linked_ambition_id?: number | null
          plan_id?: number | null
          resolution_date?: string | null
          resolution_plan?: string | null
          section_plan_id?: number | null
          sort_order?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_capacities_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "plan_capacities_capacity_option_id_fkey"
            columns: ["capacity_option_id"]
            isOneToOne: false
            referencedRelation: "capacity_options"
            referencedColumns: ["option_id"]
          },
          {
            foreignKeyName: "plan_capacities_linked_ambition_id_fkey"
            columns: ["linked_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_capacities_linked_ambition_id_fkey"
            columns: ["linked_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_capacities_linked_ambition_id_fkey"
            columns: ["linked_ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_capacities_linked_ambition_id_fkey"
            columns: ["linked_ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
          {
            foreignKeyName: "plan_capacities_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_stage_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_capacities_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_capacities_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_capacities_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_capacities_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      plan_management_systems: {
        Row: {
          created_at: string | null
          custom_text: string | null
          description: string | null
          frequency: string | null
          metrics: Json | null
          plan_id: number
          responsible_organiser_id: number | null
          sort_order: number | null
          system_id: number
          system_option_id: number | null
        }
        Insert: {
          created_at?: string | null
          custom_text?: string | null
          description?: string | null
          frequency?: string | null
          metrics?: Json | null
          plan_id: number
          responsible_organiser_id?: number | null
          sort_order?: number | null
          system_id?: number
          system_option_id?: number | null
        }
        Update: {
          created_at?: string | null
          custom_text?: string | null
          description?: string | null
          frequency?: string | null
          metrics?: Json | null
          plan_id?: number
          responsible_organiser_id?: number | null
          sort_order?: number | null
          system_id?: number
          system_option_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_management_systems_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_stage_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_management_systems_responsible_organiser_id_fkey"
            columns: ["responsible_organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "plan_management_systems_system_option_id_fkey"
            columns: ["system_option_id"]
            isOneToOne: false
            referencedRelation: "management_system_options"
            referencedColumns: ["option_id"]
          },
        ]
      }
      plan_revision_notes: {
        Row: {
          campaign_id: number
          notes: string
          revised_at: string
          revised_by: string | null
          revision_id: number
          revision_type: string
          stage_number_affected: number
          triggers_downstream_shift: boolean
        }
        Insert: {
          campaign_id: number
          notes: string
          revised_at?: string
          revised_by?: string | null
          revision_id?: number
          revision_type: string
          stage_number_affected: number
          triggers_downstream_shift?: boolean
        }
        Update: {
          campaign_id?: number
          notes?: string
          revised_at?: string
          revised_by?: string | null
          revision_id?: number
          revision_type?: string
          stage_number_affected?: number
          triggers_downstream_shift?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "plan_revision_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      plan_theory_of_winning: {
        Row: {
          ai_generated: boolean | null
          ai_model: string | null
          ai_prompt_snapshot: Json | null
          contingency_plan: string | null
          created_at: string | null
          critical_dependency: string | null
          employer_response_plan: string | null
          gap_analysis: Json | null
          if_then_statement: string
          is_current: boolean | null
          member_agency_assessment: string | null
          plan_id: number | null
          risk_assessment: Json | null
          section_plan_id: number | null
          theory_id: number
          updated_at: string | null
          version: number | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_model?: string | null
          ai_prompt_snapshot?: Json | null
          contingency_plan?: string | null
          created_at?: string | null
          critical_dependency?: string | null
          employer_response_plan?: string | null
          gap_analysis?: Json | null
          if_then_statement: string
          is_current?: boolean | null
          member_agency_assessment?: string | null
          plan_id?: number | null
          risk_assessment?: Json | null
          section_plan_id?: number | null
          theory_id?: number
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_model?: string | null
          ai_prompt_snapshot?: Json | null
          contingency_plan?: string | null
          created_at?: string | null
          critical_dependency?: string | null
          employer_response_plan?: string | null
          gap_analysis?: Json | null
          if_then_statement?: string
          is_current?: boolean | null
          member_agency_assessment?: string | null
          plan_id?: number | null
          risk_assessment?: Json | null
          section_plan_id?: number | null
          theory_id?: number
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_theory_of_winning_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_stage_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_theory_of_winning_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_theory_of_winning_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_theory_of_winning_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_theory_of_winning_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      plan_where_to_play: {
        Row: {
          created_at: string | null
          custom_text: string | null
          is_exclusion: boolean | null
          linked_ambition_id: number | null
          plan_id: number | null
          priority: number | null
          rationale: string | null
          section_plan_id: number | null
          sort_order: number | null
          wtp_category_id: number
          wtp_id: number
          wtp_option_id: number | null
        }
        Insert: {
          created_at?: string | null
          custom_text?: string | null
          is_exclusion?: boolean | null
          linked_ambition_id?: number | null
          plan_id?: number | null
          priority?: number | null
          rationale?: string | null
          section_plan_id?: number | null
          sort_order?: number | null
          wtp_category_id: number
          wtp_id?: number
          wtp_option_id?: number | null
        }
        Update: {
          created_at?: string | null
          custom_text?: string | null
          is_exclusion?: boolean | null
          linked_ambition_id?: number | null
          plan_id?: number | null
          priority?: number | null
          rationale?: string | null
          section_plan_id?: number | null
          sort_order?: number | null
          wtp_category_id?: number
          wtp_id?: number
          wtp_option_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_where_to_play_linked_ambition_id_fkey"
            columns: ["linked_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_where_to_play_linked_ambition_id_fkey"
            columns: ["linked_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_where_to_play_linked_ambition_id_fkey"
            columns: ["linked_ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_where_to_play_linked_ambition_id_fkey"
            columns: ["linked_ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
          {
            foreignKeyName: "plan_where_to_play_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_stage_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_where_to_play_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_where_to_play_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_where_to_play_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_where_to_play_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_where_to_play_wtp_category_id_fkey"
            columns: ["wtp_category_id"]
            isOneToOne: false
            referencedRelation: "wtp_categories"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "plan_where_to_play_wtp_option_id_fkey"
            columns: ["wtp_option_id"]
            isOneToOne: false
            referencedRelation: "wtp_options"
            referencedColumns: ["option_id"]
          },
        ]
      }
      plan_wtp_ambitions: {
        Row: {
          ambition_id: number
          created_at: string
          wtp_ambition_id: number
          wtp_id: number
        }
        Insert: {
          ambition_id: number
          created_at?: string
          wtp_ambition_id?: number
          wtp_id: number
        }
        Update: {
          ambition_id?: number
          created_at?: string
          wtp_ambition_id?: number
          wtp_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_wtp_ambitions_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_wtp_ambitions_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_wtp_ambitions_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_wtp_ambitions_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
          {
            foreignKeyName: "plan_wtp_ambitions_wtp_id_fkey"
            columns: ["wtp_id"]
            isOneToOne: false
            referencedRelation: "plan_where_to_play"
            referencedColumns: ["wtp_id"]
          },
        ]
      }
      plan_wtp_section_ambitions: {
        Row: {
          ambition_id: number
          created_at: string
          section_ambition_id: number
          section_plan_id: number
          wtp_category_id: number
        }
        Insert: {
          ambition_id: number
          created_at?: string
          section_ambition_id?: number
          section_plan_id: number
          wtp_category_id: number
        }
        Update: {
          ambition_id?: number
          created_at?: string
          section_ambition_id?: number
          section_plan_id?: number
          wtp_category_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_wtp_section_ambitions_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_wtp_section_ambitions_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_wtp_section_ambitions_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "plan_wtp_section_ambitions_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
          {
            foreignKeyName: "plan_wtp_section_ambitions_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_wtp_section_ambitions_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_wtp_section_ambitions_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_wtp_section_ambitions_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "plan_wtp_section_ambitions_wtp_category_id_fkey"
            columns: ["wtp_category_id"]
            isOneToOne: false
            referencedRelation: "wtp_categories"
            referencedColumns: ["category_id"]
          },
        ]
      }
      program_worksites: {
        Row: {
          end_date: string | null
          id: number
          is_current: boolean
          is_primary: boolean
          notes: string | null
          program_id: number
          start_date: string | null
          worksite_id: number
        }
        Insert: {
          end_date?: string | null
          id?: number
          is_current?: boolean
          is_primary?: boolean
          notes?: string | null
          program_id: number
          start_date?: string | null
          worksite_id: number
        }
        Update: {
          end_date?: string | null
          id?: number
          is_current?: boolean
          is_primary?: boolean
          notes?: string | null
          program_id?: number
          start_date?: string | null
          worksite_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_worksites_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "program_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "program_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "program_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "program_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "program_worksites_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      programs: {
        Row: {
          actual_end_date: string | null
          created_at: string
          description: string | null
          expected_end_date: string | null
          is_active: boolean
          notes: string | null
          principal_employer_id: number | null
          program_id: number
          program_name: string
          program_status: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          created_at?: string
          description?: string | null
          expected_end_date?: string | null
          is_active?: boolean
          notes?: string | null
          principal_employer_id?: number | null
          program_id?: number
          program_name: string
          program_status?: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          created_at?: string
          description?: string | null
          expected_end_date?: string | null
          is_active?: boolean
          notes?: string | null
          principal_employer_id?: number | null
          program_id?: number
          program_name?: string
          program_status?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "programs_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "programs_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      project_agreements: {
        Row: {
          agreement_id: number
          id: number
          notes: string | null
          project_id: number
        }
        Insert: {
          agreement_id: number
          id?: number
          notes?: string | null
          project_id: number
        }
        Update: {
          agreement_id?: number
          id?: number
          notes?: string | null
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_agreements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "project_agreements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "project_agreements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "project_agreements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_agreements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_employers: {
        Row: {
          employer_id: number
          end_date: string | null
          id: number
          is_current: boolean
          project_id: number
          role_type: string | null
          start_date: string | null
        }
        Insert: {
          employer_id: number
          end_date?: string | null
          id?: number
          is_current?: boolean
          project_id: number
          role_type?: string | null
          start_date?: string | null
        }
        Update: {
          employer_id?: number
          end_date?: string | null
          id?: number
          is_current?: boolean
          project_id?: number
          role_type?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "project_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "project_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "project_employers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "project_employers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
        ]
      }
      projects: {
        Row: {
          absorbed_into_project_id: number | null
          actual_end_date: string | null
          created_at: string
          expected_end_date: string | null
          is_active: boolean
          notes: string | null
          project_id: number
          project_name: string
          project_status: string
          start_date: string | null
          updated_at: string
          work_type: string
          worksite_id: number
        }
        Insert: {
          absorbed_into_project_id?: number | null
          actual_end_date?: string | null
          created_at?: string
          expected_end_date?: string | null
          is_active?: boolean
          notes?: string | null
          project_id?: number
          project_name: string
          project_status?: string
          start_date?: string | null
          updated_at?: string
          work_type: string
          worksite_id: number
        }
        Update: {
          absorbed_into_project_id?: number | null
          actual_end_date?: string | null
          created_at?: string
          expected_end_date?: string | null
          is_active?: boolean
          notes?: string | null
          project_id?: number
          project_name?: string
          project_status?: string
          start_date?: string | null
          updated_at?: string
          work_type?: string
          worksite_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "projects_absorbed_into_project_id_fkey"
            columns: ["absorbed_into_project_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "projects_absorbed_into_project_id_fkey"
            columns: ["absorbed_into_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "projects_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "projects_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "projects_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "projects_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "projects_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      rate_limit_config: {
        Row: {
          burst_allowance: number | null
          config_id: number
          configured_at: string | null
          configured_by: string | null
          cost_per_request: number | null
          is_exempt: boolean | null
          notes: string | null
          requests_per_day: number | null
          requests_per_hour: number | null
          requests_per_minute: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          burst_allowance?: number | null
          config_id?: number
          configured_at?: string | null
          configured_by?: string | null
          cost_per_request?: number | null
          is_exempt?: boolean | null
          notes?: string | null
          requests_per_day?: number | null
          requests_per_hour?: number | null
          requests_per_minute?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          burst_allowance?: number | null
          config_id?: number
          configured_at?: string | null
          configured_by?: string | null
          cost_per_request?: number | null
          is_exempt?: boolean | null
          notes?: string | null
          requests_per_day?: number | null
          requests_per_hour?: number | null
          requests_per_minute?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_usage: {
        Row: {
          endpoint: string
          estimated_cost: number | null
          ip_address: unknown
          method: string
          request_path: string | null
          requested_at: string | null
          status_code: number | null
          usage_id: number
          user_agent: string | null
          user_id: string
        }
        Insert: {
          endpoint: string
          estimated_cost?: number | null
          ip_address?: unknown
          method: string
          request_path?: string | null
          requested_at?: string | null
          status_code?: number | null
          usage_id?: number
          user_agent?: string | null
          user_id: string
        }
        Update: {
          endpoint?: string
          estimated_cost?: number | null
          ip_address?: unknown
          method?: string
          request_path?: string | null
          requested_at?: string | null
          status_code?: number | null
          usage_id?: number
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rating_level: {
        Row: {
          code: string
          colour_token: string
          created_at: string
          description: string | null
          is_supportive: boolean
          label: string
          short_label: string
          sort_order: number
          tailwind_bg_class: string
          value: number
        }
        Insert: {
          code: string
          colour_token: string
          created_at?: string
          description?: string | null
          is_supportive?: boolean
          label: string
          short_label: string
          sort_order: number
          tailwind_bg_class: string
          value: number
        }
        Update: {
          code?: string
          colour_token?: string
          created_at?: string
          description?: string | null
          is_supportive?: boolean
          label?: string
          short_label?: string
          sort_order?: number
          tailwind_bg_class?: string
          value?: number
        }
        Relationships: []
      }
      reporting_snapshots: {
        Row: {
          campaign_id: number
          created_at: string | null
          created_by: string | null
          data: Json
          snapshot_date: string
          snapshot_id: number
          snapshot_type: string
        }
        Insert: {
          campaign_id: number
          created_at?: string | null
          created_by?: string | null
          data: Json
          snapshot_date?: string
          snapshot_id?: number
          snapshot_type?: string
        }
        Update: {
          campaign_id?: number
          created_at?: string | null
          created_by?: string | null
          data?: Json
          snapshot_date?: string
          snapshot_id?: number
          snapshot_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "reporting_snapshots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      section_plan_ai_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: number
          model: string | null
          prompt_snapshot: Json | null
          response_snapshot: Json | null
          section_plan_id: number
          surface: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id?: number
          model?: string | null
          prompt_snapshot?: Json | null
          response_snapshot?: Json | null
          section_plan_id: number
          surface: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: number
          model?: string | null
          prompt_snapshot?: Json | null
          response_snapshot?: Json | null
          section_plan_id?: number
          surface?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_plan_ai_events_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_ai_events_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_ai_events_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_ai_events_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      section_plan_revision_notes: {
        Row: {
          change_summary: string
          revised_at: string
          revised_by: string | null
          revision_id: number
          section_plan_id: number
          subject_id: number | null
          subject_kind: string
        }
        Insert: {
          change_summary: string
          revised_at?: string
          revised_by?: string | null
          revision_id?: number
          section_plan_id: number
          subject_id?: number | null
          subject_kind: string
        }
        Update: {
          change_summary?: string
          revised_at?: string
          revised_by?: string | null
          revision_id?: number
          section_plan_id?: number
          subject_id?: number | null
          subject_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_plan_revision_notes_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_revision_notes_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_revision_notes_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_revision_notes_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      section_plan_situation_snippets: {
        Row: {
          agreement_expiry_override: string | null
          ai_generated: boolean
          created_at: string
          derived_from_campaign_situation: boolean
          key_event: string | null
          notes: string | null
          section_plan_id: number
          snippet_id: number
          status_summary: string | null
          strategic_context: string | null
          updated_at: string
          workforce_summary: string | null
        }
        Insert: {
          agreement_expiry_override?: string | null
          ai_generated?: boolean
          created_at?: string
          derived_from_campaign_situation?: boolean
          key_event?: string | null
          notes?: string | null
          section_plan_id: number
          snippet_id?: number
          status_summary?: string | null
          strategic_context?: string | null
          updated_at?: string
          workforce_summary?: string | null
        }
        Update: {
          agreement_expiry_override?: string | null
          ai_generated?: boolean
          created_at?: string
          derived_from_campaign_situation?: boolean
          key_event?: string | null
          notes?: string | null
          section_plan_id?: number
          snippet_id?: number
          status_summary?: string | null
          strategic_context?: string | null
          updated_at?: string
          workforce_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "section_plan_situation_snippets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: true
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_situation_snippets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: true
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_situation_snippets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: true
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_situation_snippets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: true
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      section_plan_soc_recordings: {
        Row: {
          activity_event_id: number | null
          member_status_confirmed: string | null
          no_vote_rating: number | null
          notes: string | null
          pabo_rating: number | null
          recorded_at: string
          recorded_by: string | null
          recording_id: number
          soc_id: number
          worker_id: number
        }
        Insert: {
          activity_event_id?: number | null
          member_status_confirmed?: string | null
          no_vote_rating?: number | null
          notes?: string | null
          pabo_rating?: number | null
          recorded_at?: string
          recorded_by?: string | null
          recording_id?: number
          soc_id: number
          worker_id: number
        }
        Update: {
          activity_event_id?: number | null
          member_status_confirmed?: string | null
          no_vote_rating?: number | null
          notes?: string | null
          pabo_rating?: number | null
          recorded_at?: string
          recorded_by?: string | null
          recording_id?: number
          soc_id?: number
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_plan_soc_recordings_activity_event_id_fkey"
            columns: ["activity_event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "section_plan_soc_recordings_soc_id_fkey"
            columns: ["soc_id"]
            isOneToOne: false
            referencedRelation: "section_plan_socs"
            referencedColumns: ["soc_id"]
          },
          {
            foreignKeyName: "section_plan_soc_recordings_soc_id_fkey"
            columns: ["soc_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["soc_id"]
          },
          {
            foreignKeyName: "section_plan_soc_recordings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "section_plan_soc_recordings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "section_plan_soc_recordings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      section_plan_socs: {
        Row: {
          ai_generated: boolean
          ai_model: string | null
          ai_prompt_snapshot: Json | null
          created_at: string
          industrial_in_scope: boolean
          name: string
          pabo_in_scope: boolean
          section_plan_id: number
          soc_id: number
          soc_kind: Database["public"]["Enums"]["section_plan_soc_kind"]
          step_1_introduction: string | null
          step_2_agitation_or_briefing: string | null
          step_3_hope_or_walkthrough: string | null
          step_4_call_to_action_or_hope: string | null
          step_5_mapping_or_clear_ask: string | null
          step_6_industrial_or_pabo: string | null
          step_7_inoculation_or_close: string | null
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          ai_model?: string | null
          ai_prompt_snapshot?: Json | null
          created_at?: string
          industrial_in_scope?: boolean
          name: string
          pabo_in_scope?: boolean
          section_plan_id: number
          soc_id?: number
          soc_kind: Database["public"]["Enums"]["section_plan_soc_kind"]
          step_1_introduction?: string | null
          step_2_agitation_or_briefing?: string | null
          step_3_hope_or_walkthrough?: string | null
          step_4_call_to_action_or_hope?: string | null
          step_5_mapping_or_clear_ask?: string | null
          step_6_industrial_or_pabo?: string | null
          step_7_inoculation_or_close?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          ai_model?: string | null
          ai_prompt_snapshot?: Json | null
          created_at?: string
          industrial_in_scope?: boolean
          name?: string
          pabo_in_scope?: boolean
          section_plan_id?: number
          soc_id?: number
          soc_kind?: Database["public"]["Enums"]["section_plan_soc_kind"]
          step_1_introduction?: string | null
          step_2_agitation_or_briefing?: string | null
          step_3_hope_or_walkthrough?: string | null
          step_4_call_to_action_or_hope?: string | null
          step_5_mapping_or_clear_ask?: string | null
          step_6_industrial_or_pabo?: string | null
          step_7_inoculation_or_close?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_plan_socs_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_socs_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_socs_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_socs_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      section_plan_stage_mappings: {
        Row: {
          confidence: number | null
          created_at: string
          human_confirmed: boolean
          mapping_id: number
          model: string | null
          prompt_snapshot: Json | null
          rationale: string | null
          section_plan_id: number
          stage_number: number
          subject_id: number
          subject_kind: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          human_confirmed?: boolean
          mapping_id?: number
          model?: string | null
          prompt_snapshot?: Json | null
          rationale?: string | null
          section_plan_id: number
          stage_number: number
          subject_id: number
          subject_kind: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          human_confirmed?: boolean
          mapping_id?: number
          model?: string | null
          prompt_snapshot?: Json | null
          rationale?: string | null
          section_plan_id?: number
          stage_number?: number
          subject_id?: number
          subject_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_plan_stage_mappings_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_stage_mappings_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_stage_mappings_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_stage_mappings_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      section_plan_workforce_mapping_overrides: {
        Row: {
          created_at: string
          density_override: number | null
          members_override: number | null
          note: string | null
          override_id: number
          section_plan_id: number
          updated_at: string
          workers_override: number | null
          worksite_ou_id: number
        }
        Insert: {
          created_at?: string
          density_override?: number | null
          members_override?: number | null
          note?: string | null
          override_id?: number
          section_plan_id: number
          updated_at?: string
          workers_override?: number | null
          worksite_ou_id: number
        }
        Update: {
          created_at?: string
          density_override?: number | null
          members_override?: number | null
          note?: string | null
          override_id?: number
          section_plan_id?: number
          updated_at?: string
          workers_override?: number | null
          worksite_ou_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_plan_workforce_mapping_overrides_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_workforce_mapping_overrides_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_workforce_mapping_overrides_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_workforce_mapping_overrides_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_workforce_mapping_overrides_worksite_ou_id_fkey"
            columns: ["worksite_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "section_plan_workforce_mapping_overrides_worksite_ou_id_fkey"
            columns: ["worksite_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "section_plan_workforce_mapping_overrides_worksite_ou_id_fkey"
            columns: ["worksite_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "section_plan_workforce_mapping_overrides_worksite_ou_id_fkey"
            columns: ["worksite_ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "section_plan_workforce_mapping_overrides_worksite_ou_id_fkey"
            columns: ["worksite_ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
        ]
      }
      section_plan_workplan_targets: {
        Row: {
          activity_id: number | null
          activity_label: string | null
          calls_target: number | null
          created_at: string
          day_of_week: number
          notes: string | null
          section_plan_id: number
          target_date: string
          target_id: number
          updated_at: string
        }
        Insert: {
          activity_id?: number | null
          activity_label?: string | null
          calls_target?: number | null
          created_at?: string
          day_of_week: number
          notes?: string | null
          section_plan_id: number
          target_date: string
          target_id?: number
          updated_at?: string
        }
        Update: {
          activity_id?: number | null
          activity_label?: string | null
          calls_target?: number | null
          created_at?: string
          day_of_week?: number
          notes?: string | null
          section_plan_id?: number
          target_date?: string
          target_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_plan_workplan_targets_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "section_plan_workplan_targets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_workplan_targets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_workplan_targets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_workplan_targets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      section_plans: {
        Row: {
          archived_at: string | null
          campaign_id: number
          created_at: string
          created_by: string | null
          end_date: string
          external_anchor_label: string | null
          name: string
          purpose: string | null
          section_plan_id: number
          start_date: string
          status: string
          timeframe_kind: Database["public"]["Enums"]["section_plan_timeframe_kind"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          campaign_id: number
          created_at?: string
          created_by?: string | null
          end_date: string
          external_anchor_label?: string | null
          name: string
          purpose?: string | null
          section_plan_id?: number
          start_date: string
          status?: string
          timeframe_kind?: Database["public"]["Enums"]["section_plan_timeframe_kind"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          end_date?: string
          external_anchor_label?: string | null
          name?: string
          purpose?: string | null
          section_plan_id?: number
          start_date?: string
          status?: string
          timeframe_kind?: Database["public"]["Enums"]["section_plan_timeframe_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      sectors: {
        Row: {
          description: string | null
          sector_id: number
          sector_name: string
        }
        Insert: {
          description?: string | null
          sector_id?: number
          sector_name: string
        }
        Update: {
          description?: string | null
          sector_id?: number
          sector_name?: string
        }
        Relationships: []
      }
      sms_ballot_events: {
        Row: {
          event_id: number
          event_type: string
          occurred_at: string
          payload: Json | null
          session_id: number | null
          survey_id: number
          worker_id: number | null
        }
        Insert: {
          event_id?: number
          event_type: string
          occurred_at?: string
          payload?: Json | null
          session_id?: number | null
          survey_id: number
          worker_id?: number | null
        }
        Update: {
          event_id?: number
          event_type?: string
          occurred_at?: string
          payload?: Json | null
          session_id?: number | null
          survey_id?: number
          worker_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_ballot_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sms_survey_sessions"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "sms_ballot_events_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "sms_surveys"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_ballot_events_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_ballot_tally"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_ballot_events_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_funnel"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_ballot_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_ballot_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_ballot_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      sms_ballot_roll: {
        Row: {
          included_at: string
          phone_e164: string
          roll_id: number
          source: string
          survey_id: number
          worker_id: number
        }
        Insert: {
          included_at?: string
          phone_e164: string
          roll_id?: number
          source?: string
          survey_id: number
          worker_id: number
        }
        Update: {
          included_at?: string
          phone_e164?: string
          roll_id?: number
          source?: string
          survey_id?: number
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_ballot_roll_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "sms_surveys"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_ballot_roll_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_ballot_tally"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_ballot_roll_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_funnel"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_ballot_roll_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_ballot_roll_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_ballot_roll_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      sms_canned_replies: {
        Row: {
          body: string
          campaign_id: number | null
          created_at: string
          created_by: string | null
          is_active: boolean
          outcome_value: string | null
          reply_id: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          outcome_value?: string | null
          reply_id?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          outcome_value?: string | null
          reply_id?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_canned_replies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      sms_conversation_notes: {
        Row: {
          author_user_id: string
          body: string
          conversation_id: number
          created_at: string
          note_id: number
        }
        Insert: {
          author_user_id: string
          body: string
          conversation_id: number
          created_at?: string
          note_id?: number
        }
        Update: {
          author_user_id?: string
          body?: string
          conversation_id?: number
          created_at?: string
          note_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["conversation_id"]
          },
        ]
      }
      sms_conversations: {
        Row: {
          activity_id: number | null
          assignee_user_id: string | null
          campaign_id: number | null
          claim_user_id: string | null
          claimed_until: string | null
          closed_at: string | null
          closed_by_user_id: string | null
          conversation_id: number
          created_at: string
          escalated_to_user_id: string | null
          last_inbound_at: string | null
          last_message_at: string | null
          last_outbound_at: string | null
          our_number_id: number
          phone_e164: string
          state: string
          unread_count: number
          updated_at: string
          worker_id: number | null
        }
        Insert: {
          activity_id?: number | null
          assignee_user_id?: string | null
          campaign_id?: number | null
          claim_user_id?: string | null
          claimed_until?: string | null
          closed_at?: string | null
          closed_by_user_id?: string | null
          conversation_id?: number
          created_at?: string
          escalated_to_user_id?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          our_number_id: number
          phone_e164: string
          state?: string
          unread_count?: number
          updated_at?: string
          worker_id?: number | null
        }
        Update: {
          activity_id?: number | null
          assignee_user_id?: string | null
          campaign_id?: number | null
          claim_user_id?: string | null
          claimed_until?: string | null
          closed_at?: string | null
          closed_by_user_id?: string | null
          conversation_id?: number
          created_at?: string
          escalated_to_user_id?: string | null
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_outbound_at?: string | null
          our_number_id?: number
          phone_e164?: string
          state?: string
          unread_count?: number
          updated_at?: string
          worker_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversations_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_our_number_id_fkey"
            columns: ["our_number_id"]
            isOneToOne: false
            referencedRelation: "sms_numbers"
            referencedColumns: ["number_id"]
          },
          {
            foreignKeyName: "sms_conversations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_conversations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_conversations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      sms_delivery_events: {
        Row: {
          event_id: number
          event_type: string
          occurred_at: string
          part_number: number
          payload: Json | null
          provider_message_id: string
        }
        Insert: {
          event_id?: number
          event_type: string
          occurred_at?: string
          part_number?: number
          payload?: Json | null
          provider_message_id: string
        }
        Update: {
          event_id?: number
          event_type?: string
          occurred_at?: string
          part_number?: number
          payload?: Json | null
          provider_message_id?: string
        }
        Relationships: []
      }
      sms_interactions: {
        Row: {
          activity_id: number | null
          body: string | null
          campaign_id: number | null
          created_at: string
          created_by: string | null
          cta_response: string | null
          direction: string
          external_message_id: string | null
          id: number
          maps_to_binary: string | null
          maps_to_rating: number | null
          notes: string | null
          phone_e164: string | null
          phone_number: string | null
          rating_origin: string | null
          received_at: string
          worker_id: number
        }
        Insert: {
          activity_id?: number | null
          body?: string | null
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          cta_response?: string | null
          direction: string
          external_message_id?: string | null
          id?: number
          maps_to_binary?: string | null
          maps_to_rating?: number | null
          notes?: string | null
          phone_e164?: string | null
          phone_number?: string | null
          rating_origin?: string | null
          received_at?: string
          worker_id: number
        }
        Update: {
          activity_id?: number | null
          body?: string | null
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          cta_response?: string | null
          direction?: string
          external_message_id?: string | null
          id?: number
          maps_to_binary?: string | null
          maps_to_rating?: number | null
          notes?: string | null
          phone_e164?: string | null
          phone_number?: string | null
          rating_origin?: string | null
          received_at?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_interactions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_interactions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_interactions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_interactions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      sms_list_items: {
        Row: {
          body_override: string | null
          claimed_at: string | null
          conversation_id: number | null
          created_at: string
          delivered_at: string | null
          failure_reason: string | null
          item_id: number
          list_id: number
          phone_e164: string | null
          provider_message_id: string | null
          send_before: string | null
          sent_at: string | null
          sort_order: number
          status: string
          updated_at: string
          worker_id: number
        }
        Insert: {
          body_override?: string | null
          claimed_at?: string | null
          conversation_id?: number | null
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          item_id?: number
          list_id: number
          phone_e164?: string | null
          provider_message_id?: string | null
          send_before?: string | null
          sent_at?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          worker_id: number
        }
        Update: {
          body_override?: string | null
          claimed_at?: string | null
          conversation_id?: number | null
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          item_id?: number
          list_id?: number
          phone_e164?: string | null
          provider_message_id?: string | null
          send_before?: string | null
          sent_at?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_list_items_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["conversation_id"]
          },
          {
            foreignKeyName: "sms_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "sms_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "sms_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "sms_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_chat_session_report"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "sms_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      sms_lists: {
        Row: {
          assessment_campaign_id: number | null
          blackout_override: boolean
          blackout_override_reason: string | null
          campaign_id: number
          created_at: string
          created_by: string | null
          delivered_items: number
          description: string | null
          draft_id: number | null
          failed_items: number
          list_id: number
          mode: string
          name: string
          scheduled_for: string | null
          selected_assessment_ids: number[]
          sender_number_id: number | null
          sent_items: number
          source_filters: Json | null
          status: string
          timezone: string
          total_items: number
          updated_at: string
        }
        Insert: {
          assessment_campaign_id?: number | null
          blackout_override?: boolean
          blackout_override_reason?: string | null
          campaign_id: number
          created_at?: string
          created_by?: string | null
          delivered_items?: number
          description?: string | null
          draft_id?: number | null
          failed_items?: number
          list_id?: number
          mode?: string
          name: string
          scheduled_for?: string | null
          selected_assessment_ids?: number[]
          sender_number_id?: number | null
          sent_items?: number
          source_filters?: Json | null
          status?: string
          timezone?: string
          total_items?: number
          updated_at?: string
        }
        Update: {
          assessment_campaign_id?: number | null
          blackout_override?: boolean
          blackout_override_reason?: string | null
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          delivered_items?: number
          description?: string | null
          draft_id?: number | null
          failed_items?: number
          list_id?: number
          mode?: string
          name?: string
          scheduled_for?: string | null
          selected_assessment_ids?: number[]
          sender_number_id?: number | null
          sent_items?: number
          source_filters?: Json | null
          status?: string
          timezone?: string
          total_items?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_assessment_campaign_id_fkey"
            columns: ["assessment_campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "campaign_comms_drafts"
            referencedColumns: ["draft_id"]
          },
          {
            foreignKeyName: "sms_lists_sender_number_id_fkey"
            columns: ["sender_number_id"]
            isOneToOne: false
            referencedRelation: "sms_numbers"
            referencedColumns: ["number_id"]
          },
        ]
      }
      sms_messages: {
        Row: {
          ai_assisted: boolean
          body: string | null
          conversation_id: number
          created_at: string
          direction: string
          error: string | null
          interaction_id: number | null
          message_id: number
          phone_e164: string | null
          provider_message_id: string | null
          reactions: Json
          segments: number | null
          sender_user_id: string | null
          status: string
        }
        Insert: {
          ai_assisted?: boolean
          body?: string | null
          conversation_id: number
          created_at?: string
          direction: string
          error?: string | null
          interaction_id?: number | null
          message_id?: number
          phone_e164?: string | null
          provider_message_id?: string | null
          reactions?: Json
          segments?: number | null
          sender_user_id?: string | null
          status?: string
        }
        Update: {
          ai_assisted?: boolean
          body?: string | null
          conversation_id?: number
          created_at?: string
          direction?: string
          error?: string | null
          interaction_id?: number | null
          message_id?: number
          phone_e164?: string | null
          provider_message_id?: string | null
          reactions?: Json
          segments?: number | null
          sender_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["conversation_id"]
          },
          {
            foreignKeyName: "sms_messages_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "sms_interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_number_assignments: {
        Row: {
          assigned_at: string
          assignment_id: number
          number_id: number
          organiser_id: number | null
          purpose: string
          unassigned_at: string | null
        }
        Insert: {
          assigned_at?: string
          assignment_id?: number
          number_id: number
          organiser_id?: number | null
          purpose: string
          unassigned_at?: string | null
        }
        Update: {
          assigned_at?: string
          assignment_id?: number
          number_id?: number
          organiser_id?: number | null
          purpose?: string
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_number_assignments_number_id_fkey"
            columns: ["number_id"]
            isOneToOne: false
            referencedRelation: "sms_numbers"
            referencedColumns: ["number_id"]
          },
          {
            foreignKeyName: "sms_number_assignments_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
        ]
      }
      sms_numbers: {
        Row: {
          created_at: string
          label: string | null
          notes: string | null
          number_id: number
          organiser_id: number | null
          phone_e164: string
          provider: string
          purpose: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          label?: string | null
          notes?: string | null
          number_id?: number
          organiser_id?: number | null
          phone_e164: string
          provider?: string
          purpose?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          label?: string | null
          notes?: string | null
          number_id?: number
          organiser_id?: number | null
          phone_e164?: string
          provider?: string
          purpose?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_numbers_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
        ]
      }
      sms_relay_messages: {
        Row: {
          body: string | null
          claimed_at: string | null
          created_at: string
          direction: string
          forward_provider_message_id: string | null
          forward_status: string
          forwarded_at: string | null
          forwarded_body: string | null
          member_phone_e164: string | null
          member_worker_id: number | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_status: string
          provider_message_id: string | null
          relay_id: number
          relay_message_id: number
          target_id: number | null
        }
        Insert: {
          body?: string | null
          claimed_at?: string | null
          created_at?: string
          direction: string
          forward_provider_message_id?: string | null
          forward_status?: string
          forwarded_at?: string | null
          forwarded_body?: string | null
          member_phone_e164?: string | null
          member_worker_id?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_status?: string
          provider_message_id?: string | null
          relay_id: number
          relay_message_id?: number
          target_id?: number | null
        }
        Update: {
          body?: string | null
          claimed_at?: string | null
          created_at?: string
          direction?: string
          forward_provider_message_id?: string | null
          forward_status?: string
          forwarded_at?: string | null
          forwarded_body?: string | null
          member_phone_e164?: string | null
          member_worker_id?: number | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_status?: string
          provider_message_id?: string | null
          relay_id?: number
          relay_message_id?: number
          target_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_relay_messages_member_worker_id_fkey"
            columns: ["member_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_relay_messages_member_worker_id_fkey"
            columns: ["member_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_relay_messages_member_worker_id_fkey"
            columns: ["member_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_relay_messages_relay_id_fkey"
            columns: ["relay_id"]
            isOneToOne: false
            referencedRelation: "sms_relays"
            referencedColumns: ["relay_id"]
          },
          {
            foreignKeyName: "sms_relay_messages_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "sms_relay_targets"
            referencedColumns: ["target_id"]
          },
        ]
      }
      sms_relay_targets: {
        Row: {
          created_at: string
          display_name: string | null
          is_active: boolean
          phone_e164: string
          relay_id: number
          target_id: number
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          is_active?: boolean
          phone_e164: string
          relay_id: number
          target_id?: number
        }
        Update: {
          created_at?: string
          display_name?: string | null
          is_active?: boolean
          phone_e164?: string
          relay_id?: number
          target_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_relay_targets_relay_id_fkey"
            columns: ["relay_id"]
            isOneToOne: false
            referencedRelation: "sms_relays"
            referencedColumns: ["relay_id"]
          },
        ]
      }
      sms_relays: {
        Row: {
          campaign_id: number | null
          created_at: string
          created_by: string | null
          moderation_required: boolean
          name: string
          number_id: number
          prefix_template: string | null
          quiet_hours_respected: boolean
          relay_id: number
          status: string
          suffix_template: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          moderation_required?: boolean
          name: string
          number_id: number
          prefix_template?: string | null
          quiet_hours_respected?: boolean
          relay_id?: number
          status?: string
          suffix_template?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          moderation_required?: boolean
          name?: string
          number_id?: number
          prefix_template?: string | null
          quiet_hours_respected?: boolean
          relay_id?: number
          status?: string
          suffix_template?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_relays_number_id_fkey"
            columns: ["number_id"]
            isOneToOne: false
            referencedRelation: "sms_numbers"
            referencedColumns: ["number_id"]
          },
        ]
      }
      sms_send_log: {
        Row: {
          campaign_id: number
          cost: number | null
          created_at: string
          delivered_at: string | null
          draft_id: number
          failed_at: string | null
          failure_reason: string | null
          first_reply_at: string | null
          list_id: number | null
          phone_e164: string | null
          provider_message_id: string | null
          reply_count: number
          segments: number | null
          send_id: number
          sent_at: string | null
          status: string
          worker_id: number
        }
        Insert: {
          campaign_id: number
          cost?: number | null
          created_at?: string
          delivered_at?: string | null
          draft_id: number
          failed_at?: string | null
          failure_reason?: string | null
          first_reply_at?: string | null
          list_id?: number | null
          phone_e164?: string | null
          provider_message_id?: string | null
          reply_count?: number
          segments?: number | null
          send_id?: number
          sent_at?: string | null
          status?: string
          worker_id: number
        }
        Update: {
          campaign_id?: number
          cost?: number | null
          created_at?: string
          delivered_at?: string | null
          draft_id?: number
          failed_at?: string | null
          failure_reason?: string | null
          first_reply_at?: string | null
          list_id?: number | null
          phone_e164?: string | null
          provider_message_id?: string | null
          reply_count?: number
          segments?: number | null
          send_id?: number
          sent_at?: string | null
          status?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_send_log_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "campaign_comms_drafts"
            referencedColumns: ["draft_id"]
          },
          {
            foreignKeyName: "sms_send_log_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "sms_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "sms_send_log_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "sms_send_log_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_chat_session_report"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "sms_send_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_send_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_send_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      sms_survey_answers: {
        Row: {
          answer_id: number
          created_at: string
          invalid_attempts: number
          parsed_value: string | null
          provider_message_id: string | null
          question_id: number
          raw_body: string | null
          received_at: string
          session_id: number
        }
        Insert: {
          answer_id?: number
          created_at?: string
          invalid_attempts?: number
          parsed_value?: string | null
          provider_message_id?: string | null
          question_id: number
          raw_body?: string | null
          received_at?: string
          session_id: number
        }
        Update: {
          answer_id?: number
          created_at?: string
          invalid_attempts?: number
          parsed_value?: string | null
          provider_message_id?: string | null
          question_id?: number
          raw_body?: string | null
          received_at?: string
          session_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_survey_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "sms_survey_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "sms_survey_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_ballot_tally"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "sms_survey_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_answer_distribution"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "sms_survey_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_question_stats"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "sms_survey_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sms_survey_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      sms_survey_definition_versions: {
        Row: {
          created_at: string
          questions: Json
          survey_id: number
          version: number
        }
        Insert: {
          created_at?: string
          questions: Json
          survey_id: number
          version: number
        }
        Update: {
          created_at?: string
          questions?: Json
          survey_id?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_survey_definition_versions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "sms_surveys"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_definition_versions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_ballot_tally"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_definition_versions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_funnel"
            referencedColumns: ["survey_id"]
          },
        ]
      }
      sms_survey_questions: {
        Row: {
          activity_id: number | null
          branching: Json | null
          created_at: string
          field_id: number | null
          invalid_prompt: string | null
          nudge_text: string | null
          options: Json | null
          prompt: string
          qtype: string
          question_id: number
          retired_at: string | null
          sort_order: number
          survey_id: number
          updated_at: string
          write_fact: boolean
          write_rating: boolean
        }
        Insert: {
          activity_id?: number | null
          branching?: Json | null
          created_at?: string
          field_id?: number | null
          invalid_prompt?: string | null
          nudge_text?: string | null
          options?: Json | null
          prompt: string
          qtype: string
          question_id?: number
          retired_at?: string | null
          sort_order?: number
          survey_id: number
          updated_at?: string
          write_fact?: boolean
          write_rating?: boolean
        }
        Update: {
          activity_id?: number | null
          branching?: Json | null
          created_at?: string
          field_id?: number | null
          invalid_prompt?: string | null
          nudge_text?: string | null
          options?: Json | null
          prompt?: string
          qtype?: string
          question_id?: number
          retired_at?: string | null
          sort_order?: number
          survey_id?: number
          updated_at?: string
          write_fact?: boolean
          write_rating?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sms_survey_questions_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "sms_survey_questions_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "campaign_data_fields"
            referencedColumns: ["field_id"]
          },
          {
            foreignKeyName: "sms_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "sms_surveys"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_ballot_tally"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_funnel"
            referencedColumns: ["survey_id"]
          },
        ]
      }
      sms_survey_sessions: {
        Row: {
          completed_at: string | null
          conversation_id: number | null
          created_at: string
          current_question_id: number | null
          first_answer_at: string | null
          invited_at: string | null
          last_activity_at: string | null
          last_prompt_at: string | null
          nudged: boolean
          phone_e164: string
          reminders_sent: number
          retry_count: number
          session_id: number
          state: string
          survey_id: number
          survey_version: number
          updated_at: string
          worker_id: number
        }
        Insert: {
          completed_at?: string | null
          conversation_id?: number | null
          created_at?: string
          current_question_id?: number | null
          first_answer_at?: string | null
          invited_at?: string | null
          last_activity_at?: string | null
          last_prompt_at?: string | null
          nudged?: boolean
          phone_e164: string
          reminders_sent?: number
          retry_count?: number
          session_id?: number
          state?: string
          survey_id: number
          survey_version?: number
          updated_at?: string
          worker_id: number
        }
        Update: {
          completed_at?: string | null
          conversation_id?: number | null
          created_at?: string
          current_question_id?: number | null
          first_answer_at?: string | null
          invited_at?: string | null
          last_activity_at?: string | null
          last_prompt_at?: string | null
          nudged?: boolean
          phone_e164?: string
          reminders_sent?: number
          retry_count?: number
          session_id?: number
          state?: string
          survey_id?: number
          survey_version?: number
          updated_at?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_survey_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["conversation_id"]
          },
          {
            foreignKeyName: "sms_survey_sessions_current_question_id_fkey"
            columns: ["current_question_id"]
            isOneToOne: false
            referencedRelation: "sms_survey_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "sms_survey_sessions_current_question_id_fkey"
            columns: ["current_question_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_ballot_tally"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "sms_survey_sessions_current_question_id_fkey"
            columns: ["current_question_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_answer_distribution"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "sms_survey_sessions_current_question_id_fkey"
            columns: ["current_question_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_question_stats"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "sms_survey_sessions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "sms_surveys"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_sessions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_ballot_tally"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_sessions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_funnel"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_sessions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_survey_sessions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "sms_survey_sessions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      sms_surveys: {
        Row: {
          activity_id: number | null
          archived_at: string | null
          blackout_override: boolean
          blackout_override_reason: string | null
          campaign_id: number
          closed_at: string | null
          completion_body: string | null
          created_at: string
          created_by: string | null
          handoff_escalate_to: string | null
          invitation_body: string | null
          is_test: boolean
          opened_at: string | null
          pause_mode: string | null
          paused_at: string | null
          purpose: string
          question_timeout_minutes: number
          receipt_salt: string
          reminder_offsets: Json
          results_restricted: boolean
          retry_limit: number
          revote_policy: string
          sender_number_id: number | null
          session_ttl_hours: number
          source_worker_list_id: number | null
          status: string
          survey_id: number
          timezone: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          activity_id?: number | null
          archived_at?: string | null
          blackout_override?: boolean
          blackout_override_reason?: string | null
          campaign_id: number
          closed_at?: string | null
          completion_body?: string | null
          created_at?: string
          created_by?: string | null
          handoff_escalate_to?: string | null
          invitation_body?: string | null
          is_test?: boolean
          opened_at?: string | null
          pause_mode?: string | null
          paused_at?: string | null
          purpose?: string
          question_timeout_minutes?: number
          receipt_salt?: string
          reminder_offsets?: Json
          results_restricted?: boolean
          retry_limit?: number
          revote_policy?: string
          sender_number_id?: number | null
          session_ttl_hours?: number
          source_worker_list_id?: number | null
          status?: string
          survey_id?: number
          timezone?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          activity_id?: number | null
          archived_at?: string | null
          blackout_override?: boolean
          blackout_override_reason?: string | null
          campaign_id?: number
          closed_at?: string | null
          completion_body?: string | null
          created_at?: string
          created_by?: string | null
          handoff_escalate_to?: string | null
          invitation_body?: string | null
          is_test?: boolean
          opened_at?: string | null
          pause_mode?: string | null
          paused_at?: string | null
          purpose?: string
          question_timeout_minutes?: number
          receipt_salt?: string
          reminder_offsets?: Json
          results_restricted?: boolean
          retry_limit?: number
          revote_policy?: string
          sender_number_id?: number | null
          session_ttl_hours?: number
          source_worker_list_id?: number | null
          status?: string
          survey_id?: number
          timezone?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_surveys_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_sender_number_id_fkey"
            columns: ["sender_number_id"]
            isOneToOne: false
            referencedRelation: "sms_numbers"
            referencedColumns: ["number_id"]
          },
          {
            foreignKeyName: "sms_surveys_source_worker_list_id_fkey"
            columns: ["source_worker_list_id"]
            isOneToOne: false
            referencedRelation: "campaign_worker_lists"
            referencedColumns: ["list_id"]
          },
        ]
      }
      soc_chat_turns: {
        Row: {
          ai_metadata: Json | null
          content: string
          created_at: string
          hope_frame: string | null
          population_index: number | null
          role: string
          session_id: number
          stage_number: number
          turn_id: number
          turn_index: number
        }
        Insert: {
          ai_metadata?: Json | null
          content: string
          created_at?: string
          hope_frame?: string | null
          population_index?: number | null
          role: string
          session_id: number
          stage_number: number
          turn_id?: number
          turn_index: number
        }
        Update: {
          ai_metadata?: Json | null
          content?: string
          created_at?: string
          hope_frame?: string | null
          population_index?: number | null
          role?: string
          session_id?: number
          stage_number?: number
          turn_id?: number
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "soc_chat_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "soc_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      soc_derived_artifacts: {
        Row: {
          artifact_id: number
          artifact_kind: string
          created_at: string
          created_by: string | null
          draft_id: number | null
          hope_frame: string | null
          inline_body: string | null
          session_id: number
          stage_number: number | null
        }
        Insert: {
          artifact_id?: number
          artifact_kind: string
          created_at?: string
          created_by?: string | null
          draft_id?: number | null
          hope_frame?: string | null
          inline_body?: string | null
          session_id: number
          stage_number?: number | null
        }
        Update: {
          artifact_id?: number
          artifact_kind?: string
          created_at?: string
          created_by?: string | null
          draft_id?: number | null
          hope_frame?: string | null
          inline_body?: string | null
          session_id?: number
          stage_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "soc_derived_artifacts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "campaign_comms_drafts"
            referencedColumns: ["draft_id"]
          },
          {
            foreignKeyName: "soc_derived_artifacts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "soc_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      soc_sessions: {
        Row: {
          campaign_id: number | null
          capacity_id: number | null
          context_snapshot: Json
          created_at: string
          created_by: string | null
          custom_situation: string | null
          plan_id: number | null
          session_id: number
          stage_number: number | null
          status: string
          target_populations: Json
          title: string
          updated_at: string
        }
        Insert: {
          campaign_id?: number | null
          capacity_id?: number | null
          context_snapshot?: Json
          created_at?: string
          created_by?: string | null
          custom_situation?: string | null
          plan_id?: number | null
          session_id?: number
          stage_number?: number | null
          status?: string
          target_populations?: Json
          title: string
          updated_at?: string
        }
        Update: {
          campaign_id?: number | null
          capacity_id?: number | null
          context_snapshot?: Json
          created_at?: string
          created_by?: string | null
          custom_situation?: string | null
          plan_id?: number | null
          session_id?: number
          stage_number?: number | null
          status?: string
          target_populations?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "soc_sessions_capacity_id_fkey"
            columns: ["capacity_id"]
            isOneToOne: false
            referencedRelation: "plan_capacities"
            referencedColumns: ["capacity_id"]
          },
          {
            foreignKeyName: "soc_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_stage_plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      soc_stage_content: {
        Row: {
          content_id: number
          hope_frame: string | null
          locked_at: string
          locked_by: string | null
          locked_content: string
          organiser_notes: string | null
          population_index: number | null
          populations_targeted: Json
          session_id: number
          stage_name: string
          stage_number: number
        }
        Insert: {
          content_id?: number
          hope_frame?: string | null
          locked_at?: string
          locked_by?: string | null
          locked_content: string
          organiser_notes?: string | null
          population_index?: number | null
          populations_targeted?: Json
          session_id: number
          stage_name: string
          stage_number: number
        }
        Update: {
          content_id?: number
          hope_frame?: string | null
          locked_at?: string
          locked_by?: string | null
          locked_content?: string
          organiser_notes?: string | null
          population_index?: number | null
          populations_targeted?: Json
          session_id?: number
          stage_name?: string
          stage_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "soc_stage_content_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "soc_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      specialisations: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          name: string
          specialisation_id: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          name: string
          specialisation_id?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          name?: string
          specialisation_id?: number
        }
        Relationships: []
      }
      stage_timeline_targets: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          duration_weeks: number | null
          is_on_track: boolean | null
          notes: string | null
          planned_end: string | null
          planned_start: string | null
          stage_number: number
          target_id: number
          timeline_id: number
          variance_days: number | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          duration_weeks?: number | null
          is_on_track?: boolean | null
          notes?: string | null
          planned_end?: string | null
          planned_start?: string | null
          stage_number: number
          target_id?: number
          timeline_id: number
          variance_days?: number | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          duration_weeks?: number | null
          is_on_track?: boolean | null
          notes?: string | null
          planned_end?: string | null
          planned_start?: string | null
          stage_number?: number
          target_id?: number
          timeline_id?: number
          variance_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_timeline_targets_timeline_id_fkey"
            columns: ["timeline_id"]
            isOneToOne: false
            referencedRelation: "campaign_timelines"
            referencedColumns: ["timeline_id"]
          },
        ]
      }
      structure_test_results: {
        Row: {
          created_at: string
          eligible: number | null
          leader_worker_id: number | null
          learnings: string | null
          ou_id: number
          participated: number | null
          passed: boolean | null
          result_id: number
          structure_test_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          eligible?: number | null
          leader_worker_id?: number | null
          learnings?: string | null
          ou_id: number
          participated?: number | null
          passed?: boolean | null
          result_id?: number
          structure_test_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          eligible?: number | null
          leader_worker_id?: number | null
          learnings?: string | null
          ou_id?: number
          participated?: number | null
          passed?: boolean | null
          result_id?: number
          structure_test_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "structure_test_results_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "structure_test_results_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "structure_test_results_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "structure_test_results_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "structure_test_results_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "structure_test_results_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "structure_test_results_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "structure_test_results_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "structure_test_results_structure_test_id_fkey"
            columns: ["structure_test_id"]
            isOneToOne: false
            referencedRelation: "structure_tests"
            referencedColumns: ["structure_test_id"]
          },
        ]
      }
      structure_tests: {
        Row: {
          activity_id: number | null
          campaign_id: number
          created_at: string
          created_by: string | null
          description: string | null
          event_id: number | null
          learnings: string | null
          pass_threshold_pct: number | null
          structure_test_id: number
          target_description: string | null
          test_date: string | null
          test_number: number | null
          title: string
          updated_at: string
        }
        Insert: {
          activity_id?: number | null
          campaign_id: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: number | null
          learnings?: string | null
          pass_threshold_pct?: number | null
          structure_test_id?: number
          target_description?: string | null
          test_date?: string | null
          test_number?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          activity_id?: number | null
          campaign_id?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: number | null
          learnings?: string | null
          pass_threshold_pct?: number | null
          structure_test_id?: number
          target_description?: string | null
          test_date?: string | null
          test_number?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "structure_tests_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "structure_tests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["event_id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          tag_category: string | null
          tag_id: number
          tag_name: string
        }
        Insert: {
          color?: string | null
          tag_category?: string | null
          tag_id?: number
          tag_name: string
        }
        Update: {
          color?: string | null
          tag_category?: string | null
          tag_id?: number
          tag_name?: string
        }
        Relationships: []
      }
      union_membership_types: {
        Row: {
          display_name: string
          is_active: boolean
          is_default: boolean
          sort_order: number
          type_name: string
          union_membership_type_id: number
        }
        Insert: {
          display_name: string
          is_active?: boolean
          is_default?: boolean
          sort_order?: number
          type_name: string
          union_membership_type_id?: number
        }
        Update: {
          display_name?: string
          is_active?: boolean
          is_default?: boolean
          sort_order?: number
          type_name?: string
          union_membership_type_id?: number
        }
        Relationships: []
      }
      unions: {
        Row: {
          is_oa_member: boolean
          union_code: string
          union_id: number
          union_name: string
        }
        Insert: {
          is_oa_member?: boolean
          union_code: string
          union_id?: number
          union_name: string
        }
        Update: {
          is_oa_member?: boolean
          union_code?: string
          union_id?: number
          union_name?: string
        }
        Relationships: []
      }
      upcoming_project_employers: {
        Row: {
          candidate_proposals: Json
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          employer_id: number | null
          id: number
          is_primary: boolean
          match_method: string | null
          match_score: number | null
          match_status: string
          notes: string | null
          role_type: string
          upcoming_project_id: number
          updated_at: string
        }
        Insert: {
          candidate_proposals?: Json
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          employer_id?: number | null
          id?: number
          is_primary?: boolean
          match_method?: string | null
          match_score?: number | null
          match_status: string
          notes?: string | null
          role_type?: string
          upcoming_project_id: number
          updated_at?: string
        }
        Update: {
          candidate_proposals?: Json
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          employer_id?: number | null
          id?: number
          is_primary?: boolean
          match_method?: string | null
          match_score?: number | null
          match_status?: string
          notes?: string | null
          role_type?: string
          upcoming_project_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "upcoming_project_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "upcoming_project_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "upcoming_project_employers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "upcoming_project_employers_upcoming_project_id_fkey"
            columns: ["upcoming_project_id"]
            isOneToOne: false
            referencedRelation: "upcoming_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      upcoming_projects: {
        Row: {
          activity_type: string | null
          associated_project: string | null
          created_at: string
          end_date: string | null
          external_id: string
          first_seen_at: string
          id: number
          is_active: boolean
          jurisdiction: string | null
          last_changed_at: string
          last_seen_at: string
          latitude: number | null
          lifecycle_classification: string | null
          location_text: string | null
          longitude: number | null
          organisation: string | null
          project_name: string | null
          raw_payload: Json
          region_code: string | null
          source: string
          source_url: string
          start_date: string | null
          status: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          activity_type?: string | null
          associated_project?: string | null
          created_at?: string
          end_date?: string | null
          external_id: string
          first_seen_at?: string
          id?: number
          is_active?: boolean
          jurisdiction?: string | null
          last_changed_at?: string
          last_seen_at?: string
          latitude?: number | null
          lifecycle_classification?: string | null
          location_text?: string | null
          longitude?: number | null
          organisation?: string | null
          project_name?: string | null
          raw_payload: Json
          region_code?: string | null
          source: string
          source_url: string
          start_date?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          activity_type?: string | null
          associated_project?: string | null
          created_at?: string
          end_date?: string | null
          external_id?: string
          first_seen_at?: string
          id?: number
          is_active?: boolean
          jurisdiction?: string | null
          last_changed_at?: string
          last_seen_at?: string
          latitude?: number | null
          lifecycle_classification?: string | null
          location_text?: string | null
          longitude?: number | null
          organisation?: string | null
          project_name?: string | null
          raw_payload?: Json
          region_code?: string | null
          source?: string
          source_url?: string
          start_date?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      upcoming_projects_scrape_runs: {
        Row: {
          auto_matched: number
          error_message: string | null
          finished_at: string | null
          id: number
          needs_review: number
          records_deactivated: number
          records_inserted: number
          records_seen: number
          records_updated: number
          source: string
          started_at: string
          status: string
          triggered_by: string
          unmatched: number
        }
        Insert: {
          auto_matched?: number
          error_message?: string | null
          finished_at?: string | null
          id?: number
          needs_review?: number
          records_deactivated?: number
          records_inserted?: number
          records_seen?: number
          records_updated?: number
          source: string
          started_at?: string
          status?: string
          triggered_by?: string
          unmatched?: number
        }
        Update: {
          auto_matched?: number
          error_message?: string | null
          finished_at?: string | null
          id?: number
          needs_review?: number
          records_deactivated?: number
          records_inserted?: number
          records_seen?: number
          records_updated?: number
          source?: string
          started_at?: string
          status?: string
          triggered_by?: string
          unmatched?: number
        }
        Relationships: []
      }
      user_oauth_connections: {
        Row: {
          access_token_ct: string | null
          access_token_expires_at: string | null
          connected_at: string
          connection_id: number
          display_name: string | null
          email: string | null
          last_error: string | null
          last_polled_at: string | null
          last_used_at: string | null
          provider: string
          provider_user_id: string
          refresh_token_ct: string
          scopes: string
          status: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_ct?: string | null
          access_token_expires_at?: string | null
          connected_at?: string
          connection_id?: number
          display_name?: string | null
          email?: string | null
          last_error?: string | null
          last_polled_at?: string | null
          last_used_at?: string | null
          provider: string
          provider_user_id: string
          refresh_token_ct: string
          scopes: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_ct?: string | null
          access_token_expires_at?: string | null
          connected_at?: string
          connection_id?: number
          display_name?: string | null
          email?: string | null
          last_error?: string | null
          last_polled_at?: string | null
          last_used_at?: string | null
          provider?: string
          provider_user_id?: string
          refresh_token_ct?: string
          scopes?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string
          organiser_id: number | null
          phone: string | null
          reports_to: string | null
          role: string
          updated_at: string
          user_id: string
          work_role: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string
          organiser_id?: number | null
          phone?: string | null
          reports_to?: string | null
          role?: string
          updated_at?: string
          user_id: string
          work_role?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          organiser_id?: number | null
          phone?: string | null
          reports_to?: string | null
          role?: string
          updated_at?: string
          user_id?: string
          work_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "user_profiles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      woc_committee_meetings: {
        Row: {
          activity_id: number | null
          attendees_snapshot: Json | null
          chair_worker_id: number | null
          created_at: string
          created_by: string | null
          crews_missing_snapshot: Json | null
          crews_represented_snapshot: Json | null
          event_id: number | null
          format: string | null
          meeting_date: string
          meeting_id: number
          new_tasks_summary: string | null
          next_chair_worker_id: number | null
          next_meeting_date: string | null
          notes: string | null
          recognition_notes: string | null
          updated_at: string
          whats_new: string | null
          woc_id: number
        }
        Insert: {
          activity_id?: number | null
          attendees_snapshot?: Json | null
          chair_worker_id?: number | null
          created_at?: string
          created_by?: string | null
          crews_missing_snapshot?: Json | null
          crews_represented_snapshot?: Json | null
          event_id?: number | null
          format?: string | null
          meeting_date: string
          meeting_id?: number
          new_tasks_summary?: string | null
          next_chair_worker_id?: number | null
          next_meeting_date?: string | null
          notes?: string | null
          recognition_notes?: string | null
          updated_at?: string
          whats_new?: string | null
          woc_id: number
        }
        Update: {
          activity_id?: number | null
          attendees_snapshot?: Json | null
          chair_worker_id?: number | null
          created_at?: string
          created_by?: string | null
          crews_missing_snapshot?: Json | null
          crews_represented_snapshot?: Json | null
          event_id?: number | null
          format?: string | null
          meeting_date?: string
          meeting_id?: number
          new_tasks_summary?: string | null
          next_chair_worker_id?: number | null
          next_meeting_date?: string | null
          notes?: string | null
          recognition_notes?: string | null
          updated_at?: string
          whats_new?: string | null
          woc_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "woc_committee_meetings_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "woc_committee_meetings_chair_worker_id_fkey"
            columns: ["chair_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "woc_committee_meetings_chair_worker_id_fkey"
            columns: ["chair_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "woc_committee_meetings_chair_worker_id_fkey"
            columns: ["chair_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "woc_committee_meetings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "woc_committee_meetings_next_chair_worker_id_fkey"
            columns: ["next_chair_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "woc_committee_meetings_next_chair_worker_id_fkey"
            columns: ["next_chair_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "woc_committee_meetings_next_chair_worker_id_fkey"
            columns: ["next_chair_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "woc_committee_meetings_woc_id_fkey"
            columns: ["woc_id"]
            isOneToOne: false
            referencedRelation: "campaign_wocs"
            referencedColumns: ["woc_id"]
          },
        ]
      }
      woc_meeting_details: {
        Row: {
          activity_id: number
          agenda_template_key: string | null
          attendees_target_cohort_id: number | null
          created_at: string
          meeting_kind: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          activity_id: number
          agenda_template_key?: string | null
          attendees_target_cohort_id?: number | null
          created_at?: string
          meeting_kind?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          activity_id?: number
          agenda_template_key?: string | null
          attendees_target_cohort_id?: number | null
          created_at?: string
          meeting_kind?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "woc_meeting_details_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: true
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
        ]
      }
      woc_members: {
        Row: {
          created_at: string
          joined_on: string
          left_on: string | null
          notes: string | null
          updated_at: string
          woc_id: number
          woc_member_id: number
          woc_role: string
          worker_id: number
        }
        Insert: {
          created_at?: string
          joined_on?: string
          left_on?: string | null
          notes?: string | null
          updated_at?: string
          woc_id: number
          woc_member_id?: number
          woc_role?: string
          worker_id: number
        }
        Update: {
          created_at?: string
          joined_on?: string
          left_on?: string | null
          notes?: string | null
          updated_at?: string
          woc_id?: number
          woc_member_id?: number
          woc_role?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "woc_members_woc_id_fkey"
            columns: ["woc_id"]
            isOneToOne: false
            referencedRelation: "campaign_wocs"
            referencedColumns: ["woc_id"]
          },
          {
            foreignKeyName: "woc_members_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "woc_members_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "woc_members_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      woc_scope_units: {
        Row: {
          created_at: string
          ou_id: number
          woc_id: number
        }
        Insert: {
          created_at?: string
          ou_id: number
          woc_id: number
        }
        Update: {
          created_at?: string
          ou_id?: number
          woc_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "woc_scope_units_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "woc_scope_units_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "woc_scope_units_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "woc_scope_units_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "woc_scope_units_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "woc_scope_units_woc_id_fkey"
            columns: ["woc_id"]
            isOneToOne: false
            referencedRelation: "campaign_wocs"
            referencedColumns: ["woc_id"]
          },
        ]
      }
      work_scopes: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          is_whole_of_project: boolean
          parent_scope_id: number | null
          scope_id: number
          scope_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          is_whole_of_project?: boolean
          parent_scope_id?: number | null
          scope_id?: number
          scope_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          is_whole_of_project?: boolean
          parent_scope_id?: number | null
          scope_id?: number
          scope_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_scopes_parent_scope_id_fkey"
            columns: ["parent_scope_id"]
            isOneToOne: false
            referencedRelation: "work_scopes"
            referencedColumns: ["scope_id"]
          },
        ]
      }
      worker_activity_log: {
        Row: {
          action_id: number | null
          activity_date: string
          activity_id: number
          activity_type: string
          connection_id: number
          contact_method: string | null
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          event_id: number | null
          feedback: string | null
          logged_by: string | null
          metadata: Json | null
          outcome: string | null
          rating: number | null
          volunteer_hours: number | null
          volunteer_role: string | null
        }
        Insert: {
          action_id?: number | null
          activity_date?: string
          activity_id?: number
          activity_type: string
          connection_id: number
          contact_method?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          event_id?: number | null
          feedback?: string | null
          logged_by?: string | null
          metadata?: Json | null
          outcome?: string | null
          rating?: number | null
          volunteer_hours?: number | null
          volunteer_role?: string | null
        }
        Update: {
          action_id?: number | null
          activity_date?: string
          activity_id?: number
          activity_type?: string
          connection_id?: number
          contact_method?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          event_id?: number | null
          feedback?: string | null
          logged_by?: string | null
          metadata?: Json | null
          outcome?: string | null
          rating?: number | null
          volunteer_hours?: number | null
          volunteer_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_activity_log_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "phone_call_actions"
            referencedColumns: ["action_id"]
          },
          {
            foreignKeyName: "worker_activity_log_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "worker_campaign_connections"
            referencedColumns: ["connection_id"]
          },
          {
            foreignKeyName: "worker_activity_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
        ]
      }
      worker_additional_occupations: {
        Row: {
          occupation_id: number
          worker_id: number
        }
        Insert: {
          occupation_id: number
          worker_id: number
        }
        Update: {
          occupation_id?: number
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_additional_occupations_occupation_id_fkey"
            columns: ["occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["occupation_id"]
          },
          {
            foreignKeyName: "worker_additional_occupations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_additional_occupations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_additional_occupations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_agreements: {
        Row: {
          agreement_id: number
          id: number
          worker_id: number
        }
        Insert: {
          agreement_id: number
          id?: number
          worker_id: number
        }
        Update: {
          agreement_id?: number
          id?: number
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_agreements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "worker_agreements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "worker_agreements_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "worker_agreements_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_agreements_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_agreements_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_an_tags: {
        Row: {
          an_tag_id: string
          an_tag_name: string
          first_seen_at: string
          id: number
          last_synced_at: string
          worker_id: number
        }
        Insert: {
          an_tag_id: string
          an_tag_name: string
          first_seen_at?: string
          id?: number
          last_synced_at?: string
          worker_id: number
        }
        Update: {
          an_tag_id?: string
          an_tag_name?: string
          first_seen_at?: string
          id?: number
          last_synced_at?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_an_tags_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_an_tags_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_an_tags_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_assignments: {
        Row: {
          assignment_id: number
          contract_id: number
          created_at: string
          end_date: string | null
          is_current: boolean
          notes: string | null
          start_date: string | null
          updated_at: string
          worker_id: number
        }
        Insert: {
          assignment_id?: number
          contract_id: number
          created_at?: string
          end_date?: string | null
          is_current?: boolean
          notes?: string | null
          start_date?: string | null
          updated_at?: string
          worker_id: number
        }
        Update: {
          assignment_id?: number
          contract_id?: number
          created_at?: string
          end_date?: string | null
          is_current?: boolean
          notes?: string | null
          start_date?: string | null
          updated_at?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_assignments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "worksite_contracts"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "worker_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_campaign_connections: {
        Row: {
          activities_attended_count: number | null
          campaign_id: number
          connection_id: number
          connection_status: string
          contact_count: number | null
          created_at: string | null
          created_by: string | null
          estimated_network_size: number | null
          first_contacted_at: string | null
          is_service_employer: boolean | null
          job_title: string | null
          joined_at: string | null
          last_activity_at: string | null
          last_activity_attended_at: string | null
          last_contacted_at: string | null
          membership_number: string | null
          notes: string | null
          preferred_contact_method: string | null
          preferred_contact_time: string | null
          recruitment_potential: string | null
          risk_flags: string[] | null
          support_level: string | null
          tags: string[] | null
          updated_at: string | null
          volunteer_hours: number | null
          willingness_to_recruit: string | null
          willingness_to_volunteer: string | null
          worker_id: number
        }
        Insert: {
          activities_attended_count?: number | null
          campaign_id: number
          connection_id?: number
          connection_status?: string
          contact_count?: number | null
          created_at?: string | null
          created_by?: string | null
          estimated_network_size?: number | null
          first_contacted_at?: string | null
          is_service_employer?: boolean | null
          job_title?: string | null
          joined_at?: string | null
          last_activity_at?: string | null
          last_activity_attended_at?: string | null
          last_contacted_at?: string | null
          membership_number?: string | null
          notes?: string | null
          preferred_contact_method?: string | null
          preferred_contact_time?: string | null
          recruitment_potential?: string | null
          risk_flags?: string[] | null
          support_level?: string | null
          tags?: string[] | null
          updated_at?: string | null
          volunteer_hours?: number | null
          willingness_to_recruit?: string | null
          willingness_to_volunteer?: string | null
          worker_id: number
        }
        Update: {
          activities_attended_count?: number | null
          campaign_id?: number
          connection_id?: number
          connection_status?: string
          contact_count?: number | null
          created_at?: string | null
          created_by?: string | null
          estimated_network_size?: number | null
          first_contacted_at?: string | null
          is_service_employer?: boolean | null
          job_title?: string | null
          joined_at?: string | null
          last_activity_at?: string | null
          last_activity_attended_at?: string | null
          last_contacted_at?: string | null
          membership_number?: string | null
          notes?: string | null
          preferred_contact_method?: string | null
          preferred_contact_time?: string | null
          recruitment_potential?: string | null
          risk_flags?: string[] | null
          support_level?: string | null
          tags?: string[] | null
          updated_at?: string | null
          volunteer_hours?: number | null
          willingness_to_recruit?: string | null
          willingness_to_volunteer?: string | null
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_campaign_connections_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_campaign_fact_history: {
        Row: {
          campaign_id: number
          collected_at: string | null
          fact_id: number | null
          field_id: number
          history_id: number
          notes: string | null
          recorded_by: string | null
          replaced_at: string
          source: string | null
          source_ref: string | null
          value_bool: boolean | null
          value_enum: string | null
          value_int: number | null
          value_json: Json | null
          value_text: string | null
          worker_id: number
        }
        Insert: {
          campaign_id: number
          collected_at?: string | null
          fact_id?: number | null
          field_id: number
          history_id?: number
          notes?: string | null
          recorded_by?: string | null
          replaced_at?: string
          source?: string | null
          source_ref?: string | null
          value_bool?: boolean | null
          value_enum?: string | null
          value_int?: number | null
          value_json?: Json | null
          value_text?: string | null
          worker_id: number
        }
        Update: {
          campaign_id?: number
          collected_at?: string | null
          fact_id?: number | null
          field_id?: number
          history_id?: number
          notes?: string | null
          recorded_by?: string | null
          replaced_at?: string
          source?: string | null
          source_ref?: string | null
          value_bool?: boolean | null
          value_enum?: string | null
          value_int?: number | null
          value_json?: Json | null
          value_text?: string | null
          worker_id?: number
        }
        Relationships: []
      }
      worker_campaign_facts: {
        Row: {
          campaign_id: number
          collected_at: string
          created_at: string
          fact_id: number
          field_id: number
          notes: string | null
          recorded_by: string | null
          source: string
          source_ref: string | null
          updated_at: string
          value_bool: boolean | null
          value_enum: string | null
          value_int: number | null
          value_json: Json | null
          value_text: string | null
          worker_id: number
        }
        Insert: {
          campaign_id: number
          collected_at?: string
          created_at?: string
          fact_id?: number
          field_id: number
          notes?: string | null
          recorded_by?: string | null
          source?: string
          source_ref?: string | null
          updated_at?: string
          value_bool?: boolean | null
          value_enum?: string | null
          value_int?: number | null
          value_json?: Json | null
          value_text?: string | null
          worker_id: number
        }
        Update: {
          campaign_id?: number
          collected_at?: string
          created_at?: string
          fact_id?: number
          field_id?: number
          notes?: string | null
          recorded_by?: string | null
          source?: string
          source_ref?: string | null
          updated_at?: string
          value_bool?: boolean | null
          value_enum?: string | null
          value_int?: number | null
          value_json?: Json | null
          value_text?: string | null
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "campaign_data_fields"
            referencedColumns: ["field_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_campaign_facts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_history: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          history_id: number
          new_value: string | null
          old_value: string | null
          worker_id: number
        }
        Insert: {
          change_type: string
          changed_at?: string
          changed_by?: string | null
          history_id?: number
          new_value?: string | null
          old_value?: string | null
          worker_id: number
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          history_id?: number
          new_value?: string | null
          old_value?: string | null
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_history_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_history_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_history_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_membership_transitions: {
        Row: {
          actor_id: string | null
          context: Json
          from_type_id: number | null
          occurred_at: string
          source: string
          to_type_id: number | null
          transition_id: number
          worker_id: number
        }
        Insert: {
          actor_id?: string | null
          context?: Json
          from_type_id?: number | null
          occurred_at?: string
          source: string
          to_type_id?: number | null
          transition_id?: number
          worker_id: number
        }
        Update: {
          actor_id?: string | null
          context?: Json
          from_type_id?: number | null
          occurred_at?: string
          source?: string
          to_type_id?: number | null
          transition_id?: number
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_membership_transitions_from_type_id_fkey"
            columns: ["from_type_id"]
            isOneToOne: false
            referencedRelation: "union_membership_types"
            referencedColumns: ["union_membership_type_id"]
          },
          {
            foreignKeyName: "worker_membership_transitions_to_type_id_fkey"
            columns: ["to_type_id"]
            isOneToOne: false
            referencedRelation: "union_membership_types"
            referencedColumns: ["union_membership_type_id"]
          },
          {
            foreignKeyName: "worker_membership_transitions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_membership_transitions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_membership_transitions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_notes: {
        Row: {
          campaign_id: number | null
          created_at: string
          created_by: string | null
          flag_for_follow_up: boolean
          note_id: number
          note_text: string
          worker_id: number
        }
        Insert: {
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          flag_for_follow_up?: boolean
          note_id?: number
          note_text: string
          worker_id: number
        }
        Update: {
          campaign_id?: number | null
          created_at?: string
          created_by?: string | null
          flag_for_follow_up?: boolean
          note_id?: number
          note_text?: string
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "worker_notes_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_notes_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_notes_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_roster_panel_options: {
        Row: {
          created_at: string
          employer_id: number | null
          id: number
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          worksite_id: number | null
        }
        Insert: {
          created_at?: string
          employer_id?: number | null
          id?: number
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          worksite_id?: number | null
        }
        Update: {
          created_at?: string
          employer_id?: number | null
          id?: number
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          worksite_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_roster_panel_options_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worker_roster_panel_options_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worker_roster_panel_options_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "worker_roster_panel_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_roster_panel_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_roster_panel_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_roster_panel_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_roster_panel_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      worker_shift_options: {
        Row: {
          created_at: string
          employer_id: number | null
          id: number
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          worksite_id: number | null
        }
        Insert: {
          created_at?: string
          employer_id?: number | null
          id?: number
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          worksite_id?: number | null
        }
        Update: {
          created_at?: string
          employer_id?: number | null
          id?: number
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          worksite_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_shift_options_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worker_shift_options_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worker_shift_options_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "worker_shift_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_shift_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_shift_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_shift_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_shift_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      worker_specialisations: {
        Row: {
          specialisation_id: number
          worker_id: number
        }
        Insert: {
          specialisation_id: number
          worker_id: number
        }
        Update: {
          specialisation_id?: number
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_specialisations_specialisation_id_fkey"
            columns: ["specialisation_id"]
            isOneToOne: false
            referencedRelation: "specialisations"
            referencedColumns: ["specialisation_id"]
          },
          {
            foreignKeyName: "worker_specialisations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_specialisations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_specialisations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_tags: {
        Row: {
          id: number
          tag_id: number
          worker_id: number
        }
        Insert: {
          id?: number
          tag_id: number
          worker_id: number
        }
        Update: {
          id?: number
          tag_id?: number
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worker_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "worker_tags_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_tags_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "worker_tags_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      worker_work_area_options: {
        Row: {
          created_at: string
          employer_id: number | null
          id: number
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          worksite_id: number | null
        }
        Insert: {
          created_at?: string
          employer_id?: number | null
          id?: number
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          worksite_id?: number | null
        }
        Update: {
          created_at?: string
          employer_id?: number | null
          id?: number
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          worksite_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_work_area_options_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worker_work_area_options_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worker_work_area_options_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "worker_work_area_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_work_area_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_work_area_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_work_area_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worker_work_area_options_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      workers: {
        Row: {
          action_network_id: string | null
          address: string | null
          canonical_occupation_id: number | null
          classification: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          email_consent_source: string | null
          email_opt_out: boolean
          email_opt_out_at: string | null
          email_opt_out_source: string | null
          email_status: string | null
          email_status_updated_at: string | null
          employer_id: number | null
          first_name: string
          gender: string | null
          is_active: boolean
          is_bargaining_rep: boolean | null
          is_hsr: boolean | null
          join_date: string | null
          last_name: string
          member_number: string | null
          member_role_type_id: number | null
          non_oa_union_option_id: number | null
          notes: string | null
          occupation: string | null
          phone: string | null
          phone_e164: string | null
          postcode: string | null
          preferred_name: string | null
          project_id: number | null
          reference_id: string | null
          rejoin_date: string | null
          resignation_date: string | null
          resignation_reason: string | null
          roster_panel_id: number | null
          shift_id: number | null
          sms_consent_source: string | null
          sms_opt_out: boolean
          sms_opt_out_at: string | null
          sms_opt_out_source: string | null
          state: string | null
          suburb: string | null
          union_id: number | null
          union_membership_type_id: number | null
          updated_at: string
          work_area_id: number | null
          worker_id: number
          worksite_id: number | null
        }
        Insert: {
          action_network_id?: string | null
          address?: string | null
          canonical_occupation_id?: number | null
          classification?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          email_consent_source?: string | null
          email_opt_out?: boolean
          email_opt_out_at?: string | null
          email_opt_out_source?: string | null
          email_status?: string | null
          email_status_updated_at?: string | null
          employer_id?: number | null
          first_name: string
          gender?: string | null
          is_active?: boolean
          is_bargaining_rep?: boolean | null
          is_hsr?: boolean | null
          join_date?: string | null
          last_name: string
          member_number?: string | null
          member_role_type_id?: number | null
          non_oa_union_option_id?: number | null
          notes?: string | null
          occupation?: string | null
          phone?: string | null
          phone_e164?: string | null
          postcode?: string | null
          preferred_name?: string | null
          project_id?: number | null
          reference_id?: string | null
          rejoin_date?: string | null
          resignation_date?: string | null
          resignation_reason?: string | null
          roster_panel_id?: number | null
          shift_id?: number | null
          sms_consent_source?: string | null
          sms_opt_out?: boolean
          sms_opt_out_at?: string | null
          sms_opt_out_source?: string | null
          state?: string | null
          suburb?: string | null
          union_id?: number | null
          union_membership_type_id?: number | null
          updated_at?: string
          work_area_id?: number | null
          worker_id?: number
          worksite_id?: number | null
        }
        Update: {
          action_network_id?: string | null
          address?: string | null
          canonical_occupation_id?: number | null
          classification?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          email_consent_source?: string | null
          email_opt_out?: boolean
          email_opt_out_at?: string | null
          email_opt_out_source?: string | null
          email_status?: string | null
          email_status_updated_at?: string | null
          employer_id?: number | null
          first_name?: string
          gender?: string | null
          is_active?: boolean
          is_bargaining_rep?: boolean | null
          is_hsr?: boolean | null
          join_date?: string | null
          last_name?: string
          member_number?: string | null
          member_role_type_id?: number | null
          non_oa_union_option_id?: number | null
          notes?: string | null
          occupation?: string | null
          phone?: string | null
          phone_e164?: string | null
          postcode?: string | null
          preferred_name?: string | null
          project_id?: number | null
          reference_id?: string | null
          rejoin_date?: string | null
          resignation_date?: string | null
          resignation_reason?: string | null
          roster_panel_id?: number | null
          shift_id?: number | null
          sms_consent_source?: string | null
          sms_opt_out?: boolean
          sms_opt_out_at?: string | null
          sms_opt_out_source?: string | null
          state?: string | null
          suburb?: string | null
          union_id?: number | null
          union_membership_type_id?: number | null
          updated_at?: string
          work_area_id?: number | null
          worker_id?: number
          worksite_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_canonical_occupation_id_fkey"
            columns: ["canonical_occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["occupation_id"]
          },
          {
            foreignKeyName: "workers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "workers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "workers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "workers_member_role_type_id_fkey"
            columns: ["member_role_type_id"]
            isOneToOne: false
            referencedRelation: "member_role_types"
            referencedColumns: ["role_type_id"]
          },
          {
            foreignKeyName: "workers_non_oa_union_option_id_fkey"
            columns: ["non_oa_union_option_id"]
            isOneToOne: false
            referencedRelation: "non_oa_union_options"
            referencedColumns: ["non_oa_union_option_id"]
          },
          {
            foreignKeyName: "workers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "workers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "workers_roster_panel_id_fkey"
            columns: ["roster_panel_id"]
            isOneToOne: false
            referencedRelation: "worker_roster_panel_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "worker_shift_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["union_id"]
          },
          {
            foreignKeyName: "workers_union_membership_type_id_fkey"
            columns: ["union_membership_type_id"]
            isOneToOne: false
            referencedRelation: "union_membership_types"
            referencedColumns: ["union_membership_type_id"]
          },
          {
            foreignKeyName: "workers_work_area_id_fkey"
            columns: ["work_area_id"]
            isOneToOne: false
            referencedRelation: "worker_work_area_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      worksite_contracts: {
        Row: {
          agreement_id: number | null
          contract_id: number
          contractor_employer_id: number
          created_at: string
          end_date: string | null
          engagement_type: string | null
          is_current: boolean
          notes: string | null
          program_id: number | null
          project_id: number | null
          scope_id: number
          start_date: string | null
          updated_at: string
          worksite_id: number
        }
        Insert: {
          agreement_id?: number | null
          contract_id?: number
          contractor_employer_id: number
          created_at?: string
          end_date?: string | null
          engagement_type?: string | null
          is_current?: boolean
          notes?: string | null
          program_id?: number | null
          project_id?: number | null
          scope_id: number
          start_date?: string | null
          updated_at?: string
          worksite_id: number
        }
        Update: {
          agreement_id?: number | null
          contract_id?: number
          contractor_employer_id?: number
          created_at?: string
          end_date?: string | null
          engagement_type?: string | null
          is_current?: boolean
          notes?: string | null
          program_id?: number | null
          project_id?: number | null
          scope_id?: number
          start_date?: string | null
          updated_at?: string
          worksite_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worksite_contracts_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "worksite_contracts_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "worksite_contracts_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "worksite_contracts_contractor_employer_id_fkey"
            columns: ["contractor_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksite_contracts_contractor_employer_id_fkey"
            columns: ["contractor_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksite_contracts_contractor_employer_id_fkey"
            columns: ["contractor_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "worksite_contracts_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["program_id"]
          },
          {
            foreignKeyName: "worksite_contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "worksite_contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "worksite_contracts_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "work_scopes"
            referencedColumns: ["scope_id"]
          },
          {
            foreignKeyName: "worksite_contracts_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_contracts_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_contracts_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_contracts_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_contracts_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      worksite_name_aliases: {
        Row: {
          alias_name: string
          created_at: string
          created_by: string | null
          id: number
          source: string
          worksite_id: number
        }
        Insert: {
          alias_name: string
          created_at?: string
          created_by?: string | null
          id?: number
          source?: string
          worksite_id: number
        }
        Update: {
          alias_name?: string
          created_at?: string
          created_by?: string | null
          id?: number
          source?: string
          worksite_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worksite_name_aliases_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_name_aliases_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_name_aliases_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_name_aliases_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_name_aliases_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      worksite_scopes: {
        Row: {
          employer_id: number | null
          end_date: string | null
          engagement_type: string | null
          id: number
          is_current: boolean
          notes: string | null
          scope_id: number
          start_date: string | null
          worksite_id: number
        }
        Insert: {
          employer_id?: number | null
          end_date?: string | null
          engagement_type?: string | null
          id?: number
          is_current?: boolean
          notes?: string | null
          scope_id: number
          start_date?: string | null
          worksite_id: number
        }
        Update: {
          employer_id?: number | null
          end_date?: string | null
          engagement_type?: string | null
          id?: number
          is_current?: boolean
          notes?: string | null
          scope_id?: number
          start_date?: string | null
          worksite_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worksite_scopes_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksite_scopes_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksite_scopes_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "worksite_scopes_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "work_scopes"
            referencedColumns: ["scope_id"]
          },
          {
            foreignKeyName: "worksite_scopes_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_scopes_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_scopes_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_scopes_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_scopes_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      worksite_tags: {
        Row: {
          id: number
          tag_id: number
          worksite_id: number
        }
        Insert: {
          id?: number
          tag_id: number
          worksite_id: number
        }
        Update: {
          id?: number
          tag_id?: number
          worksite_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "worksite_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "worksite_tags_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_tags_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_tags_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_tags_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksite_tags_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      worksites: {
        Row: {
          basin: string | null
          created_at: string
          image_url: string | null
          is_active: boolean
          is_offshore: boolean
          latitude: number | null
          location_description: string | null
          longitude: number | null
          notes: string | null
          operator_id: number | null
          parent_worksite_id: number | null
          principal_employer_id: number | null
          updated_at: string
          worksite_id: number
          worksite_name: string
          worksite_type: string
        }
        Insert: {
          basin?: string | null
          created_at?: string
          image_url?: string | null
          is_active?: boolean
          is_offshore?: boolean
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          notes?: string | null
          operator_id?: number | null
          parent_worksite_id?: number | null
          principal_employer_id?: number | null
          updated_at?: string
          worksite_id?: number
          worksite_name: string
          worksite_type: string
        }
        Update: {
          basin?: string | null
          created_at?: string
          image_url?: string | null
          is_active?: boolean
          is_offshore?: boolean
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          notes?: string | null
          operator_id?: number | null
          parent_worksite_id?: number | null
          principal_employer_id?: number | null
          updated_at?: string
          worksite_id?: number
          worksite_name?: string
          worksite_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksites_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      wtp_categories: {
        Row: {
          applies_to_stages: number[] | null
          category_id: number
          category_name: string
          created_at: string | null
          description: string | null
          is_active: boolean | null
          sort_order: number | null
        }
        Insert: {
          applies_to_stages?: number[] | null
          category_id?: number
          category_name: string
          created_at?: string | null
          description?: string | null
          is_active?: boolean | null
          sort_order?: number | null
        }
        Update: {
          applies_to_stages?: number[] | null
          category_id?: number
          category_name?: string
          created_at?: string | null
          description?: string | null
          is_active?: boolean | null
          sort_order?: number | null
        }
        Relationships: []
      }
      wtp_options: {
        Row: {
          category_id: number
          created_at: string | null
          created_by: string | null
          description: string | null
          is_active: boolean | null
          is_system_default: boolean | null
          option_id: number
          option_text: string
          use_count: number | null
        }
        Insert: {
          category_id: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          is_active?: boolean | null
          is_system_default?: boolean | null
          option_id?: number
          option_text: string
          use_count?: number | null
        }
        Update: {
          category_id?: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          is_active?: boolean | null
          is_system_default?: boolean | null
          option_id?: number
          option_text?: string
          use_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wtp_options_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "wtp_categories"
            referencedColumns: ["category_id"]
          },
        ]
      }
    }
    Views: {
      agreements_view: {
        Row: {
          agreement_id: number | null
          agreement_name: string | null
          commencement_date: string | null
          created_at: string | null
          date_of_decision: string | null
          days_until_expiry: number | null
          decision_no: string | null
          employer_id: number | null
          employer_name: string | null
          employer_trading_name: string | null
          expiry_date: string | null
          fwc_link: string | null
          industry_classification: string | null
          is_greenfield: boolean | null
          is_variation: boolean | null
          notes: string | null
          sector_id: number | null
          sector_name: string | null
          short_name: string | null
          source_sheet: string | null
          status: string | null
          supersedes_id: number | null
          union_coverage: string | null
          updated_at: string | null
          variation_of_id: number | null
          worksite_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agreements_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "agreements_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "agreements_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "agreements_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["sector_id"]
          },
          {
            foreignKeyName: "agreements_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["sector_id"]
          },
          {
            foreignKeyName: "agreements_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreements_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreements_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreements_variation_of_id_fkey"
            columns: ["variation_of_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreements_variation_of_id_fkey"
            columns: ["variation_of_id"]
            isOneToOne: false
            referencedRelation: "agreements_view"
            referencedColumns: ["agreement_id"]
          },
          {
            foreignKeyName: "agreements_variation_of_id_fkey"
            columns: ["variation_of_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["agreement_id"]
          },
        ]
      }
      ambition_activity_contribution: {
        Row: {
          activity_id: number | null
          ambition_id: number | null
          avg_rating: number | null
          campaign_id: number | null
          latest_rated_at: string | null
          opposed_count: number | null
          rating_count: number | null
          supportive_count: number | null
          unique_workers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activity_ratings_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      ambition_progress: {
        Row: {
          ambition_id: number | null
          campaign_id: number | null
          last_rated_at: string | null
          opposed: number | null
          rated_1: number | null
          rated_2: number | null
          rated_3: number | null
          rated_4: number | null
          rated_5: number | null
          supportive: number | null
          supportive_pct: number | null
          unassessed: number | null
          unassessed_pct: number | null
          universe: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      ambition_progress_phone_calls: {
        Row: {
          ambition_id: number | null
          campaign_id: number | null
          event_count: number | null
          unique_workers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ambition_progress_events_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_ambition_id_fkey"
            columns: ["ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "ambition_progress_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      call_campaign_summary: {
        Row: {
          avg_call_duration_seconds: number | null
          bad_number_count: number | null
          callbacks_pending: number | null
          campaign_id: number | null
          completed_items: number | null
          connect_rate_pct: number | null
          connected_count: number | null
          cta_accepted: number | null
          cta_considering: number | null
          cta_declined: number | null
          dnc_count: number | null
          list_id: number | null
          list_name: string | null
          list_status: string | null
          negative_calls: number | null
          neutral_calls: number | null
          no_answer_count: number | null
          positive_calls: number | null
          priority_strategy: string | null
          script_id: number | null
          script_title: string | null
          total_attempts: number | null
          total_items: number | null
          unique_contacts_attempted: number | null
          voicemail_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      call_outcome_summary: {
        Row: {
          campaign_id: number | null
          connected_attempts_with_outcome: number | null
          is_positive: boolean | null
          maps_to_ambition_id: number | null
          name: string | null
          outcome_category: string | null
          outcome_id: number | null
          script_id: number | null
          times_recorded: number | null
          unique_contacts: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_maps_to_ambition_id_fkey"
            columns: ["maps_to_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_maps_to_ambition_id_fkey"
            columns: ["maps_to_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_maps_to_ambition_id_fkey"
            columns: ["maps_to_ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_maps_to_ambition_id_fkey"
            columns: ["maps_to_ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["script_id"]
          },
          {
            foreignKeyName: "call_outcome_definitions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "call_scripts"
            referencedColumns: ["script_id"]
          },
        ]
      }
      call_section_funnel: {
        Row: {
          campaign_id: number | null
          list_id: number | null
          reach_rate_pct: number | null
          reached_count: number | null
          resolved_script_id: number | null
          section_id: number | null
          section_plan_id: number | null
          section_title: string | null
          section_type: string | null
          sort_order: number | null
          total_connected_calls: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      campaign_ambition_progress: {
        Row: {
          campaign_ambition_id: number | null
          campaign_id: number | null
          category: string | null
          current_value: string | null
          current_value_overridden: boolean | null
          label: string | null
          linked_stage_achievement_pct: number | null
          linked_stage_ambition_achieved_count: number | null
          linked_stage_ambition_count: number | null
          subcategory: string | null
          target_date: string | null
          target_unit: string | null
          target_value: string | null
          target_value_max: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_ambitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_ou_coverage_summary: {
        Row: {
          campaign_id: number | null
          ous_with_activist: number | null
          ous_with_anchor: number | null
          ous_with_contact: number | null
          ous_with_delegate: number | null
          sized_ous: number | null
          total_assigned_workers: number | null
          total_estimated_workers: number | null
          total_ous: number | null
        }
        Relationships: []
      }
      campaign_permissions_detail: {
        Row: {
          campaign_id: number | null
          campaign_name: string | null
          granted_at: string | null
          granted_by: string | null
          granted_by_name: string | null
          granted_by_organiser_id: number | null
          granted_to: string | null
          granted_to_name: string | null
          granted_to_organiser_id: number | null
          is_persistent: boolean | null
          permission_id: number | null
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_edit_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "user_profiles_organiser_id_fkey"
            columns: ["granted_by_organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
          {
            foreignKeyName: "user_profiles_organiser_id_fkey"
            columns: ["granted_to_organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
        ]
      }
      campaign_stage_workplan_progress: {
        Row: {
          blocked_tasks: number | null
          campaign_id: number | null
          cancelled_tasks: number | null
          completed_tasks: number | null
          completion_pct: number | null
          in_progress_tasks: number | null
          plan_ambition_id: number | null
          planned_tasks: number | null
          stage_number: number | null
          total_tasks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_activity_contribution"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "ambition_progress"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "plan_ambitions"
            referencedColumns: ["ambition_id"]
          },
          {
            foreignKeyName: "campaign_stage_workplan_tasks_plan_ambition_id_fkey"
            columns: ["plan_ambition_id"]
            isOneToOne: false
            referencedRelation: "worker_ambition_rating"
            referencedColumns: ["plan_ambition_id"]
          },
        ]
      }
      campaign_unit_assignment_summary: {
        Row: {
          allocated_worker_count: number | null
          campaign_id: number | null
          is_group_container: boolean | null
          ou_group_id: number | null
          ou_id: number | null
          ou_name: string | null
          ou_type: string | null
          parent_ou_id: number | null
          total_workers_estimated: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_organising_units_ou_group_id_fkey"
            columns: ["ou_group_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_ou_group_id_fkey"
            columns: ["ou_group_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_ou_group_id_fkey"
            columns: ["ou_group_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_ou_group_id_fkey"
            columns: ["ou_group_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_ou_group_id_fkey"
            columns: ["ou_group_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_unit_hierarchy_summary: {
        Row: {
          aggregate_assigned_workers: number | null
          campaign_id: number | null
          child_count: number | null
          child_ou_ids: number[] | null
          parent_name: string | null
          parent_ou_id: number | null
          parent_ou_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      campaign_worker_rating_summary: {
        Row: {
          campaign_id: number | null
          cumulative_rating: number | null
          has_supportive_activity_rating: boolean | null
          last_activity_rating: number | null
          supportive_activity_count: number | null
          worker_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaign_worker_unit_membership_summary: {
        Row: {
          campaign_id: number | null
          is_multi_unit_member: boolean | null
          unit_count: number | null
          worker_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      campaigns_view: {
        Row: {
          action_count: number | null
          campaign_id: number | null
          campaign_type: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          name: string | null
          notes: string | null
          organiser_id: number | null
          organiser_name: string | null
          start_date: string | null
          status: string | null
          universe_count: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organiser_id_fkey"
            columns: ["organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
        ]
      }
      employers_view: {
        Row: {
          abn: string | null
          address: string | null
          agreement_count: number | null
          created_at: string | null
          email: string | null
          employer_category: string | null
          employer_id: number | null
          employer_name: string | null
          is_active: boolean | null
          parent_company: string | null
          phone: string | null
          postcode: string | null
          sector_names: string | null
          state: string | null
          trading_name: string | null
          updated_at: string | null
          website: string | null
          worker_count: number | null
          worksite_count: number | null
        }
        Insert: {
          abn?: string | null
          address?: string | null
          agreement_count?: never
          created_at?: string | null
          email?: string | null
          employer_category?: string | null
          employer_id?: number | null
          employer_name?: string | null
          is_active?: boolean | null
          parent_company?: string | null
          phone?: string | null
          postcode?: string | null
          sector_names?: never
          state?: string | null
          trading_name?: string | null
          updated_at?: string | null
          website?: string | null
          worker_count?: never
          worksite_count?: never
        }
        Update: {
          abn?: string | null
          address?: string | null
          agreement_count?: never
          created_at?: string | null
          email?: string | null
          employer_category?: string | null
          employer_id?: number | null
          employer_name?: string | null
          is_active?: boolean | null
          parent_company?: string | null
          phone?: string | null
          postcode?: string | null
          sector_names?: never
          state?: string | null
          trading_name?: string | null
          updated_at?: string | null
          website?: string | null
          worker_count?: never
          worksite_count?: never
        }
        Relationships: []
      }
      gate_criteria_with_status: {
        Row: {
          assessed_at: string | null
          assessed_by: string | null
          calculation_mode: string | null
          calculation_source: string | null
          campaign_id: number | null
          campaign_name: string | null
          created_at: string | null
          criterion_id: number | null
          criterion_name: string | null
          current_value: string | null
          description: string | null
          evidence_notes: string | null
          freshness_status: string | null
          gate_id: number | null
          gate_name: string | null
          gate_number: number | null
          is_hard_gate: boolean | null
          is_met: boolean | null
          last_calculated_at: string | null
          metric_type: string | null
          sort_order: number | null
          target_value: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_criteria_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "gate_definitions"
            referencedColumns: ["gate_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "gate_definitions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      organising_universe_view: {
        Row: {
          agreement_expiry: string | null
          agreement_id: number | null
          agreement_name: string | null
          agreement_scope: string | null
          agreement_short_name: string | null
          agreement_status: string | null
          employer_category: string | null
          employer_id: number | null
          employer_name: string | null
          is_offshore: boolean | null
          parent_employer_id: number | null
          parent_worksite_id: number | null
          parent_worksite_name: string | null
          principal_employer_id: number | null
          principal_employer_name: string | null
          project_id: number | null
          project_name: string | null
          project_status: string | null
          sector_id: number | null
          sector_name: string | null
          work_type: string | null
          worker_count: number | null
          worksite_id: number | null
          worksite_name: string | null
          worksite_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "employers_parent_employer_id_fkey"
            columns: ["parent_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employers_parent_employer_id_fkey"
            columns: ["parent_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employers_parent_employer_id_fkey"
            columns: ["parent_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      pending_permission_requests: {
        Row: {
          campaign_id: number | null
          campaign_name: string | null
          reason: string | null
          request_id: number | null
          requested_at: string | null
          requested_by: string | null
          requested_by_email: string | null
          requested_by_name: string | null
          requested_by_organiser_id: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_permission_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "user_profiles_organiser_id_fkey"
            columns: ["requested_by_organiser_id"]
            isOneToOne: false
            referencedRelation: "organisers"
            referencedColumns: ["organiser_id"]
          },
        ]
      }
      principal_employer_eba_summary: {
        Row: {
          count_12_24m: number | null
          count_6_12m: number | null
          count_expired: number | null
          count_first_bargaining: number | null
          count_gt_24m: number | null
          count_lt_6m: number | null
          count_no_eba: number | null
          pct_12_24m: number | null
          pct_6_12m: number | null
          pct_expired: number | null
          pct_first_bargaining: number | null
          pct_gt_24m: number | null
          pct_lt_6m: number | null
          pct_no_eba: number | null
          principal_employer_id: number | null
          principal_employer_name: string | null
          total_pairs: number | null
        }
        Relationships: []
      }
      v_bargaining_progress: {
        Row: {
          active_pia_count: number | null
          bargaining_commenced_at: string | null
          campaign_id: number | null
          campaign_name: string | null
          current_phase: string | null
          intractable_days_elapsed: number | null
          intractable_status: string | null
          last_strength_assessed_at: string | null
          last_strength_verdict: string | null
          latest_pabo_status: string | null
          latest_vote_outcome: string | null
          open_decision_count: number | null
        }
        Relationships: []
      }
      v_campaign_activist_register: {
        Row: {
          campaign_id: number | null
          created_at: string | null
          current_rating: number | null
          current_rung: number | null
          current_task_due: string | null
          current_task_id: number | null
          current_task_responsibility: string | null
          current_task_rung: number | null
          current_task_status: string | null
          domain: string | null
          followers_evidence: string | null
          four_a_stage: string | null
          identified_via: string | null
          is_archived: boolean | null
          is_bargaining_rep: boolean | null
          is_hsr: boolean | null
          last_contact_date: string | null
          member_role_type_id: number | null
          next_contact_date: string | null
          notes: string | null
          profile_id: number | null
          recruited_at: string | null
          recruited_by: string | null
          recruited_by_text: string | null
          role_display_name: string | null
          role_name: string | null
          skab_notes: string | null
          source: string | null
          union_membership_type: string | null
          updated_at: string | null
          woc_ids: number[] | null
          woc_names: string[] | null
          worker_id: number | null
          worker_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_activist_profiles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "workers_member_role_type_id_fkey"
            columns: ["member_role_type_id"]
            isOneToOne: false
            referencedRelation: "member_role_types"
            referencedColumns: ["role_type_id"]
          },
        ]
      }
      v_campaign_coverage_map: {
        Row: {
          assigned_workers: number | null
          campaign_id: number | null
          coverage_status: string | null
          density: number | null
          is_group_container: boolean | null
          leader_name: string | null
          leader_rating: number | null
          leader_worker_id: number | null
          member_count: number | null
          ou_id: number | null
          ou_name: string | null
          ou_type: string | null
          parent_ou_id: number | null
          priority_action: string | null
          reachable_48h: boolean | null
          second_name: string | null
          second_worker_id: number | null
          total_workers_estimated: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_leader_worker_id_fkey"
            columns: ["leader_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_second_worker_id_fkey"
            columns: ["second_worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_second_worker_id_fkey"
            columns: ["second_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_ou_coverage_second_worker_id_fkey"
            columns: ["second_worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      v_campaign_coverage_summary: {
        Row: {
          campaign_id: number | null
          members: number | null
          overall_density: number | null
          units_covered: number | null
          units_gap: number | null
          units_leader_no_second: number | null
          units_mapped: number | null
          workers_mapped: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      v_campaign_foundational_readiness: {
        Row: {
          campaign_id: number | null
          ous_missing_leaders: number | null
          universe_size: number | null
          workers_allocated: number | null
          workers_with_contact: number | null
          workers_with_rating: number | null
        }
        Insert: {
          campaign_id?: number | null
          ous_missing_leaders?: never
          universe_size?: never
          workers_allocated?: never
          workers_with_contact?: never
          workers_with_rating?: never
        }
        Update: {
          campaign_id?: number | null
          ous_missing_leaders?: never
          universe_size?: never
          workers_allocated?: never
          workers_with_contact?: never
          workers_with_rating?: never
        }
        Relationships: []
      }
      v_campaign_section_stage_coverage: {
        Row: {
          any_confirmed: boolean | null
          avg_confidence: number | null
          campaign_id: number | null
          section_name: string | null
          section_plan_id: number | null
          section_status: string | null
          stage_number: number | null
          subject_count: number | null
          subject_kinds: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      v_intractable_state: {
        Row: {
          arbitration_outcome_recorded_at: string | null
          bargaining_commenced_at: string | null
          campaign_id: number | null
          days_elapsed: number | null
          days_remaining_to_threshold: number | null
          headline: string | null
          intractable_application_filed_at: string | null
          intractable_declaration_made_at: string | null
          last_reviewed_at: string | null
          nine_month_threshold_at: string | null
          notes: string | null
          state: string | null
          state_label: string | null
        }
        Insert: {
          arbitration_outcome_recorded_at?: string | null
          bargaining_commenced_at?: string | null
          campaign_id?: number | null
          days_elapsed?: never
          days_remaining_to_threshold?: never
          headline?: never
          intractable_application_filed_at?: string | null
          intractable_declaration_made_at?: string | null
          last_reviewed_at?: string | null
          nine_month_threshold_at?: string | null
          notes?: string | null
          state?: string | null
          state_label?: never
        }
        Update: {
          arbitration_outcome_recorded_at?: string | null
          bargaining_commenced_at?: string | null
          campaign_id?: number | null
          days_elapsed?: never
          days_remaining_to_threshold?: never
          headline?: never
          intractable_application_filed_at?: string | null
          intractable_declaration_made_at?: string | null
          last_reviewed_at?: string | null
          nine_month_threshold_at?: string | null
          notes?: string | null
          state?: string | null
          state_label?: never
        }
        Relationships: [
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "intractable_bargaining_tracker_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      v_pia_participation_by_action: {
        Row: {
          action_id: number | null
          action_starts_at: string | null
          action_type: string | null
          campaign_id: number | null
          escalation_level: number | null
          is_concluded: boolean | null
          participation_rate: number | null
          percent_membership: number | null
          total_participated: number | null
          total_pledged: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "pia_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      v_section_plan_soc_recording_grid: {
        Row: {
          activity_event_id: number | null
          campaign_id: number | null
          current_rating: number | null
          member_role_type_id: number | null
          member_status_confirmed: string | null
          no_vote_rating: number | null
          notes: string | null
          pabo_rating: number | null
          recorded_at: string | null
          section_plan_id: number | null
          soc_id: number | null
          soc_kind: Database["public"]["Enums"]["section_plan_soc_kind"] | null
          soc_name: string | null
          worker_id: number | null
          worker_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "section_plan_soc_recordings_activity_event_id_fkey"
            columns: ["activity_event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "workers_member_role_type_id_fkey"
            columns: ["member_role_type_id"]
            isOneToOne: false
            referencedRelation: "member_role_types"
            referencedColumns: ["role_type_id"]
          },
        ]
      }
      v_section_plan_summary: {
        Row: {
          activities_count: number | null
          ambitions_count: number | null
          campaign_id: number | null
          capacities_count: number | null
          end_date: string | null
          name: string | null
          section_plan_id: number | null
          start_date: string | null
          status: string | null
          theories_count: number | null
          timeframe_kind:
            | Database["public"]["Enums"]["section_plan_timeframe_kind"]
            | null
          wtp_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "section_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      v_section_plan_workforce_mapping: {
        Row: {
          campaign_id: number | null
          density_pct: number | null
          members_count: number | null
          non_member_count: number | null
          total_workers_estimated: number | null
          unrated_count: number | null
          workers_count: number | null
          worksite_name: string | null
          worksite_ou_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      v_section_plan_workplan: {
        Row: {
          activity_id: number | null
          activity_kind: string | null
          activity_label: string | null
          activity_title: string | null
          calls_target: number | null
          completed_count: number | null
          day_of_week: number | null
          notes: string | null
          outcomes_summary: string | null
          section_plan_id: number | null
          target_date: string | null
          target_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "section_plan_workplan_targets_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "section_plan_workplan_targets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_workplan_targets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_workplan_targets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "section_plan_workplan_targets_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
        ]
      }
      v_strength_assessment_inputs: {
        Row: {
          campaign_id: number | null
          eligible_count: number | null
          neutral_count: number | null
          opposed_count: number | null
          oppositional_count: number | null
          overall_supportive_pct: number | null
          supporter_count: number | null
          supportive_leader_count: number | null
          total_ambition_universe: number | null
          total_supportive: number | null
          total_unassessed: number | null
          unassessed_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_worker_membership_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      v_woc_unit_representation: {
        Row: {
          campaign_id: number | null
          member_count: number | null
          ou_id: number | null
          ou_name: string | null
          parent_ou_id: number | null
          represented: boolean | null
          woc_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_organising_units_parent_ou_id_fkey"
            columns: ["parent_ou_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_wocs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      v_worker_escalation_tier: {
        Row: {
          campaign_id: number | null
          current_tier: number | null
          last_action_at: string | null
          last_action_type: string | null
          next_recommended_ask: string | null
          worker_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activity_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_activity_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_activity_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
        ]
      }
      vw_call_action_report: {
        Row: {
          assessment_ratings: Json | null
          attempt_id: number | null
          call_disposition: string | null
          campaign_id: number | null
          campaign_unit_id: number | null
          campaign_unit_name: string | null
          cta_response: string | null
          details_updated: boolean | null
          dial_disposition: string | null
          first_name: string | null
          issue_count: number | null
          last_name: string | null
          list_id: number | null
          list_name: string | null
          membership_status: string | null
          objection_count: number | null
          outcome_classification: string | null
          removed_from_campaign: boolean | null
          script_id: number | null
          script_title: string | null
          section_plan_id: number | null
          started_at: string | null
          support_level_assessed: string | null
          worker_id: number | null
          worksite_id: number | null
          worksite_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "section_plans"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_section_stage_coverage"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "call_lists_section_plan_id_fkey"
            columns: ["section_plan_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_summary"
            referencedColumns: ["section_plan_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["campaign_unit_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["campaign_unit_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_assignment_summary"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["campaign_unit_id"]
            isOneToOne: false
            referencedRelation: "campaign_unit_hierarchy_summary"
            referencedColumns: ["parent_ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["campaign_unit_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_coverage_map"
            referencedColumns: ["ou_id"]
          },
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["campaign_unit_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_workforce_mapping"
            referencedColumns: ["worksite_ou_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      vw_campaign_worker_call_status: {
        Row: {
          campaign_id: number | null
          last_attempt_at: string | null
          last_attempt_id: number | null
          last_call_disposition: string | null
          last_caller_session_label: string | null
          last_caller_user_id: string | null
          last_dial_disposition: string | null
          last_outcome_classification: string | null
          list_id: number | null
          list_name: string | null
          worker_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "call_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_campaign_summary"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_lists"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "call_section_funnel"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "vw_call_action_report"
            referencedColumns: ["list_id"]
          },
          {
            foreignKeyName: "call_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_list_items_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "call_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      vw_campaign_worker_list_activity: {
        Row: {
          added_at: string | null
          campaign_id: number | null
          channel: string | null
          item_status: string | null
          list_id: number | null
          list_name: string | null
          list_status: string | null
          worker_id: number | null
        }
        Relationships: []
      }
      vw_email_campaign_summary: {
        Row: {
          blackout_override: boolean | null
          bounced_count: number | null
          campaign_id: number | null
          created_at: string | null
          delivered_count: number | null
          delivered_items: number | null
          delivery_rate_pct: number | null
          draft_id: number | null
          failed_count: number | null
          failed_items: number | null
          item_count: number | null
          list_id: number | null
          list_name: string | null
          list_status: string | null
          opted_out_count: number | null
          pending_count: number | null
          queued_count: number | null
          scheduled_for: string | null
          sending_count: number | null
          sent_count: number | null
          sent_items: number | null
          skipped_count: number | null
          timezone: string | null
          total_items: number | null
          unsubscribed_count: number | null
          wrapper_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "email_lists_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "campaign_comms_drafts"
            referencedColumns: ["draft_id"]
          },
          {
            foreignKeyName: "email_lists_wrapper_id_fkey"
            columns: ["wrapper_id"]
            isOneToOne: false
            referencedRelation: "email_wrappers"
            referencedColumns: ["wrapper_id"]
          },
        ]
      }
      vw_sms_assessment_report: {
        Row: {
          binary_count: number | null
          campaign_id: number | null
          first_rated_at: string | null
          last_rated_at: string | null
          ratings_count: number | null
          scale_count: number | null
          source: string | null
          workers_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_activities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      vw_sms_ballot_tally: {
        Row: {
          parsed_value: string | null
          qtype: string | null
          question_id: number | null
          sort_order: number | null
          survey_id: number | null
          vote_count: number | null
        }
        Relationships: []
      }
      vw_sms_campaign_rollup: {
        Row: {
          active_conversation_count: number | null
          blast_count: number | null
          campaign_id: number | null
          conversation_count: number | null
          conversations_with_reply: number | null
          delivered_count: number | null
          delivery_rate_pct: number | null
          failed_count: number | null
          inbound_reply_count: number | null
          opt_outs_count: number | null
          reply_rate_pct: number | null
          sends_count: number | null
          survey_count: number | null
          surveys_completed_count: number | null
        }
        Relationships: []
      }
      vw_sms_campaign_summary: {
        Row: {
          blackout_override: boolean | null
          blocked_count: number | null
          campaign_id: number | null
          created_at: string | null
          delivered_count: number | null
          delivered_items: number | null
          delivery_rate_pct: number | null
          draft_id: number | null
          failed_count: number | null
          failed_items: number | null
          item_count: number | null
          list_id: number | null
          list_name: string | null
          list_status: string | null
          mode: string | null
          opted_out_count: number | null
          pending_count: number | null
          queued_count: number | null
          scheduled_for: string | null
          sender_number_id: number | null
          sending_count: number | null
          sent_count: number | null
          sent_items: number | null
          skipped_count: number | null
          timezone: string | null
          total_items: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "campaign_comms_drafts"
            referencedColumns: ["draft_id"]
          },
          {
            foreignKeyName: "sms_lists_sender_number_id_fkey"
            columns: ["sender_number_id"]
            isOneToOne: false
            referencedRelation: "sms_numbers"
            referencedColumns: ["number_id"]
          },
        ]
      }
      vw_sms_chat_session_report: {
        Row: {
          assessments_recorded: number | null
          campaign_id: number | null
          conversations_closed: number | null
          conversations_responded: number | null
          created_at: string | null
          created_by: string | null
          list_id: number | null
          median_first_reply_seconds: number | null
          name: string | null
          openers_sent: number | null
          replies_received: number | null
          response_rate_pct: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_lists_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      vw_sms_sender_stats: {
        Row: {
          ai_assisted_count: number | null
          campaign_id: number | null
          conversations: number | null
          median_reply_latency_seconds: number | null
          replies_sent: number | null
          sender_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      vw_sms_survey_answer_distribution: {
        Row: {
          answer_count: number | null
          completed_answer_count: number | null
          parsed_value: string | null
          qtype: string | null
          question_id: number | null
          sort_order: number | null
          survey_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "sms_surveys"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_ballot_tally"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_funnel"
            referencedColumns: ["survey_id"]
          },
        ]
      }
      vw_sms_survey_funnel: {
        Row: {
          active_count: number | null
          campaign_id: number | null
          completed_count: number | null
          ever_invited_count: number | null
          expired_count: number | null
          handed_off_count: number | null
          invited_count: number | null
          opted_out_count: number | null
          queued_count: number | null
          started_count: number | null
          survey_id: number | null
          total_sessions: number | null
          undeliverable_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "sms_surveys_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
        ]
      }
      vw_sms_survey_question_stats: {
        Row: {
          answered_count: number | null
          invalid_attempts: number | null
          qtype: string | null
          question_id: number | null
          sort_order: number | null
          survey_id: number | null
          unparsed_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "sms_surveys"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_ballot_tally"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "sms_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_survey_funnel"
            referencedColumns: ["survey_id"]
          },
        ]
      }
      worker_ambition_rating: {
        Row: {
          binary_value: string | null
          campaign_id: number | null
          event_id: number | null
          plan_ambition_id: number | null
          rated_at: string | null
          rating: number | null
          rating_phase: string | null
          source: string | null
          source_activity_id: number | null
          worker_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activity_ratings_activity_id_fkey"
            columns: ["source_activity_id"]
            isOneToOne: false
            referencedRelation: "campaign_activities"
            referencedColumns: ["activity_id"]
          },
          {
            foreignKeyName: "campaign_activity_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_section_plan_soc_recording_grid"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_activity_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_activity_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers_view"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_ou_coverage_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns_view"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_bargaining_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_foundational_readiness"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "vw_sms_campaign_rollup"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_activities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_entities"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaign_progress"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_campaigns_by_stage"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_stage_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "workload_dashboard_summary"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "car_event_id_fk"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["event_id"]
          },
        ]
      }
      workers_view: {
        Row: {
          action_network_id: string | null
          address: string | null
          canonical_occupation_id: number | null
          classification: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          employer_id: number | null
          employer_name: string | null
          first_name: string | null
          gender: string | null
          is_active: boolean | null
          is_bargaining_rep: boolean | null
          is_hsr: boolean | null
          is_offshore: boolean | null
          join_date: string | null
          last_name: string | null
          member_number: string | null
          member_role_display: string | null
          member_role_type_id: number | null
          non_oa_union_badge_initials: string | null
          non_oa_union_display_name: string | null
          non_oa_union_option_id: number | null
          notes: string | null
          occupation: string | null
          phone: string | null
          postcode: string | null
          preferred_name: string | null
          project_id: number | null
          project_name: string | null
          project_status: string | null
          reference_id: string | null
          rejoin_date: string | null
          resignation_date: string | null
          resignation_reason: string | null
          state: string | null
          suburb: string | null
          union_code: string | null
          union_id: number | null
          union_membership_display: string | null
          union_membership_type_id: number | null
          union_name: string | null
          updated_at: string | null
          work_type: string | null
          worker_id: number | null
          worksite_id: number | null
          worksite_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_canonical_occupation_id_fkey"
            columns: ["canonical_occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["occupation_id"]
          },
          {
            foreignKeyName: "workers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "workers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "workers_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "workers_member_role_type_id_fkey"
            columns: ["member_role_type_id"]
            isOneToOne: false
            referencedRelation: "member_role_types"
            referencedColumns: ["role_type_id"]
          },
          {
            foreignKeyName: "workers_non_oa_union_option_id_fkey"
            columns: ["non_oa_union_option_id"]
            isOneToOne: false
            referencedRelation: "non_oa_union_options"
            referencedColumns: ["non_oa_union_option_id"]
          },
          {
            foreignKeyName: "workers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "workers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "workers_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["union_id"]
          },
          {
            foreignKeyName: "workers_union_membership_type_id_fkey"
            columns: ["union_membership_type_id"]
            isOneToOne: false
            referencedRelation: "union_membership_types"
            referencedColumns: ["union_membership_type_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "workers_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
        ]
      }
      workload_campaign_activities: {
        Row: {
          active_stage_plans: number | null
          campaign_id: number | null
          campaign_name: string | null
          campaign_status: string | null
          campaign_type: string | null
          in_progress_actions: number | null
          pending_gate_assessments: number | null
          recent_actions: Json | null
          total_activities_underway: number | null
        }
        Insert: {
          active_stage_plans?: never
          campaign_id?: number | null
          campaign_name?: string | null
          campaign_status?: string | null
          campaign_type?: string | null
          in_progress_actions?: never
          pending_gate_assessments?: never
          recent_actions?: never
          total_activities_underway?: never
        }
        Update: {
          active_stage_plans?: never
          campaign_id?: number | null
          campaign_name?: string | null
          campaign_status?: string | null
          campaign_type?: string | null
          in_progress_actions?: never
          pending_gate_assessments?: never
          recent_actions?: never
          total_activities_underway?: never
        }
        Relationships: []
      }
      workload_campaign_entities: {
        Row: {
          campaign_id: number | null
          campaign_name: string | null
          campaign_status: string | null
          campaign_type: string | null
          employer_count: number | null
          leader_count: number | null
          worker_count: number | null
          worksite_count: number | null
        }
        Insert: {
          campaign_id?: number | null
          campaign_name?: string | null
          campaign_status?: string | null
          campaign_type?: string | null
          employer_count?: never
          leader_count?: never
          worker_count?: never
          worksite_count?: never
        }
        Update: {
          campaign_id?: number | null
          campaign_name?: string | null
          campaign_status?: string | null
          campaign_type?: string | null
          employer_count?: never
          leader_count?: never
          worker_count?: never
          worksite_count?: never
        }
        Relationships: []
      }
      workload_campaign_progress: {
        Row: {
          campaign_id: number | null
          campaign_name: string | null
          campaign_status: string | null
          campaign_type: string | null
          gate_progress_details: Json | null
          met_criteria: number | null
          overall_progress_percentage: number | null
          pending_assessments: number | null
          total_criteria: number | null
        }
        Relationships: []
      }
      workload_campaigns_by_stage: {
        Row: {
          campaign_id: number | null
          campaign_name: string | null
          campaign_status: string | null
          campaign_type: string | null
          created_by: string | null
          current_stage_name: string | null
          current_stage_number: number | null
          is_due_soon: boolean | null
          is_overdue: boolean | null
          planned_end_date: string | null
          planned_start_date: string | null
          stage_display_status: string | null
          stage_status: string | null
        }
        Relationships: []
      }
      workload_dashboard_summary: {
        Row: {
          active_stage_plans: number | null
          campaign_id: number | null
          campaign_name: string | null
          campaign_status: string | null
          campaign_type: string | null
          created_at: string | null
          created_by: string | null
          current_stage_name: string | null
          current_stage_number: number | null
          employer_count: number | null
          in_progress_actions: number | null
          is_due_soon: boolean | null
          is_overdue: boolean | null
          leader_count: number | null
          met_criteria: number | null
          overall_progress_percentage: number | null
          pending_assessments: number | null
          pending_gate_assessments: number | null
          stage_display_status: string | null
          total_activities_underway: number | null
          total_criteria: number | null
          worker_count: number | null
          worksite_count: number | null
        }
        Relationships: []
      }
      worksite_employer_eba_status: {
        Row: {
          eba_status_category: string | null
          employer_id: number | null
          employer_name: string | null
          has_bargaining: boolean | null
          has_current: boolean | null
          has_expired: boolean | null
          max_current_expiry: string | null
          parent_employer_id: number | null
          principal_employer_id: number | null
          principal_employer_name: string | null
          worksite_id: number | null
          worksite_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_worksite_id_fkey"
            columns: ["worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "employers_parent_employer_id_fkey"
            columns: ["parent_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employers_parent_employer_id_fkey"
            columns: ["parent_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employers_parent_employer_id_fkey"
            columns: ["parent_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      worksite_hierarchy_report_rows: {
        Row: {
          geo: string | null
          hierarchy_path_geo_service: string | null
          hierarchy_path_producer_geo: string | null
          producer_name: string | null
          provider_employer_id: number | null
          provider_name: string | null
          provider_roles: string | null
          scope_names: string | null
          service_type: string | null
          worksite_id: number | null
          worksite_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["provider_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["provider_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["provider_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      worksite_hierarchy_report_rows_mv: {
        Row: {
          geo: string | null
          hierarchy_path_geo_service: string | null
          hierarchy_path_producer_geo: string | null
          producer_name: string | null
          provider_employer_id: number | null
          provider_name: string | null
          provider_roles: string | null
          scope_names: string | null
          service_type: string | null
          worksite_id: number | null
          worksite_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["provider_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["provider_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "employer_worksite_roles_employer_id_fkey"
            columns: ["provider_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
      worksites_view: {
        Row: {
          agreement_count: number | null
          basin: string | null
          created_at: string | null
          is_active: boolean | null
          is_offshore: boolean | null
          latitude: number | null
          location_description: string | null
          longitude: number | null
          notes: string | null
          operator_id: number | null
          operator_name: string | null
          parent_worksite_id: number | null
          parent_worksite_name: string | null
          principal_employer_id: number | null
          principal_employer_name: string | null
          project_count: number | null
          updated_at: string | null
          worker_count: number | null
          worksite_id: number | null
          worksite_name: string | null
          worksite_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worksites_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "organising_universe_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksite_hierarchy_report_rows_mv"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_parent_worksite_id_fkey"
            columns: ["parent_worksite_id"]
            isOneToOne: false
            referencedRelation: "worksites_view"
            referencedColumns: ["worksite_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "employers_view"
            referencedColumns: ["employer_id"]
          },
          {
            foreignKeyName: "worksites_principal_employer_id_fkey"
            columns: ["principal_employer_id"]
            isOneToOne: false
            referencedRelation: "principal_employer_eba_summary"
            referencedColumns: ["principal_employer_id"]
          },
        ]
      }
    }
    Functions: {
      apply_call_outcome_side_effects: {
        Args: {
          p_attempt_id: number
          p_campaign_id: number
          p_worker_id: number
        }
        Returns: undefined
      }
      apply_employer_wizard_changes: { Args: { payload: Json }; Returns: Json }
      apply_participation_import: {
        Args: {
          p_activity_id: number
          p_actor_id?: string
          p_import_batch_id?: number
          p_rating_phase?: string
          p_rows: Json
          p_source?: string
        }
        Returns: number
      }
      archive_old_import_logs: { Args: never; Returns: Json }
      assign_sms_number: {
        Args: {
          p_number_id: number
          p_organiser_id?: number
          p_purpose: string
        }
        Returns: undefined
      }
      begin_bargaining_phase: {
        Args: {
          p_bargaining_commenced_at: string
          p_campaign_id: number
          p_carryforward_ambition_ids: number[]
          p_carryforward_situation_analysis_id: number
          p_claim_summary: string
          p_pia_seed_pack: string
          p_setup_mode: string
          p_situation_overrides: Json
        }
        Returns: Json
      }
      cache_ai_response: {
        Args: {
          p_cost_usd?: number
          p_model_name: string
          p_model_version?: string
          p_prompt: string
          p_response: Json
          p_tokens_used?: number
          p_ttl_hours?: number
        }
        Returns: number
      }
      calculate_active_wocs: {
        Args: { p_agreement_id: number }
        Returns: number
      }
      calculate_contact_details_verified: {
        Args: { p_agreement_id: number }
        Returns: number
      }
      calculate_membership_density: {
        Args: { p_agreement_id: number }
        Returns: number
      }
      campaign_fact_enum_values: {
        Args: { p_options: Json }
        Returns: string[]
      }
      can_write_to_campaign: {
        Args: { p_campaign_id: number }
        Returns: boolean
      }
      check_rate_limit: {
        Args: { p_endpoint?: string; p_user_id: string }
        Returns: Json
      }
      claim_next_call_list_item: {
        Args: {
          p_claim_ttl_seconds?: number
          p_list_id: number
          p_session_label: string
          p_session_worker_id?: number
          p_share_token_id?: number
        }
        Returns: number
      }
      claim_next_call_list_item_for_share: {
        Args: {
          p_claim_ttl_seconds?: number
          p_list_id: number
          p_session_label: string
          p_session_worker_id?: number
          p_share_token_id?: number
        }
        Returns: number
      }
      claim_sms_conversation: {
        Args: { p_conversation_id: number; p_ttl_minutes?: number }
        Returns: boolean
      }
      cleanup_old_rate_limit_usage: { Args: never; Returns: number }
      clear_all_ai_cache: { Args: never; Returns: number }
      clear_expired_ai_cache: { Args: never; Returns: number }
      confirm_upcoming_project_match: {
        Args: { payload: Json }
        Returns: {
          candidate_proposals: Json
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          employer_id: number | null
          id: number
          is_primary: boolean
          match_method: string | null
          match_score: number | null
          match_status: string
          notes: string | null
          role_type: string
          upcoming_project_id: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "upcoming_project_employers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_call_list_from_activity: {
        Args: { p_activity_id: number }
        Returns: number
      }
      delete_campaign: { Args: { p_campaign_id: number }; Returns: undefined }
      delete_old_import_logs: { Args: never; Returns: Json }
      deny_campaign_edit_permission: {
        Args: { p_request_id: number; p_response_reason?: string }
        Returns: Json
      }
      derive_au_mobile_e164: { Args: { p_raw: string }; Returns: string }
      fn_ensure_activist_profile: {
        Args: { p_campaign_id: number; p_source: string; p_worker_id: number }
        Returns: undefined
      }
      fn_role_type_is_activist_like: {
        Args: { p_role_type_id: number }
        Returns: boolean
      }
      force_release_claims_for_token: {
        Args: { p_token_id: number }
        Returns: Json
      }
      generate_ai_cache_key: {
        Args: { p_model_name: string; p_prompt: string }
        Returns: string
      }
      get_ai_cache_stats: { Args: never; Returns: Json }
      get_cached_ai_response: {
        Args: { p_model_name: string; p_prompt: string }
        Returns: Json
      }
      get_campaign_worker_call_status: {
        Args: { p_campaign_id: number; p_worker_id: number }
        Returns: Json
      }
      get_campaign_workers: {
        Args: { p_campaign_id: number; p_status?: string }
        Returns: Json[]
      }
      get_import_log_retention_status: {
        Args: never
        Returns: {
          metric_details: Json
          metric_name: string
          metric_value: number
        }[]
      }
      get_my_campaign_permissions: {
        Args: never
        Returns: {
          access_type: string
          campaign_id: number
          campaign_name: string
          granted_at: string
          granted_by_name: string
        }[]
      }
      get_p2w_completion_by_plan_ids: {
        Args: { p_plan_ids: number[] }
        Returns: {
          ambitions: boolean
          capacities: boolean
          management: boolean
          plan_id: number
          theory: boolean
          where_to_play: boolean
        }[]
      }
      get_pending_permission_requests: {
        Args: never
        Returns: {
          campaign_id: number
          campaign_name: string
          reason: string
          request_id: number
          requested_at: string
          requested_by_email: string
          requested_by_name: string
        }[]
      }
      get_user_rate_limit_stats: { Args: { p_user_id: string }; Returns: Json }
      get_user_role: { Args: never; Returns: string }
      get_worker_campaigns: { Args: { p_worker_id: number }; Returns: Json[] }
      get_worker_connection_details: {
        Args: { p_connection_id: number }
        Returns: Json
      }
      get_workload_dashboard_data: {
        Args: {
          p_filter_days?: number
          p_filter_organiser?: string
          p_filter_status?: string
        }
        Returns: {
          active_stage_plans: number
          campaign_id: number
          campaign_name: string
          campaign_status: string
          campaign_type: string
          created_by: string
          current_stage_name: string
          current_stage_number: number
          employer_count: number
          in_progress_actions: number
          is_due_soon: boolean
          is_overdue: boolean
          leader_count: number
          met_criteria: number
          overall_progress_percentage: number
          pending_assessments: number
          pending_gate_assessments: number
          stage_display_status: string
          total_activities_underway: number
          total_criteria: number
          worker_count: number
          worksite_count: number
        }[]
      }
      grant_campaign_edit_permission: {
        Args: { p_request_id: number; p_response_reason?: string }
        Returns: Json
      }
      has_campaign_edit_permission: {
        Args: { p_campaign_id: number }
        Returns: boolean
      }
      increment_email_click_count: {
        Args: { p_occurred_at?: string; p_send_id: number }
        Returns: undefined
      }
      increment_email_open_count: {
        Args: { p_occurred_at?: string; p_send_id: number }
        Returns: undefined
      }
      increment_sms_reply_count: {
        Args: { p_received_at?: string; p_send_id: number }
        Returns: undefined
      }
      invalidate_ai_cache: { Args: { p_cache_key: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_to_campaign: {
        Args: { p_campaign_id: number }
        Returns: boolean
      }
      is_campaign_creator: { Args: { p_campaign_id: number }; Returns: boolean }
      is_coordinator_or_lead: { Args: never; Returns: boolean }
      is_lead_organiser_for_campaign: {
        Args: { p_campaign_id: number }
        Returns: boolean
      }
      log_rate_limit_request: {
        Args: {
          p_endpoint: string
          p_ip_address?: unknown
          p_method: string
          p_request_path?: string
          p_status_code: number
          p_user_agent?: string
          p_user_id: string
        }
        Returns: number
      }
      manually_archive_import_logs: {
        Args: { p_days_ago?: number }
        Returns: Json
      }
      match_workers_for_import: {
        Args: {
          p_emails?: string[]
          p_last_names?: string[]
          p_name_keys?: string[]
          p_phones?: string[]
        }
        Returns: {
          email: string
          first_name: string
          last_name: string
          phone: string
          preferred_name: string
          worker_id: number
        }[]
      }
      materialise_sequence_run: { Args: { p_run_id: number }; Returns: number }
      merge_employers: { Args: { payload: Json }; Returns: Json }
      merge_workers: {
        Args: {
          p_actor_id?: string
          p_campaign_id?: number
          p_survivor_id: number
          p_victim_ids: number[]
        }
        Returns: number
      }
      normalise_phone_au: { Args: { p: string }; Returns: string }
      record_assessment_event: {
        Args: {
          p_activity_id: number
          p_actor_id?: string
          p_binary_value?: string
          p_event_id?: number
          p_import_batch_id?: number
          p_notes?: string
          p_rating?: number
          p_rating_phase?: string
          p_source?: string
          p_worker_id: number
        }
        Returns: number
      }
      record_call_attempt: {
        Args: {
          p_action_id?: number
          p_assessment_ratings?: Json
          p_call_disposition?: string
          p_callback_datetime?: string
          p_caller_leader_worker_id?: number
          p_caller_session_label?: string
          p_caller_session_worker_id?: number
          p_caller_user_id: string
          p_cta_ratings?: Json
          p_cta_response?: string
          p_dial_disposition: string
          p_duration_seconds?: number
          p_follow_up_action?: string
          p_issues?: Json
          p_list_item_id: number
          p_objections?: Json
          p_outcome_classification?: string
          p_overall_notes?: string
          p_script_id: number
          p_share_token_id?: number
          p_step_outcomes?: Json
          p_support_level?: string
        }
        Returns: Json
      }
      record_campaign_fact: {
        Args: {
          p_actor_id?: string
          p_campaign_id: number
          p_clear?: boolean
          p_field_id: number
          p_notes?: string
          p_source?: string
          p_source_ref?: string
          p_value_bool?: boolean
          p_value_enum?: string
          p_value_int?: number
          p_value_json?: Json
          p_value_text?: string
          p_worker_id: number
        }
        Returns: number
      }
      refresh_all_pending_gate_criteria: { Args: never; Returns: Json }
      refresh_gate_criteria_for_campaign: {
        Args: { p_campaign_id: number }
        Returns: Json
      }
      refresh_intractable_state: {
        Args: { p_campaign_id: number }
        Returns: string
      }
      refresh_worksite_hierarchy_report_rows_mv: {
        Args: never
        Returns: undefined
      }
      release_call_list_item_claim: {
        Args: { p_item_id: number; p_session_label: string }
        Returns: boolean
      }
      release_sms_conversation: {
        Args: { p_conversation_id: number }
        Returns: boolean
      }
      remap_worker_id: {
        Args: { p_from: number; p_to: number }
        Returns: undefined
      }
      renew_call_list_item_claim: {
        Args: {
          p_claim_ttl_seconds?: number
          p_item_id: number
          p_session_label: string
        }
        Returns: Json
      }
      request_campaign_edit_permission: {
        Args: { p_campaign_id: number; p_reason?: string }
        Returns: Json
      }
      resolve_outcomes_script_id: {
        Args: { p_script_id: number }
        Returns: number
      }
      revoke_campaign_edit_permission: {
        Args: { p_permission_id: number }
        Returns: Json
      }
      run_import_log_retention: { Args: never; Returns: Json }
      section_plan_resolved_agreement_expiry: {
        Args: { p_section_plan_id: number }
        Returns: string
      }
      seed_bargaining_gates: {
        Args: { p_campaign_id: number }
        Returns: undefined
      }
      seed_bargaining_quickstart_activities: {
        Args: { p_campaign_id: number }
        Returns: undefined
      }
      seed_bargaining_woc_template: {
        Args: { p_campaign_id: number }
        Returns: undefined
      }
      seed_campaign_top_issues_from_call: {
        Args: { p_campaign_id: number; p_issues: Json }
        Returns: Json
      }
      seed_pia_pack_offshore_standard: {
        Args: { p_campaign_id: number }
        Returns: undefined
      }
      seed_pia_pack_shore_based_standard: {
        Args: { p_campaign_id: number }
        Returns: undefined
      }
      seed_section_situation_snippet: {
        Args: { p_section_plan_id: number }
        Returns: {
          agreement_expiry_override: string | null
          ai_generated: boolean
          created_at: string
          derived_from_campaign_situation: boolean
          key_event: string | null
          notes: string | null
          section_plan_id: number
          snippet_id: number
          status_summary: string | null
          strategic_context: string | null
          updated_at: string
          workforce_summary: string | null
        }
        SetofOptions: {
          from: "*"
          to: "section_plan_situation_snippets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_ambition_review_due: {
        Args: { p_campaign_id: number }
        Returns: undefined
      }
      set_campaign_phase: {
        Args: { p_campaign_id: number; p_phase: string }
        Returns: undefined
      }
      set_worker_union_membership_pending: {
        Args: {
          p_actor_id?: string
          p_context?: Json
          p_source: string
          p_worker_id: number
        }
        Returns: Json
      }
      skip_call_list_item_for_share: {
        Args: { p_item_id: number; p_list_id: number; p_session_label: string }
        Returns: boolean
      }
      split_campaign_organising_unit: {
        Args: {
          p_assignments: Json
          p_keep_in_parent?: boolean
          p_parent_ou_id: number
          p_sub_units: Json
        }
        Returns: {
          ou_id: number
          sub_index: number
        }[]
      }
      sync_agreement_expired_status_by_date: { Args: never; Returns: number }
      touch_email_conversation_inbound: {
        Args: { p_conversation_id: number; p_occurred_at?: string }
        Returns: undefined
      }
      touch_email_conversation_outbound: {
        Args: { p_conversation_id: number; p_occurred_at?: string }
        Returns: undefined
      }
      touch_sms_conversation_inbound: {
        Args: { p_conversation_id: number; p_occurred_at?: string }
        Returns: undefined
      }
      touch_sms_conversation_outbound: {
        Args: { p_conversation_id: number; p_occurred_at?: string }
        Returns: undefined
      }
      transition_to_post_settlement: {
        Args: { p_campaign_id: number }
        Returns: Json
      }
    }
    Enums: {
      campaign_phase_enum:
        | "preparing_to_bargain"
        | "bargaining_to_win"
        | "post_settlement"
        | "standalone_activities"
      section_plan_soc_kind: "members_general" | "bargaining_reps"
      section_plan_timeframe_kind:
        | "user_set"
        | "user_set_firm"
        | "hard_external_deadline"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      campaign_phase_enum: [
        "preparing_to_bargain",
        "bargaining_to_win",
        "post_settlement",
        "standalone_activities",
      ],
      section_plan_soc_kind: ["members_general", "bargaining_reps"],
      section_plan_timeframe_kind: [
        "user_set",
        "user_set_firm",
        "hard_external_deadline",
      ],
    },
  },
} as const
