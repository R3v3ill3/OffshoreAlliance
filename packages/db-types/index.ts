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
      campaign_activities: {
        Row: {
          activity_id: number
          activity_kind: string
          campaign_id: number
          created_at: string
          description: string | null
          is_binary: boolean
          is_custom: boolean
          supporter_outcome_value: string | null
          template_key: string | null
          title: string
        }
        Insert: {
          activity_id?: number
          activity_kind?: string
          campaign_id: number
          created_at?: string
          description?: string | null
          is_binary?: boolean
          is_custom?: boolean
          supporter_outcome_value?: string | null
          template_key?: string | null
          title: string
        }
        Update: {
          activity_id?: number
          activity_kind?: string
          campaign_id?: number
          created_at?: string
          description?: string | null
          is_binary?: boolean
          is_custom?: boolean
          supporter_outcome_value?: string | null
          template_key?: string | null
          title?: string
        }
        Relationships: [
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
      campaign_activity_ratings: {
        Row: {
          activity_id: number
          binary_value: string | null
          notes: string | null
          rated_at: string
          rated_by_user_id: string | null
          rating: number
          rating_id: number
          source: string
          worker_id: number
        }
        Insert: {
          activity_id: number
          binary_value?: string | null
          notes?: string | null
          rated_at?: string
          rated_by_user_id?: string | null
          rating: number
          rating_id?: number
          source?: string
          worker_id: number
        }
        Update: {
          activity_id?: number
          binary_value?: string | null
          notes?: string | null
          rated_at?: string
          rated_by_user_id?: string | null
          rating?: number
          rating_id?: number
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
      campaign_leader_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          last_used_at: string | null
          revoked_at: string | null
          task_list_id: number
          token_hash: string
          token_id: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          last_used_at?: string | null
          revoked_at?: string | null
          task_list_id: number
          token_hash: string
          token_id?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          last_used_at?: string | null
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
          created_at: string
          name: string
          ou_id: number
          ou_type: string
          source_metadata: Json | null
          total_workers_estimated: number | null
          updated_at: string
        }
        Insert: {
          anchor_worker_id?: number | null
          campaign_id: number
          created_at?: string
          name: string
          ou_id?: number
          ou_type: string
          source_metadata?: Json | null
          total_workers_estimated?: number | null
          updated_at?: string
        }
        Update: {
          anchor_worker_id?: number | null
          campaign_id?: number
          created_at?: string
          name?: string
          ou_id?: number
          ou_type?: string
          source_metadata?: Json | null
          total_workers_estimated?: number | null
          updated_at?: string
        }
        Relationships: [
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
          task_list_id?: number | null
        }
        Relationships: [
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
            foreignKeyName: "campaign_prospective_workers_task_list_id_fkey"
            columns: ["task_list_id"]
            isOneToOne: false
            referencedRelation: "campaign_task_lists"
            referencedColumns: ["task_list_id"]
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
          plan_id: number
          planned_end_date: string | null
          planned_start_date: string | null
          stage_name: string
          stage_number: number
          status: string
          updated_at: string | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          campaign_id: number
          created_at?: string | null
          created_by?: string | null
          plan_id?: number
          planned_end_date?: string | null
          planned_start_date?: string | null
          stage_name: string
          stage_number: number
          status?: string
          updated_at?: string | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          campaign_id?: number
          created_at?: string | null
          created_by?: string | null
          plan_id?: number
          planned_end_date?: string | null
          planned_start_date?: string | null
          stage_name?: string
          stage_number?: number
          status?: string
          updated_at?: string | null
        }
        Relationships: [
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
          activity_id: number
          campaign_id: number
          created_at: string
          leader_organiser_id: number | null
          leader_worker_id: number | null
          status: string
          task_list_id: number
          title: string | null
        }
        Insert: {
          activity_id: number
          campaign_id: number
          created_at?: string
          leader_organiser_id?: number | null
          leader_worker_id?: number | null
          status?: string
          task_list_id?: number
          title?: string | null
        }
        Update: {
          activity_id?: number
          campaign_id?: number
          created_at?: string
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
      campaign_worker_membership: {
        Row: {
          campaign_id: number
          created_at: string
          membership_id: number
          oa_leader_role: string | null
          updated_at: string
          worker_id: number
        }
        Insert: {
          campaign_id: number
          created_at?: string
          membership_id?: number
          oa_leader_role?: string | null
          updated_at?: string
          worker_id: number
        }
        Update: {
          campaign_id?: number
          created_at?: string
          membership_id?: number
          oa_leader_role?: string | null
          updated_at?: string
          worker_id?: number
        }
        Relationships: [
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
          created_at: string
          id: number
          is_primary: boolean
          ou_id: number
          worker_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          is_primary?: boolean
          ou_id: number
          worker_id: number
        }
        Update: {
          created_at?: string
          id?: number
          is_primary?: boolean
          ou_id?: number
          worker_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_worker_ou_ou_id_fkey"
            columns: ["ou_id"]
            isOneToOne: false
            referencedRelation: "campaign_organising_units"
            referencedColumns: ["ou_id"]
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
          campaign_id: number
          campaign_scope: string | null
          campaign_type: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          enterprise_agreement_subtype: string | null
          name: string
          notes: string | null
          organiser_id: number | null
          replaced_agreement_id: number | null
          sector_wide: boolean
          start_date: string | null
          status: string
          total_worker_estimate: number | null
          updated_at: string
        }
        Insert: {
          campaign_id?: number
          campaign_scope?: string | null
          campaign_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          enterprise_agreement_subtype?: string | null
          name: string
          notes?: string | null
          organiser_id?: number | null
          replaced_agreement_id?: number | null
          sector_wide?: boolean
          start_date?: string | null
          status?: string
          total_worker_estimate?: number | null
          updated_at?: string
        }
        Update: {
          campaign_id?: number
          campaign_scope?: string | null
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          enterprise_agreement_subtype?: string | null
          name?: string
          notes?: string | null
          organiser_id?: number | null
          replaced_agreement_id?: number | null
          sector_wide?: boolean
          start_date?: string | null
          status?: string
          total_worker_estimate?: number | null
          updated_at?: string
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
          campaign_id: number
          created_at: string | null
          enforcement_type: string
          gate_id: number
          gate_name: string
          gate_number: number
          is_active: boolean | null
        }
        Insert: {
          campaign_id: number
          created_at?: string | null
          enforcement_type?: string
          gate_id?: number
          gate_name: string
          gate_number: number
          is_active?: boolean | null
        }
        Update: {
          campaign_id?: number
          created_at?: string | null
          enforcement_type?: string
          gate_id?: number
          gate_name?: string
          gate_number?: number
          is_active?: boolean | null
        }
        Relationships: [
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
      plan_ambitions: {
        Row: {
          achieved_date: string | null
          ambition_id: number
          ambition_option_id: number | null
          created_at: string | null
          current_value: string | null
          custom_text: string | null
          evidence_notes: string | null
          is_achieved: boolean | null
          is_hard_gate: boolean
          is_system_default: boolean
          metric_type: string | null
          plan_id: number
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
          created_at?: string | null
          current_value?: string | null
          custom_text?: string | null
          evidence_notes?: string | null
          is_achieved?: boolean | null
          is_hard_gate?: boolean
          is_system_default?: boolean
          metric_type?: string | null
          plan_id: number
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
          created_at?: string | null
          current_value?: string | null
          custom_text?: string | null
          evidence_notes?: string | null
          is_achieved?: boolean | null
          is_hard_gate?: boolean
          is_system_default?: boolean
          metric_type?: string | null
          plan_id?: number
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
            foreignKeyName: "plan_ambitions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_stage_plans"
            referencedColumns: ["plan_id"]
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
          plan_id: number
          resolution_date: string | null
          resolution_plan: string | null
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
          plan_id: number
          resolution_date?: string | null
          resolution_plan?: string | null
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
          plan_id?: number
          resolution_date?: string | null
          resolution_plan?: string | null
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
            foreignKeyName: "plan_capacities_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_stage_plans"
            referencedColumns: ["plan_id"]
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
          plan_id: number
          risk_assessment: Json | null
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
          plan_id: number
          risk_assessment?: Json | null
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
          plan_id?: number
          risk_assessment?: Json | null
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
        ]
      }
      plan_where_to_play: {
        Row: {
          created_at: string | null
          custom_text: string | null
          is_exclusion: boolean | null
          plan_id: number
          priority: number | null
          rationale: string | null
          sort_order: number | null
          wtp_category_id: number
          wtp_id: number
          wtp_option_id: number | null
        }
        Insert: {
          created_at?: string | null
          custom_text?: string | null
          is_exclusion?: boolean | null
          plan_id: number
          priority?: number | null
          rationale?: string | null
          sort_order?: number | null
          wtp_category_id: number
          wtp_id?: number
          wtp_option_id?: number | null
        }
        Update: {
          created_at?: string | null
          custom_text?: string | null
          is_exclusion?: boolean | null
          plan_id?: number
          priority?: number | null
          rationale?: string | null
          sort_order?: number | null
          wtp_category_id?: number
          wtp_id?: number
          wtp_option_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_where_to_play_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "campaign_stage_plans"
            referencedColumns: ["plan_id"]
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
      user_profiles: {
        Row: {
          created_at: string
          display_name: string
          organiser_id: number | null
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
          outcome: string | null
          rating: number | null
          volunteer_hours: number | null
          volunteer_role: string | null
        }
        Insert: {
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
          outcome?: string | null
          rating?: number | null
          volunteer_hours?: number | null
          volunteer_role?: string | null
        }
        Update: {
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
          outcome?: string | null
          rating?: number | null
          volunteer_hours?: number | null
          volunteer_role?: string | null
        }
        Relationships: [
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
            referencedRelation: "campaign_timelines"
            referencedColumns: ["campaign_id"]
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
      workers: {
        Row: {
          action_network_id: string | null
          address: string | null
          canonical_occupation_id: number | null
          classification: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          employer_id: number | null
          engagement_level: string
          engagement_score: number
          first_name: string
          gender: string | null
          is_active: boolean
          is_hsr: boolean | null
          join_date: string | null
          last_name: string
          member_number: string | null
          member_role_type_id: number | null
          notes: string | null
          occupation: string | null
          phone: string | null
          postcode: string | null
          preferred_name: string | null
          project_id: number | null
          resignation_date: string | null
          state: string | null
          suburb: string | null
          union_id: number | null
          union_membership_type_id: number | null
          updated_at: string
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
          employer_id?: number | null
          engagement_level?: string
          engagement_score?: number
          first_name: string
          gender?: string | null
          is_active?: boolean
          is_hsr?: boolean | null
          join_date?: string | null
          last_name: string
          member_number?: string | null
          member_role_type_id?: number | null
          notes?: string | null
          occupation?: string | null
          phone?: string | null
          postcode?: string | null
          preferred_name?: string | null
          project_id?: number | null
          resignation_date?: string | null
          state?: string | null
          suburb?: string | null
          union_id?: number | null
          union_membership_type_id?: number | null
          updated_at?: string
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
          employer_id?: number | null
          engagement_level?: string
          engagement_score?: number
          first_name?: string
          gender?: string | null
          is_active?: boolean
          is_hsr?: boolean | null
          join_date?: string | null
          last_name?: string
          member_number?: string | null
          member_role_type_id?: number | null
          notes?: string | null
          occupation?: string | null
          phone?: string | null
          postcode?: string | null
          preferred_name?: string | null
          project_id?: number | null
          resignation_date?: string | null
          state?: string | null
          suburb?: string | null
          union_id?: number | null
          union_membership_type_id?: number | null
          updated_at?: string
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
            foreignKeyName: "workers_union_membership_type_id_fkey"
            columns: ["union_membership_type_id"]
            isOneToOne: false
            referencedRelation: "union_membership_types"
            referencedColumns: ["union_membership_type_id"]
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
      campaign_worker_rating_summary: {
        Row: {
          campaign_id: number | null
          cumulative_rating: number | null
          last_activity_rating: number | null
          worker_id: number | null
        }
        Relationships: [
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
      workers_view: {
        Row: {
          action_network_id: string | null
          address: string | null
          classification: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          employer_id: number | null
          employer_name: string | null
          engagement_level: string | null
          engagement_score: number | null
          first_name: string | null
          gender: string | null
          is_active: boolean | null
          is_hsr: boolean | null
          is_offshore: boolean | null
          join_date: string | null
          last_name: string | null
          member_number: string | null
          member_role_display: string | null
          member_role_type_id: number | null
          notes: string | null
          occupation: string | null
          phone: string | null
          postcode: string | null
          project_id: number | null
          project_name: string | null
          project_status: string | null
          resignation_date: string | null
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
            foreignKeyName: "workers_union_membership_type_id_fkey"
            columns: ["union_membership_type_id"]
            isOneToOne: false
            referencedRelation: "union_membership_types"
            referencedColumns: ["union_membership_type_id"]
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
      apply_employer_wizard_changes: { Args: { payload: Json }; Returns: Json }
      archive_old_import_logs: { Args: never; Returns: Json }
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
      can_write_to_campaign: {
        Args: { p_campaign_id: number }
        Returns: boolean
      }
      check_rate_limit: {
        Args: { p_endpoint?: string; p_user_id: string }
        Returns: Json
      }
      cleanup_old_rate_limit_usage: { Args: never; Returns: number }
      clear_all_ai_cache: { Args: never; Returns: number }
      clear_expired_ai_cache: { Args: never; Returns: number }
      delete_campaign: { Args: { p_campaign_id: number }; Returns: undefined }
      delete_old_import_logs: { Args: never; Returns: Json }
      deny_campaign_edit_permission: {
        Args: { p_request_id: number; p_response_reason?: string }
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
      merge_employers: { Args: { payload: Json }; Returns: Json }
      refresh_all_pending_gate_criteria: { Args: never; Returns: Json }
      refresh_gate_criteria_for_campaign: {
        Args: { p_campaign_id: number }
        Returns: Json
      }
      refresh_worksite_hierarchy_report_rows_mv: {
        Args: never
        Returns: undefined
      }
      request_campaign_edit_permission: {
        Args: { p_campaign_id: number; p_reason?: string }
        Returns: Json
      }
      revoke_campaign_edit_permission: {
        Args: { p_permission_id: number }
        Returns: Json
      }
      run_import_log_retention: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
