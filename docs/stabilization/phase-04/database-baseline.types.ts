export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      access_request_organization_invitation_links: {
        Row: {
          access_request_id: string
          created_at: string
          id: string
          intended_access_scope_group_ids: string[]
          intended_access_scope_kind: string
          intended_capability_overrides: Json
          intended_member_preset: string | null
          intended_membership_role: string
          intended_permissions: Json
          invited_at: string
          invited_by: string
          organization_id: string
          organization_invitation_id: string
        }
        Insert: {
          access_request_id: string
          created_at?: string
          id?: string
          intended_access_scope_group_ids?: string[]
          intended_access_scope_kind: string
          intended_capability_overrides?: Json
          intended_member_preset?: string | null
          intended_membership_role: string
          intended_permissions?: Json
          invited_at: string
          invited_by: string
          organization_id: string
          organization_invitation_id: string
        }
        Update: {
          access_request_id?: string
          created_at?: string
          id?: string
          intended_access_scope_group_ids?: string[]
          intended_access_scope_kind?: string
          intended_capability_overrides?: Json
          intended_member_preset?: string | null
          intended_membership_role?: string
          intended_permissions?: Json
          invited_at?: string
          invited_by?: string
          organization_id?: string
          organization_invitation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_request_organization_invitation_links_access_request_fke"
            columns: ["access_request_id"]
            isOneToOne: false
            referencedRelation: "access_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_request_organization_invitation_links_invitation_fkey"
            columns: ["organization_invitation_id"]
            isOneToOne: true
            referencedRelation: "organization_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_request_organization_invitation_links_organization_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      access_requests: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          heard_about: string | null
          heard_about_details: string | null
          id: string
          last_name: string | null
          name: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          setup_completed_at: string | null
          setup_user_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          heard_about?: string | null
          heard_about_details?: string | null
          id?: string
          last_name?: string | null
          name: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          setup_completed_at?: string | null
          setup_user_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          heard_about?: string | null
          heard_about_details?: string | null
          id?: string
          last_name?: string | null
          name?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          setup_completed_at?: string | null
          setup_user_id?: string | null
          status?: string
        }
        Relationships: []
      }
      account_setup_links: {
        Row: {
          access_request_id: string
          claimed_at: string | null
          created_at: string
          expires_at: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          revocation_reason: string | null
          revoked_at: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          access_request_id: string
          claimed_at?: string | null
          created_at?: string
          expires_at: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          access_request_id?: string
          claimed_at?: string | null
          created_at?: string
          expires_at?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_setup_links_access_request_id_fkey"
            columns: ["access_request_id"]
            isOneToOne: false
            referencedRelation: "access_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      account_setup_rate_limits: {
        Row: {
          bucket_key: string
          request_count: number
          reset_at: string
          updated_at: string
        }
        Insert: {
          bucket_key: string
          request_count: number
          reset_at: string
          updated_at?: string
        }
        Update: {
          bucket_key?: string
          request_count?: number
          reset_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      advanced_duty_revision_change_sets: {
        Row: {
          actor_user_id: string | null
          applied_at: string
          applied_run_id: string
          conflict_summary: Json | null
          created_at: string
          id: string
          organization_id: string
          reason: string
          reviewable_conflicts_confirmed: boolean
          source_draft_id: string | null
          source_snapshot_fingerprint: string | null
          source_snapshot_id: string | null
          warning_summary: Json | null
        }
        Insert: {
          actor_user_id?: string | null
          applied_at?: string
          applied_run_id: string
          conflict_summary?: Json | null
          created_at?: string
          id?: string
          organization_id: string
          reason: string
          reviewable_conflicts_confirmed?: boolean
          source_draft_id?: string | null
          source_snapshot_fingerprint?: string | null
          source_snapshot_id?: string | null
          warning_summary?: Json | null
        }
        Update: {
          actor_user_id?: string | null
          applied_at?: string
          applied_run_id?: string
          conflict_summary?: Json | null
          created_at?: string
          id?: string
          organization_id?: string
          reason?: string
          reviewable_conflicts_confirmed?: boolean
          source_draft_id?: string | null
          source_snapshot_fingerprint?: string | null
          source_snapshot_id?: string | null
          warning_summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "advanced_duty_revision_change_sets_applied_run_id_fkey"
            columns: ["applied_run_id"]
            isOneToOne: false
            referencedRelation: "duty_event_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_revision_change_sets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_revision_change_sets_source_draft_id_fkey"
            columns: ["source_draft_id"]
            isOneToOne: false
            referencedRelation: "advanced_duty_revision_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_revision_change_sets_source_snapshot_id_fkey"
            columns: ["source_snapshot_id"]
            isOneToOne: false
            referencedRelation: "advanced_duty_run_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      advanced_duty_revision_drafts: {
        Row: {
          applied_at: string | null
          applied_by_user_id: string | null
          applied_run_id: string
          conflict_summary: Json | null
          created_at: string
          created_by_user_id: string | null
          discard_cleanup_after: string | null
          discarded_at: string | null
          discarded_by_user_id: string | null
          draft_version: number
          expires_at: string
          id: string
          latest_error: string | null
          latest_validation: Json | null
          organization_id: string
          reason: string | null
          slot_changes: Json
          source_run_created_at: string | null
          source_run_updated_at: string | null
          source_snapshot_fingerprint: string | null
          source_snapshot_id: string | null
          status: string
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by_user_id?: string | null
          applied_run_id: string
          conflict_summary?: Json | null
          created_at?: string
          created_by_user_id?: string | null
          discard_cleanup_after?: string | null
          discarded_at?: string | null
          discarded_by_user_id?: string | null
          draft_version?: number
          expires_at?: string
          id?: string
          latest_error?: string | null
          latest_validation?: Json | null
          organization_id: string
          reason?: string | null
          slot_changes?: Json
          source_run_created_at?: string | null
          source_run_updated_at?: string | null
          source_snapshot_fingerprint?: string | null
          source_snapshot_id?: string | null
          status?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by_user_id?: string | null
          applied_run_id?: string
          conflict_summary?: Json | null
          created_at?: string
          created_by_user_id?: string | null
          discard_cleanup_after?: string | null
          discarded_at?: string | null
          discarded_by_user_id?: string | null
          draft_version?: number
          expires_at?: string
          id?: string
          latest_error?: string | null
          latest_validation?: Json | null
          organization_id?: string
          reason?: string | null
          slot_changes?: Json
          source_run_created_at?: string | null
          source_run_updated_at?: string | null
          source_snapshot_fingerprint?: string | null
          source_snapshot_id?: string | null
          status?: string
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advanced_duty_revision_drafts_applied_run_id_fkey"
            columns: ["applied_run_id"]
            isOneToOne: false
            referencedRelation: "duty_event_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_revision_drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_revision_drafts_source_snapshot_id_fkey"
            columns: ["source_snapshot_id"]
            isOneToOne: false
            referencedRelation: "advanced_duty_run_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      advanced_duty_revision_slot_changes: {
        Row: {
          change_intent: string
          change_set_id: string
          conflict_metadata: Json | null
          created_at: string
          duty_event_id: string | null
          event_date: string
          id: string
          new_assignment_source: string | null
          new_personnel_id: string | null
          new_personnel_snapshot: Json | null
          new_warning_state: string | null
          organization_id: string
          previous_assignment_source: string | null
          previous_personnel_id: string | null
          previous_personnel_snapshot: Json | null
          previous_warning_state: string | null
          role_label: string
          slot_index: number
          slot_key: string
          template_slot_id: string | null
          warning_metadata: Json | null
        }
        Insert: {
          change_intent: string
          change_set_id: string
          conflict_metadata?: Json | null
          created_at?: string
          duty_event_id?: string | null
          event_date: string
          id?: string
          new_assignment_source?: string | null
          new_personnel_id?: string | null
          new_personnel_snapshot?: Json | null
          new_warning_state?: string | null
          organization_id: string
          previous_assignment_source?: string | null
          previous_personnel_id?: string | null
          previous_personnel_snapshot?: Json | null
          previous_warning_state?: string | null
          role_label: string
          slot_index: number
          slot_key: string
          template_slot_id?: string | null
          warning_metadata?: Json | null
        }
        Update: {
          change_intent?: string
          change_set_id?: string
          conflict_metadata?: Json | null
          created_at?: string
          duty_event_id?: string | null
          event_date?: string
          id?: string
          new_assignment_source?: string | null
          new_personnel_id?: string | null
          new_personnel_snapshot?: Json | null
          new_warning_state?: string | null
          organization_id?: string
          previous_assignment_source?: string | null
          previous_personnel_id?: string | null
          previous_personnel_snapshot?: Json | null
          previous_warning_state?: string | null
          role_label?: string
          slot_index?: number
          slot_key?: string
          template_slot_id?: string | null
          warning_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "advanced_duty_revision_slot_changes_change_set_id_fkey"
            columns: ["change_set_id"]
            isOneToOne: false
            referencedRelation: "advanced_duty_revision_change_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_revision_slot_changes_duty_event_id_fkey"
            columns: ["duty_event_id"]
            isOneToOne: false
            referencedRelation: "duty_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_revision_slot_changes_new_personnel_id_fkey"
            columns: ["new_personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_revision_slot_changes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_revision_slot_changes_previous_personnel_id_fkey"
            columns: ["previous_personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_revision_slot_changes_template_slot_id_fkey"
            columns: ["template_slot_id"]
            isOneToOne: false
            referencedRelation: "duty_template_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      advanced_duty_run_snapshots: {
        Row: {
          applied_at: string | null
          applied_run_id: string | null
          apply_error: string | null
          candidate_personnel_ids: Json
          created_at: string
          created_by_user_id: string | null
          draft_lineage_key: string
          end_date: string
          event_count: number
          event_dates: Json
          expires_at: string
          export_model: Json | null
          id: string
          input_payload: Json
          organization_id: string
          pattern: string
          preview_payload: Json
          snapshot_fingerprint: string
          snapshot_payload: Json
          snapshot_version: number
          start_date: string
          status: string
          template_id: string
          template_name: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_run_id?: string | null
          apply_error?: string | null
          candidate_personnel_ids?: Json
          created_at?: string
          created_by_user_id?: string | null
          draft_lineage_key: string
          end_date: string
          event_count?: number
          event_dates?: Json
          expires_at?: string
          export_model?: Json | null
          id?: string
          input_payload?: Json
          organization_id: string
          pattern?: string
          preview_payload?: Json
          snapshot_fingerprint: string
          snapshot_payload?: Json
          snapshot_version?: number
          start_date: string
          status?: string
          template_id: string
          template_name: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_run_id?: string | null
          apply_error?: string | null
          candidate_personnel_ids?: Json
          created_at?: string
          created_by_user_id?: string | null
          draft_lineage_key?: string
          end_date?: string
          event_count?: number
          event_dates?: Json
          expires_at?: string
          export_model?: Json | null
          id?: string
          input_payload?: Json
          organization_id?: string
          pattern?: string
          preview_payload?: Json
          snapshot_fingerprint?: string
          snapshot_payload?: Json
          snapshot_version?: number
          start_date?: string
          status?: string
          template_id?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advanced_duty_run_snapshots_applied_run_id_fkey"
            columns: ["applied_run_id"]
            isOneToOne: false
            referencedRelation: "duty_event_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_run_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advanced_duty_run_snapshots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "duty_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "platform_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_types: {
        Row: {
          archived_at: string | null
          assign_to: string
          color: string
          created_at: string
          exempt_personnel_ids: string[]
          id: string
          name: string
          organization_id: string
          short_name: string
          show_in_date_header: boolean
          sort_order: number
        }
        Insert: {
          archived_at?: string | null
          assign_to: string
          color?: string
          created_at?: string
          exempt_personnel_ids?: string[]
          id?: string
          name: string
          organization_id: string
          short_name: string
          show_in_date_header?: boolean
          sort_order?: number
        }
        Update: {
          archived_at?: string | null
          assign_to?: string
          color?: string
          created_at?: string
          exempt_personnel_ids?: string[]
          id?: string
          name?: string
          organization_id?: string
          short_name?: string
          show_in_date_header?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_types_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          details: Json | null
          id: string
          ip_address: unknown
          org_id: string | null
          resource_id: string | null
          resource_type: string
          severity: string
          timestamp: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          org_id?: string | null
          resource_id?: string | null
          resource_type: string
          severity?: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          org_id?: string | null
          resource_id?: string | null
          resource_type?: string
          severity?: string
          timestamp?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_email_outbox: {
        Row: {
          access_request_id: string
          attempt_count: number
          created_at: string
          id: string
          last_error: string | null
          purpose: string
          recipient: string
          sent_at: string | null
          setup_link_id: string
          status: string
          updated_at: string
        }
        Insert: {
          access_request_id: string
          attempt_count?: number
          created_at?: string
          id?: string
          last_error?: string | null
          purpose: string
          recipient: string
          sent_at?: string | null
          setup_link_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          access_request_id?: string
          attempt_count?: number
          created_at?: string
          id?: string
          last_error?: string | null
          purpose?: string
          recipient?: string
          sent_at?: string | null
          setup_link_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_email_outbox_access_request_id_fkey"
            columns: ["access_request_id"]
            isOneToOne: false
            referencedRelation: "access_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_email_outbox_setup_link_id_fkey"
            columns: ["setup_link_id"]
            isOneToOne: false
            referencedRelation: "account_setup_links"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_entries: {
        Row: {
          created_at: string
          end_date: string
          id: string
          note: string | null
          organization_id: string
          personnel_id: string
          start_date: string
          status_type_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          note?: string | null
          organization_id: string
          personnel_id: string
          start_date: string
          status_type_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          note?: string | null
          organization_id?: string
          personnel_id?: string
          start_date?: string
          status_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_entries_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_entries_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_entries_status_type_id_fkey"
            columns: ["status_type_id"]
            isOneToOne: false
            referencedRelation: "status_types"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_feedback: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string
          github_issue_number: number | null
          github_issue_url: string | null
          id: string
          message: string
          organization_id: string | null
          organization_name: string | null
          page_section: string | null
          page_url: string | null
          status: string
          updated_at: string
          user_email: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          github_issue_number?: number | null
          github_issue_url?: string | null
          id?: string
          message: string
          organization_id?: string | null
          organization_name?: string | null
          page_section?: string | null
          page_url?: string | null
          status?: string
          updated_at?: string
          user_email: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          github_issue_number?: number | null
          github_issue_url?: string | null
          id?: string
          message?: string
          organization_id?: string | null
          organization_name?: string | null
          page_section?: string | null
          page_url?: string | null
          status?: string
          updated_at?: string
          user_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      counseling_records: {
        Row: {
          archived_at: string | null
          counselor_signed: boolean
          counselor_signed_at: string | null
          created_at: string
          date_conducted: string
          file_path: string | null
          follow_up_date: string | null
          id: string
          key_points: string | null
          notes: string | null
          organization_id: string
          personnel_id: string
          plan_of_action: string | null
          soldier_signed: boolean
          soldier_signed_at: string | null
          status: string
          subject: string
          summary: string | null
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          archived_at?: string | null
          counselor_signed?: boolean
          counselor_signed_at?: string | null
          created_at?: string
          date_conducted: string
          file_path?: string | null
          follow_up_date?: string | null
          id?: string
          key_points?: string | null
          notes?: string | null
          organization_id: string
          personnel_id: string
          plan_of_action?: string | null
          soldier_signed?: boolean
          soldier_signed_at?: string | null
          status?: string
          subject: string
          summary?: string | null
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          archived_at?: string | null
          counselor_signed?: boolean
          counselor_signed_at?: string | null
          created_at?: string
          date_conducted?: string
          file_path?: string | null
          follow_up_date?: string | null
          id?: string
          key_points?: string | null
          notes?: string | null
          organization_id?: string
          personnel_id?: string
          plan_of_action?: string | null
          soldier_signed?: boolean
          soldier_signed_at?: string | null
          status?: string
          subject?: string
          summary?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "counseling_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counseling_records_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_assignments: {
        Row: {
          assignee_id: string
          assignment_type_id: string
          created_at: string
          date: string
          duty_roster_template_run_id: string | null
          duty_roster_template_run_row_date: string | null
          id: string
          organization_id: string
        }
        Insert: {
          assignee_id: string
          assignment_type_id: string
          created_at?: string
          date: string
          duty_roster_template_run_id?: string | null
          duty_roster_template_run_row_date?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          assignee_id?: string
          assignment_type_id?: string
          created_at?: string
          date?: string
          duty_roster_template_run_id?: string | null
          duty_roster_template_run_row_date?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_assignments_assignment_type_id_fkey"
            columns: ["assignment_type_id"]
            isOneToOne: false
            referencedRelation: "assignment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_assignments_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_assignments_duty_roster_template_run_id_fkey"
            columns: ["duty_roster_template_run_id"]
            isOneToOne: false
            referencedRelation: "duty_roster_template_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_configs: {
        Row: {
          config: Json
          id: string
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          id?: string
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          id?: string
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_exports: {
        Row: {
          completed_at: string | null
          created_at: string
          file_path: string | null
          file_size_bytes: number | null
          id: string
          org_id: string
          requested_by: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          org_id: string
          requested_by: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          org_id?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_exports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          created_at: string
          denial_reason: string | null
          id: string
          organization_id: string
          requested_by: string
          requested_by_email: string
          resource_description: string
          resource_id: string
          resource_type: string
          resource_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          denial_reason?: string | null
          id?: string
          organization_id: string
          requested_by: string
          requested_by_email: string
          resource_description: string
          resource_id: string
          resource_type: string
          resource_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          denial_reason?: string | null
          id?: string
          organization_id?: string
          requested_by?: string
          requested_by_email?: string
          resource_description?: string
          resource_id?: string
          resource_type?: string
          resource_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      durable_rate_limits: {
        Row: {
          bucket_key: string
          request_count: number
          reset_at: string
          updated_at: string
        }
        Insert: {
          bucket_key: string
          request_count: number
          reset_at: string
          updated_at?: string
        }
        Update: {
          bucket_key?: string
          request_count?: number
          reset_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      duty_event_runs: {
        Row: {
          created_at: string
          end_date: string
          event_count: number
          id: string
          is_legacy: boolean
          organization_id: string
          pattern: string
          start_date: string
          template_id: string | null
          template_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          event_count?: number
          id?: string
          is_legacy?: boolean
          organization_id: string
          pattern?: string
          start_date: string
          template_id?: string | null
          template_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          event_count?: number
          id?: string
          is_legacy?: boolean
          organization_id?: string
          pattern?: string
          start_date?: string
          template_id?: string | null
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_event_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_event_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "duty_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_event_slots: {
        Row: {
          assignee_id: string | null
          assignment_source: string
          created_at: string
          duty_event_id: string
          fairness_confidence: string
          id: string
          organization_id: string
          role_label: string
          selection_reason: string | null
          slot_index: number
          sort_order: number
          template_slot_id: string | null
          unfilled_reason: string | null
          warning_state: string
        }
        Insert: {
          assignee_id?: string | null
          assignment_source?: string
          created_at?: string
          duty_event_id: string
          fairness_confidence?: string
          id?: string
          organization_id: string
          role_label: string
          selection_reason?: string | null
          slot_index?: number
          sort_order?: number
          template_slot_id?: string | null
          unfilled_reason?: string | null
          warning_state?: string
        }
        Update: {
          assignee_id?: string | null
          assignment_source?: string
          created_at?: string
          duty_event_id?: string
          fairness_confidence?: string
          id?: string
          organization_id?: string
          role_label?: string
          selection_reason?: string | null
          slot_index?: number
          sort_order?: number
          template_slot_id?: string | null
          unfilled_reason?: string | null
          warning_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_event_slots_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_event_slots_duty_event_id_fkey"
            columns: ["duty_event_id"]
            isOneToOne: false
            referencedRelation: "duty_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_event_slots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_event_slots_template_slot_id_fkey"
            columns: ["template_slot_id"]
            isOneToOne: false
            referencedRelation: "duty_template_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_events: {
        Row: {
          collision_summary: Json
          cooldown_hours: number
          coverage_end: string
          coverage_mode: string
          coverage_start: string
          created_at: string
          event_date: string
          fill_summary: Json
          id: string
          is_blocking: boolean
          organization_id: string
          original_proposal: Json | null
          rules_snapshot: Json
          run_id: string | null
          template_id: string
          template_name: string
          updated_at: string
        }
        Insert: {
          collision_summary?: Json
          cooldown_hours?: number
          coverage_end: string
          coverage_mode?: string
          coverage_start: string
          created_at?: string
          event_date: string
          fill_summary?: Json
          id?: string
          is_blocking?: boolean
          organization_id: string
          original_proposal?: Json | null
          rules_snapshot?: Json
          run_id?: string | null
          template_id: string
          template_name: string
          updated_at?: string
        }
        Update: {
          collision_summary?: Json
          cooldown_hours?: number
          coverage_end?: string
          coverage_mode?: string
          coverage_start?: string
          created_at?: string
          event_date?: string
          fill_summary?: Json
          id?: string
          is_blocking?: boolean
          organization_id?: string
          original_proposal?: Json | null
          rules_snapshot?: Json
          run_id?: string | null
          template_id?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "duty_event_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "duty_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_roster_history: {
        Row: {
          assignment_type_id: string
          config: Json | null
          created_at: string
          created_by_user_id: string | null
          end_date: string
          id: string
          name: string
          organization_id: string
          roster: Json
          start_date: string
        }
        Insert: {
          assignment_type_id: string
          config?: Json | null
          created_at?: string
          created_by_user_id?: string | null
          end_date: string
          id?: string
          name: string
          organization_id: string
          roster: Json
          start_date: string
        }
        Update: {
          assignment_type_id?: string
          config?: Json | null
          created_at?: string
          created_by_user_id?: string | null
          end_date?: string
          id?: string
          name?: string
          organization_id?: string
          roster?: Json
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_roster_history_assignment_type_id_fkey"
            columns: ["assignment_type_id"]
            isOneToOne: false
            referencedRelation: "assignment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_roster_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_roster_template_run_corrections: {
        Row: {
          corrected_at: string
          corrected_by_user_id: string | null
          created_at: string
          id: string
          organization_id: string
          original_assignee_id: string
          reason: string
          replacement_assignee_id: string
          run_id: string
          run_row_date: string
        }
        Insert: {
          corrected_at?: string
          corrected_by_user_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          original_assignee_id: string
          reason: string
          replacement_assignee_id: string
          run_id: string
          run_row_date: string
        }
        Update: {
          corrected_at?: string
          corrected_by_user_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          original_assignee_id?: string
          reason?: string
          replacement_assignee_id?: string
          run_id?: string
          run_row_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_roster_template_run_corrections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_roster_template_run_corrections_original_assignee_id_fkey"
            columns: ["original_assignee_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_roster_template_run_corrections_replacement_assignee_id_fk"
            columns: ["replacement_assignee_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_roster_template_run_corrections_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "duty_roster_template_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_roster_template_runs: {
        Row: {
          accepted_at: string
          accepted_by_user_id: string | null
          applied_at: string | null
          applied_by_user_id: string | null
          created_at: string
          end_date: string
          id: string
          invalidated_at: string | null
          invalidated_by_user_id: string | null
          organization_id: string
          snapshot_payload: Json
          start_date: string
          status: string
          template_id: string
          template_name: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string
          accepted_by_user_id?: string | null
          applied_at?: string | null
          applied_by_user_id?: string | null
          created_at?: string
          end_date: string
          id?: string
          invalidated_at?: string | null
          invalidated_by_user_id?: string | null
          organization_id: string
          snapshot_payload?: Json
          start_date: string
          status?: string
          template_id: string
          template_name: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string
          accepted_by_user_id?: string | null
          applied_at?: string | null
          applied_by_user_id?: string | null
          created_at?: string
          end_date?: string
          id?: string
          invalidated_at?: string | null
          invalidated_by_user_id?: string | null
          organization_id?: string
          snapshot_payload?: Json
          start_date?: string
          status?: string
          template_id?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_roster_template_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_roster_template_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "duty_roster_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_roster_templates: {
        Row: {
          archived_at: string | null
          assignment_type_id: string
          created_at: string
          created_by_user_id: string | null
          exempt_personnel_ids: Json
          id: string
          manual_baseline_counts: Json
          name: string
          organization_id: string
          pool_criteria: Json
          short_code: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assignment_type_id: string
          created_at?: string
          created_by_user_id?: string | null
          exempt_personnel_ids?: Json
          id?: string
          manual_baseline_counts?: Json
          name: string
          organization_id: string
          pool_criteria?: Json
          short_code?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assignment_type_id?: string
          created_at?: string
          created_by_user_id?: string | null
          exempt_personnel_ids?: Json
          id?: string
          manual_baseline_counts?: Json
          name?: string
          organization_id?: string
          pool_criteria?: Json
          short_code?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_roster_templates_assignment_type_id_fkey"
            columns: ["assignment_type_id"]
            isOneToOne: false
            referencedRelation: "assignment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_roster_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_template_rotation_baselines: {
        Row: {
          created_at: string
          id: string
          last_served_date: string
          organization_id: string
          person_id: string
          rotation_pool_key: string
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_served_date: string
          organization_id: string
          person_id: string
          rotation_pool_key: string
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_served_date?: string
          organization_id?: string
          person_id?: string
          rotation_pool_key?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_template_rotation_baselines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_template_rotation_baselines_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_template_rotation_baselines_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "duty_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_template_slots: {
        Row: {
          allowed_group_ids: string[]
          allowed_mos_values: string[]
          allowed_ranks: string[]
          allowed_role_values: string[]
          blocking_mode: string
          created_at: string
          id: string
          organization_id: string
          preferred_group_ids: string[]
          quantity: number
          role_label: string
          rotation_pool_key: string
          sort_order: number
          template_id: string
        }
        Insert: {
          allowed_group_ids?: string[]
          allowed_mos_values?: string[]
          allowed_ranks?: string[]
          allowed_role_values?: string[]
          blocking_mode?: string
          created_at?: string
          id?: string
          organization_id: string
          preferred_group_ids?: string[]
          quantity?: number
          role_label: string
          rotation_pool_key: string
          sort_order?: number
          template_id: string
        }
        Update: {
          allowed_group_ids?: string[]
          allowed_mos_values?: string[]
          allowed_ranks?: string[]
          allowed_role_values?: string[]
          blocking_mode?: string
          created_at?: string
          id?: string
          organization_id?: string
          preferred_group_ids?: string[]
          quantity?: number
          role_label?: string
          rotation_pool_key?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_template_slots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duty_template_slots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "duty_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      duty_templates: {
        Row: {
          cooldown_hours: number
          coverage_mode: string
          created_at: string
          description: string | null
          end_time: string | null
          exempt_personnel_ids: string[]
          exempt_status_type_ids: string[]
          id: string
          is_blocking: boolean
          mode: string
          name: string
          organization_id: string
          scope_group_ids: string[]
          scope_type: string
          soft_preferences: Json
          spans_midnight: boolean
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cooldown_hours?: number
          coverage_mode?: string
          created_at?: string
          description?: string | null
          end_time?: string | null
          exempt_personnel_ids?: string[]
          exempt_status_type_ids?: string[]
          id?: string
          is_blocking?: boolean
          mode?: string
          name: string
          organization_id: string
          scope_group_ids?: string[]
          scope_type?: string
          soft_preferences?: Json
          spans_midnight?: boolean
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cooldown_hours?: number
          coverage_mode?: string
          created_at?: string
          description?: string | null
          end_time?: string | null
          exempt_personnel_ids?: string[]
          exempt_status_type_ids?: string[]
          id?: string
          is_blocking?: boolean
          mode?: string
          name?: string
          organization_id?: string
          scope_group_ids?: string[]
          scope_type?: string
          soft_preferences?: Json
          spans_midnight?: boolean
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duty_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      getting_started_progress: {
        Row: {
          created_at: string | null
          dismissed_at: string | null
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          dismissed_at?: string | null
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          dismissed_at?: string | null
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "getting_started_progress_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "groups_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ict_tasks: {
        Row: {
          archived_at: string | null
          category: string | null
          created_at: string
          description: string | null
          expiration_months: number | null
          id: string
          mos: string[]
          organization_id: string
          sort_order: number
          task_code: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          expiration_months?: number | null
          id?: string
          mos?: string[]
          organization_id: string
          sort_order?: number
          task_code: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          expiration_months?: number | null
          id?: string
          mos?: string[]
          organization_id?: string
          sort_order?: number
          task_code?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ict_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leader_notes: {
        Row: {
          archived_at: string | null
          author: string
          created_at: string
          id: string
          organization_id: string
          personnel_id: string
          text: string
        }
        Insert: {
          archived_at?: string | null
          author: string
          created_at?: string
          id?: string
          organization_id: string
          personnel_id: string
          text: string
        }
        Update: {
          archived_at?: string | null
          author?: string
          created_at?: string
          id?: string
          organization_id?: string
          personnel_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "leader_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leader_notes_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          organization_id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          organization_id: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          organization_id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_step_progress: {
        Row: {
          active: boolean
          completed: boolean
          current_stage: string | null
          id: string
          notes: Json
          onboarding_id: string
          organization_id: string
          sort_order: number
          stages: Json | null
          step_name: string
          step_type: string
          template_step_id: string | null
          training_type_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          completed?: boolean
          current_stage?: string | null
          id?: string
          notes?: Json
          onboarding_id: string
          organization_id: string
          sort_order?: number
          stages?: Json | null
          step_name: string
          step_type: string
          template_step_id?: string | null
          training_type_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          completed?: boolean
          current_stage?: string | null
          id?: string
          notes?: Json
          onboarding_id?: string
          organization_id?: string
          sort_order?: number
          stages?: Json | null
          step_name?: string
          step_type?: string
          template_step_id?: string | null
          training_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_step_progress_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "personnel_onboardings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_step_progress_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_step_progress_template_step_id_fkey"
            columns: ["template_step_id"]
            isOneToOne: false
            referencedRelation: "onboarding_template_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_step_progress_training_type_id_fkey"
            columns: ["training_type_id"]
            isOneToOne: false
            referencedRelation: "training_types"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_template_steps: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          sort_order: number
          stages: Json | null
          step_type: string
          template_id: string
          training_type_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          stages?: Json | null
          step_type: string
          template_id: string
          training_type_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          stages?: Json | null
          step_type?: string
          template_id?: string
          training_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_template_steps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_template_steps_training_type_id_fkey"
            columns: ["training_type_id"]
            isOneToOne: false
            referencedRelation: "training_types"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_billing_snapshots: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          cancellation_feedback: string | null
          cancellation_reason: string | null
          collection_status: string | null
          commercial_plan: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          drift_detected: boolean
          id: string
          last_processed_at: string | null
          last_reconciled_at: string | null
          last_stripe_event_created_at: string | null
          last_stripe_event_id: string | null
          last_stripe_event_type: string | null
          organization_id: string
          reconciliation_result: string | null
          source: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          sync_status: string
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          collection_status?: string | null
          commercial_plan?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          drift_detected?: boolean
          id?: string
          last_processed_at?: string | null
          last_reconciled_at?: string | null
          last_stripe_event_created_at?: string | null
          last_stripe_event_id?: string | null
          last_stripe_event_type?: string | null
          organization_id: string
          reconciliation_result?: string | null
          source?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          sync_status?: string
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          collection_status?: string | null
          commercial_plan?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          drift_detected?: boolean
          id?: string
          last_processed_at?: string | null
          last_reconciled_at?: string | null
          last_stripe_event_created_at?: string | null
          last_stripe_event_id?: string | null
          last_stripe_event_type?: string | null
          organization_id?: string
          reconciliation_result?: string | null
          source?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          sync_status?: string
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_billing_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_checkout_attempts: {
        Row: {
          canceled_at: string | null
          checkout_url: string | null
          commercial_plan: string
          completed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_price_id: string
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          checkout_url?: string | null
          commercial_plan: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id: string
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          checkout_url?: string | null
          commercial_plan?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_checkout_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitation_email_outbox: {
        Row: {
          attempt_count: number
          created_at: string
          id: string
          invitation_id: string
          last_error: string | null
          organization_id: string
          purpose: string
          recipient: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          id?: string
          invitation_id: string
          last_error?: string | null
          organization_id: string
          purpose?: string
          recipient: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          id?: string
          invitation_id?: string
          last_error?: string | null
          organization_id?: string
          purpose?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitation_email_outbox_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "organization_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitation_email_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          access_scope_group_ids: string[]
          access_scope_kind: string
          blocked_at: string | null
          blocked_by: string | null
          capability_overrides: Json
          created_at: string
          declined_at: string | null
          declined_by: string | null
          email: string
          expired_at: string | null
          expires_at: string
          id: string
          invited_by: string
          member_preset: string
          normalized_email: string | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["organization_role"]
          status: Database["public"]["Enums"]["invitation_status"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          access_scope_group_ids?: string[]
          access_scope_kind?: string
          blocked_at?: string | null
          blocked_by?: string | null
          capability_overrides?: Json
          created_at?: string
          declined_at?: string | null
          declined_by?: string | null
          email: string
          expired_at?: string | null
          expires_at?: string
          id?: string
          invited_by: string
          member_preset?: string
          normalized_email?: string | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["organization_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          access_scope_group_ids?: string[]
          access_scope_kind?: string
          blocked_at?: string | null
          blocked_by?: string | null
          capability_overrides?: Json
          created_at?: string
          declined_at?: string | null
          declined_by?: string | null
          email?: string
          expired_at?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          member_preset?: string
          normalized_email?: string | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["organization_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "clinic_invitations_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          access_scope_group_ids: string[]
          access_scope_kind: string
          capability_overrides: Json
          created_at: string
          email: string | null
          id: string
          invited_by: string | null
          member_preset: string
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }
        Insert: {
          access_scope_group_ids?: string[]
          access_scope_kind?: string
          capability_overrides?: Json
          created_at?: string
          email?: string | null
          id?: string
          invited_by?: string | null
          member_preset?: string
          organization_id: string
          role?: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }
        Update: {
          access_scope_group_ids?: string[]
          access_scope_kind?: string
          capability_overrides?: Json
          created_at?: string
          email?: string | null
          id?: string
          invited_by?: string | null
          member_preset?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_memberships_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_plan_feature_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          feature_key: string
          id: string
          organization_id: string
          override_state: string
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          feature_key: string
          id?: string
          organization_id: string
          override_state: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          feature_key?: string
          id?: string
          organization_id?: string
          override_state?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_plan_feature_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_rank_catalog: {
        Row: {
          category: string
          code: string
          created_at: string
          id: string
          label: string
          organization_id: string
          pay_grade: string
          service: string
          sort_order: number
          source: string
          state: string
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          id?: string
          label: string
          organization_id: string
          pay_grade: string
          service: string
          sort_order?: number
          source?: string
          state?: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          id?: string
          label?: string
          organization_id?: string
          pay_grade?: string
          service?: string
          sort_order?: number
          source?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_rank_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          archive_retention_months: number | null
          created_at: string
          created_by: string
          critical_tasks_default_expiration_months: number | null
          critical_tasks_expiring_soon_warning_days: number | null
          current_period_end: string | null
          gift_expires_at: string | null
          gift_tier: string | null
          gifted_by: string | null
          id: string
          loss_warning_window_days: number
          name: string
          personnel_document_storage_cap_bytes: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          suspended_at: string | null
          tier: string
          url_slug: string | null
        }
        Insert: {
          archive_retention_months?: number | null
          created_at?: string
          created_by: string
          critical_tasks_default_expiration_months?: number | null
          critical_tasks_expiring_soon_warning_days?: number | null
          current_period_end?: string | null
          gift_expires_at?: string | null
          gift_tier?: string | null
          gifted_by?: string | null
          id?: string
          loss_warning_window_days?: number
          name: string
          personnel_document_storage_cap_bytes?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          suspended_at?: string | null
          tier?: string
          url_slug?: string | null
        }
        Update: {
          archive_retention_months?: number | null
          created_at?: string
          created_by?: string
          critical_tasks_default_expiration_months?: number | null
          critical_tasks_expiring_soon_warning_days?: number | null
          current_period_end?: string | null
          gift_expires_at?: string | null
          gift_tier?: string | null
          gifted_by?: string | null
          id?: string
          loss_warning_window_days?: number
          name?: string
          personnel_document_storage_cap_bytes?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          suspended_at?: string | null
          tier?: string
          url_slug?: string | null
        }
        Relationships: []
      }
      password_change_attempts: {
        Row: {
          actor: string
          expires_at: string
          flow: string | null
          id: string
          session_id: string
          state: string
        }
        Insert: {
          actor: string
          expires_at: string
          flow?: string | null
          id?: string
          session_id: string
          state: string
        }
        Update: {
          actor?: string
          expires_at?: string
          flow?: string | null
          id?: string
          session_id?: string
          state?: string
        }
        Relationships: []
      }
      personnel: {
        Row: {
          archived_at: string | null
          clinic_role: string
          created_at: string
          deros: string | null
          ets: string | null
          first_name: string
          group_id: string | null
          id: string
          last_name: string
          mos: string
          organization_id: string
          rank: string
          slug: string
        }
        Insert: {
          archived_at?: string | null
          clinic_role?: string
          created_at?: string
          deros?: string | null
          ets?: string | null
          first_name: string
          group_id?: string | null
          id?: string
          last_name: string
          mos?: string
          organization_id: string
          rank: string
          slug: string
        }
        Update: {
          archived_at?: string | null
          clinic_role?: string
          created_at?: string
          deros?: string | null
          ets?: string | null
          first_name?: string
          group_id?: string | null
          id?: string
          last_name?: string
          mos?: string
          organization_id?: string
          rank?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_documents: {
        Row: {
          archived_at: string | null
          content_type: string
          created_at: string
          file_path: string
          file_size_bytes: number
          id: string
          organization_id: string
          personnel_id: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          archived_at?: string | null
          content_type: string
          created_at?: string
          file_path: string
          file_size_bytes: number
          id?: string
          organization_id: string
          personnel_id: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          archived_at?: string | null
          content_type?: string
          created_at?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          organization_id?: string
          personnel_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_documents_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_extended_info: {
        Row: {
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          award_tracking_acknowledged_at: string | null
          basd: string | null
          blood_type: string | null
          children: Json | null
          civilian_education: string | null
          created_at: string
          date_of_rank: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          marital_status: string | null
          military_education: Json | null
          number_of_dependents: number | null
          organization_id: string
          personal_email: string | null
          personal_phone: string | null
          personnel_id: string
          spouse_name: string | null
          spouse_phone: string | null
          updated_at: string
          vehicle_color: string | null
          vehicle_make_model: string | null
          vehicle_plate: string | null
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          award_tracking_acknowledged_at?: string | null
          basd?: string | null
          blood_type?: string | null
          children?: Json | null
          civilian_education?: string | null
          created_at?: string
          date_of_rank?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          id?: string
          marital_status?: string | null
          military_education?: Json | null
          number_of_dependents?: number | null
          organization_id: string
          personal_email?: string | null
          personal_phone?: string | null
          personnel_id: string
          spouse_name?: string | null
          spouse_phone?: string | null
          updated_at?: string
          vehicle_color?: string | null
          vehicle_make_model?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          award_tracking_acknowledged_at?: string | null
          basd?: string | null
          blood_type?: string | null
          children?: Json | null
          civilian_education?: string | null
          created_at?: string
          date_of_rank?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          id?: string
          marital_status?: string | null
          military_education?: Json | null
          number_of_dependents?: number | null
          organization_id?: string
          personal_email?: string | null
          personal_phone?: string | null
          personnel_id?: string
          spouse_name?: string | null
          spouse_phone?: string | null
          updated_at?: string
          vehicle_color?: string | null
          vehicle_make_model?: string | null
          vehicle_plate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_extended_info_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_extended_info_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: true
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_follow_ups: {
        Row: {
          archived_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          notes: string | null
          organization_id: string
          personnel_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          personnel_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          personnel_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_follow_ups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_follow_ups_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_ict_completions: {
        Row: {
          completed_at: string
          created_at: string
          ict_task_id: string
          id: string
          logged_by: string | null
          notes: string | null
          organization_id: string
          personnel_id: string
          updated_at: string
          validated_by: string | null
          validation_method: Database["public"]["Enums"]["ict_validation_method"]
        }
        Insert: {
          completed_at: string
          created_at?: string
          ict_task_id: string
          id?: string
          logged_by?: string | null
          notes?: string | null
          organization_id: string
          personnel_id: string
          updated_at?: string
          validated_by?: string | null
          validation_method: Database["public"]["Enums"]["ict_validation_method"]
        }
        Update: {
          completed_at?: string
          created_at?: string
          ict_task_id?: string
          id?: string
          logged_by?: string | null
          notes?: string | null
          organization_id?: string
          personnel_id?: string
          updated_at?: string
          validated_by?: string | null
          validation_method?: Database["public"]["Enums"]["ict_validation_method"]
        }
        Relationships: [
          {
            foreignKeyName: "personnel_ict_completions_ict_task_id_fkey"
            columns: ["ict_task_id"]
            isOneToOne: false
            referencedRelation: "ict_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_ict_completions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_ict_completions_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_onboardings: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          organization_id: string
          personnel_id: string
          started_at: string
          status: string
          template_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          organization_id: string
          personnel_id: string
          started_at?: string
          status?: string
          template_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          personnel_id?: string
          started_at?: string
          status?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_onboardings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_onboardings_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_onboardings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_trainings: {
        Row: {
          certificate_url: string | null
          completion_date: string | null
          created_at: string
          expiration_date: string | null
          id: string
          notes: string | null
          organization_id: string
          personnel_id: string
          training_type_id: string
          updated_at: string
        }
        Insert: {
          certificate_url?: string | null
          completion_date?: string | null
          created_at?: string
          expiration_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          personnel_id: string
          training_type_id: string
          updated_at?: string
        }
        Update: {
          certificate_url?: string | null
          completion_date?: string | null
          created_at?: string
          expiration_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          personnel_id?: string
          training_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_trainings_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_trainings_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_trainings_training_type_id_fkey"
            columns: ["training_type_id"]
            isOneToOne: false
            referencedRelation: "training_types"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_announcements: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          message: string
          title: string
          type: Database["public"]["Enums"]["announcement_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          title: string
          type?: Database["public"]["Enums"]["announcement_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          title?: string
          type?: Database["public"]["Enums"]["announcement_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      rating_scheme_entries: {
        Row: {
          created_at: string
          eval_type: string
          id: string
          intermediate_rater_name: string | null
          intermediate_rater_person_id: string | null
          notes: string | null
          organization_id: string
          rated_person_id: string
          rater_name: string | null
          rater_person_id: string | null
          rating_period_end: string
          rating_period_start: string
          report_type: string | null
          reviewer_name: string | null
          reviewer_person_id: string | null
          senior_rater_name: string | null
          senior_rater_person_id: string | null
          status: string
          updated_at: string
          workflow_status: string | null
        }
        Insert: {
          created_at?: string
          eval_type: string
          id?: string
          intermediate_rater_name?: string | null
          intermediate_rater_person_id?: string | null
          notes?: string | null
          organization_id: string
          rated_person_id: string
          rater_name?: string | null
          rater_person_id?: string | null
          rating_period_end: string
          rating_period_start: string
          report_type?: string | null
          reviewer_name?: string | null
          reviewer_person_id?: string | null
          senior_rater_name?: string | null
          senior_rater_person_id?: string | null
          status?: string
          updated_at?: string
          workflow_status?: string | null
        }
        Update: {
          created_at?: string
          eval_type?: string
          id?: string
          intermediate_rater_name?: string | null
          intermediate_rater_person_id?: string | null
          notes?: string | null
          organization_id?: string
          rated_person_id?: string
          rater_name?: string | null
          rater_person_id?: string | null
          rating_period_end?: string
          rating_period_start?: string
          report_type?: string | null
          reviewer_name?: string | null
          reviewer_person_id?: string | null
          senior_rater_name?: string | null
          senior_rater_person_id?: string | null
          status?: string
          updated_at?: string
          workflow_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rating_scheme_entries_intermediate_rater_person_id_fkey"
            columns: ["intermediate_rater_person_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_scheme_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_scheme_entries_rated_person_id_fkey"
            columns: ["rated_person_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_scheme_entries_rater_person_id_fkey"
            columns: ["rater_person_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_scheme_entries_reviewer_person_id_fkey"
            columns: ["reviewer_person_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_scheme_entries_senior_rater_person_id_fkey"
            columns: ["senior_rater_person_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_in_rosters: {
        Row: {
          blank_date: boolean
          created_at: string
          created_by: string
          filter_config: Json | null
          id: string
          organization_id: string
          personnel_ids: string[]
          personnel_snapshot: Json
          roster_date: string | null
          scope_group_ids: string[]
          separate_by_group: boolean
          signed_file_path: string | null
          sort_by: string
          title: string
        }
        Insert: {
          blank_date?: boolean
          created_at?: string
          created_by: string
          filter_config?: Json | null
          id?: string
          organization_id: string
          personnel_ids?: string[]
          personnel_snapshot: Json
          roster_date?: string | null
          scope_group_ids?: string[]
          separate_by_group?: boolean
          signed_file_path?: string | null
          sort_by?: string
          title: string
        }
        Update: {
          blank_date?: boolean
          created_at?: string
          created_by?: string
          filter_config?: Json | null
          id?: string
          organization_id?: string
          personnel_ids?: string[]
          personnel_snapshot?: Json
          roster_date?: string | null
          scope_group_ids?: string[]
          separate_by_group?: boolean
          signed_file_path?: string | null
          sort_by?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sign_in_rosters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      special_days: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
          organization_id: string
          type: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          organization_id: string
          type: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          organization_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_days_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      status_types: {
        Row: {
          color: string
          created_at: string
          da6_availability_treatment: string | null
          da6_treatment_reviewed: boolean
          id: string
          name: string
          organization_id: string
          sort_order: number
          text_color: string
        }
        Insert: {
          color?: string
          created_at?: string
          da6_availability_treatment?: string | null
          da6_treatment_reviewed?: boolean
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          text_color?: string
        }
        Update: {
          color?: string
          created_at?: string
          da6_availability_treatment?: string | null
          da6_treatment_reviewed?: boolean
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          text_color?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_types_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          attempt_count: number
          created_at: string
          data: Json
          error: string | null
          event_created_at: string | null
          id: string
          last_error: string | null
          object_id: string | null
          processed: boolean
          processed_at: string | null
          processing_result: string | null
          processing_state: string
          secondary_dedupe_key: string | null
          type: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          data: Json
          error?: string | null
          event_created_at?: string | null
          id: string
          last_error?: string | null
          object_id?: string | null
          processed?: boolean
          processed_at?: string | null
          processing_result?: string | null
          processing_state?: string
          secondary_dedupe_key?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          data?: Json
          error?: string | null
          event_created_at?: string | null
          id?: string
          last_error?: string | null
          object_id?: string | null
          processed?: boolean
          processed_at?: string | null
          processing_result?: string | null
          processing_state?: string
          secondary_dedupe_key?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_types: {
        Row: {
          applies_to_mos: string[]
          applies_to_ranks: string[]
          applies_to_roles: string[]
          can_be_exempted: boolean
          color: string
          created_at: string
          description: string | null
          excluded_mos: string[]
          excluded_ranks: string[]
          excluded_roles: string[]
          exempt_personnel_ids: Json
          expiration_date_only: boolean
          expiration_months: number | null
          id: string
          is_optional: boolean
          name: string
          organization_id: string
          sort_order: number
          warning_days_orange: number
          warning_days_yellow: number
        }
        Insert: {
          applies_to_mos?: string[]
          applies_to_ranks?: string[]
          applies_to_roles?: string[]
          can_be_exempted?: boolean
          color?: string
          created_at?: string
          description?: string | null
          excluded_mos?: string[]
          excluded_ranks?: string[]
          excluded_roles?: string[]
          exempt_personnel_ids?: Json
          expiration_date_only?: boolean
          expiration_months?: number | null
          id?: string
          is_optional?: boolean
          name: string
          organization_id: string
          sort_order?: number
          warning_days_orange?: number
          warning_days_yellow?: number
        }
        Update: {
          applies_to_mos?: string[]
          applies_to_ranks?: string[]
          applies_to_roles?: string[]
          can_be_exempted?: boolean
          color?: string
          created_at?: string
          description?: string | null
          excluded_mos?: string[]
          excluded_ranks?: string[]
          excluded_roles?: string[]
          exempt_personnel_ids?: Json
          expiration_date_only?: boolean
          expiration_months?: number | null
          id?: string
          is_optional?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          warning_days_orange?: number
          warning_days_yellow?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_types_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      training_views: {
        Row: {
          column_ids: string[]
          created_at: string
          created_by: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          column_ids?: string[]
          created_at?: string
          created_by?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          column_ids?: string[]
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_email_identities: {
        Row: {
          created_at: string
          normalized_email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          normalized_email: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          normalized_email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_org_preferences: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_org_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_pinned_groups: {
        Row: {
          created_at: string
          group_name: string
          id: string
          organization_id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          group_name: string
          id?: string
          organization_id: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          group_name?: string
          id?: string
          organization_id?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_pinned_groups_clinic_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          first_name: string | null
          last_name: string | null
          rank: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          last_name?: string | null
          rank?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          last_name?: string | null
          rank?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_suspensions: {
        Row: {
          reason: string | null
          suspended_at: string
          suspended_by: string
          user_id: string
        }
        Insert: {
          reason?: string | null
          suspended_at?: string
          suspended_by: string
          user_id: string
        }
        Update: {
          reason?: string | null
          suspended_at?: string
          suspended_by?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_organization_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          accept_status: string
          accepted_organization_id: string
        }[]
      }
      active_personnel_ict_completion_trend: {
        Args: {
          p_ict_task_ids?: string[]
          p_organization_id: string
          p_personnel_ids?: string[]
        }
        Returns: {
          completions: number
          month: string
        }[]
      }
      advanced_duty_revision_actor_can_manage: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      apply_advanced_duty_revision: {
        Args: {
          p_applied_draft_data: Json
          p_change_set_data: Json
          p_draft_id: string
          p_now: string
          p_org_id: string
          p_slot_change_rows: Json
          p_slot_updates: Json
        }
        Returns: Json
      }
      block_invitation_if_member_cap_exceeded: {
        Args: {
          p_block_reason: string
          p_blocked_by: string
          p_invitation_id: string
          p_member_limit: number
          p_org_id: string
        }
        Returns: boolean
      }
      can_access_sign_in_roster: {
        Args: {
          p_organization_id: string
          p_personnel_ids: string[]
          p_personnel_snapshot: Json
          p_required_capability: string
          p_scope_group_ids: string[]
        }
        Returns: boolean
      }
      can_access_sign_in_roster_scope: {
        Args: {
          p_organization_id: string
          p_required_capability: string
          p_scope_group_ids: string[]
        }
        Returns: boolean
      }
      can_edit_availability_record: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      can_edit_calendar: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_edit_critical_tasks: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_edit_daily_assignment_record:
        | {
            Args: { p_assignee_id: string; p_organization_id: string }
            Returns: boolean
          }
        | {
            Args: {
              p_assignee_id: string
              p_assignment_type_id: string
              p_organization_id: string
            }
            Returns: boolean
          }
      can_edit_onboarding: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_edit_personnel: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_edit_personnel_ict_completion_record: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      can_edit_personnel_record: {
        Args: { p_group_id: string; p_organization_id: string }
        Returns: boolean
      }
      can_edit_personnel_training_record: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      can_edit_rating_scheme: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_edit_rating_scheme_record: {
        Args: { p_organization_id: string; p_rated_person_id: string }
        Returns: boolean
      }
      can_edit_training: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_export_organization_data: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_manage_calendar_configuration: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_manage_groups: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_manage_ict_task_library: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_manage_org_members: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_manage_training_configuration: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_update_organization_settings: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_view_availability_record: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      can_view_calendar: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_view_critical_tasks: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_view_daily_assignment_record:
        | {
            Args: { p_assignee_id: string; p_organization_id: string }
            Returns: boolean
          }
        | {
            Args: {
              p_assignee_id: string
              p_assignment_type_id: string
              p_organization_id: string
            }
            Returns: boolean
          }
      can_view_groups: { Args: { p_organization_id: string }; Returns: boolean }
      can_view_onboarding: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_view_personnel: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_view_personnel_ict_completion_record: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      can_view_personnel_record: {
        Args: { p_group_id: string; p_organization_id: string }
        Returns: boolean
      }
      can_view_personnel_training_record: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      can_view_rating_scheme: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_view_rating_scheme_record: {
        Args: { p_organization_id: string; p_rated_person_id: string }
        Returns: boolean
      }
      can_view_training: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      check_account_setup_rate_limit: {
        Args: {
          p_bucket_key: string
          p_checked_at?: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: {
          limited: boolean
          retry_after_ms: number
        }[]
      }
      check_durable_rate_limit: {
        Args: {
          p_bucket_key: string
          p_checked_at?: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: {
          limited: boolean
          retry_after_ms: number
        }[]
      }
      claim_account_setup_link_for_session: {
        Args: {
          p_access_request_id: string
          p_claimed_at?: string
          p_setup_link_id: string
        }
        Returns: {
          access_request_id: string
          claim_status: string
          claimed_at: string
          created_at: string
          expires_at: string
          failed_at: string
          failure_reason: string
          revocation_reason: string
          revoked_at: string
          setup_link_id: string
          used_at: string
        }[]
      }
      cleanup_old_audit_logs: { Args: never; Returns: number }
      cleanup_old_webhook_events: { Args: never; Returns: number }
      count_memberships_by_organization: {
        Args: { p_org_ids: string[] }
        Returns: {
          membership_count: number
          organization_id: string
        }[]
      }
      count_org_personnel: { Args: { p_org_id: string }; Returns: number }
      count_personnel_by_organization: {
        Args: { p_org_ids: string[] }
        Returns: {
          organization_id: string
          personnel_count: number
        }[]
      }
      count_platform_users: { Args: never; Returns: Json }
      create_org_with_owner: { Args: { p_name: string }; Returns: string }
      daily_signups_last_30_days: { Args: never; Returns: Json }
      decline_organization_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          decline_status: string
          declined_organization_id: string
        }[]
      }
      delete_unused_organization_rank_catalog_entry: {
        Args: { p_code: string; p_entry_id: string; p_organization_id: string }
        Returns: undefined
      }
      get_current_session_started_at: { Args: never; Returns: string }
      get_effective_tier: { Args: { p_org_id: string }; Returns: Json }
      is_full_editor_for_org: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      is_org_member: { Args: { p_organization_id: string }; Returns: boolean }
      is_org_owner: { Args: { p_organization_id: string }; Returns: boolean }
      is_org_privileged: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_user_suspended: { Args: { check_user_id: string }; Returns: boolean }
      is_valid_sensitive_file_path: {
        Args: { bucket_name: string; object_name: string }
        Returns: boolean
      }
      latest_active_personnel_ict_completions: {
        Args: {
          p_ict_task_ids?: string[]
          p_organization_id: string
          p_personnel_ids?: string[]
        }
        Returns: {
          completed_at: string
          created_at: string
          ict_task_id: string
          id: string
          logged_by: string | null
          notes: string | null
          organization_id: string
          personnel_id: string
          updated_at: string
          validated_by: string | null
          validation_method: Database["public"]["Enums"]["ict_validation_method"]
        }[]
        SetofOptions: {
          from: "*"
          to: "personnel_ict_completions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_audit_log_actions: {
        Args: { p_excluded_actions?: string[]; p_org_id: string }
        Returns: {
          action: string
        }[]
      }
      list_platform_organization_tier_counts: {
        Args: never
        Returns: {
          count: number
          gift_tier: string
          tier: string
        }[]
      }
      list_platform_owner_membership_metrics: {
        Args: { p_org_ids: string[] }
        Returns: {
          organization_id: string
          owner_count: number
          owner_email: string
          owner_user_id: string
        }[]
      }
      list_rating_scheme_personnel_lookup: {
        Args: { p_organization_id: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
          rank: string
        }[]
      }
      mark_organization_invitation_email_outbox_delivery: {
        Args: {
          p_last_error?: string
          p_marked_at?: string
          p_outbox_id: string
          p_status: string
        }
        Returns: {
          attempt_count: number
          created_at: string
          id: string
          invitation_id: string
          last_error: string | null
          organization_id: string
          purpose: string
          recipient: string
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "organization_invitation_email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      member_access_capability_level: {
        Args: { p_can_edit: boolean; p_can_view: boolean }
        Returns: string
      }
      member_access_capability_override: {
        Args: { p_base_level: string; p_can_edit: boolean; p_can_view: boolean }
        Returns: string
      }
      member_access_group_scope_matches: {
        Args: { p_group_id: string; p_organization_id: string }
        Returns: boolean
      }
      member_access_has_capability: {
        Args: {
          p_lane: string
          p_organization_id: string
          p_required_capability: string
        }
        Returns: boolean
      }
      member_access_lane_capability: {
        Args: {
          p_capability_overrides: Json
          p_lane: string
          p_member_preset: string
        }
        Returns: string
      }
      member_access_required_capability_rank: {
        Args: { p_capability: string }
        Returns: number
      }
      organization_rank_catalog_reference_matches: {
        Args: { p_allow_normalized: boolean; p_code: string; p_value: string }
        Returns: boolean
      }
      password_change_attempt: {
        Args: {
          p_action: string
          p_actor: string
          p_expires_at?: string
          p_flow?: string
          p_id?: string
          p_session: string
        }
        Returns: Json
      }
      record_retryable_stripe_webhook_event_attempt: {
        Args: {
          p_data: Json
          p_event_created_at: string
          p_id: string
          p_object_id: string
          p_secondary_dedupe_key: string
          p_type: string
        }
        Returns: number
      }
      record_stripe_webhook_event_attempt: {
        Args: {
          p_data: Json
          p_event_created_at: string
          p_id: string
          p_object_id: string
          p_secondary_dedupe_key: string
          p_type: string
        }
        Returns: number
      }
      reject_access_request_and_block_linked_invitations: {
        Args: { p_access_request_id: string; p_reviewer_id: string }
        Returns: {
          blocked_at: string
          invitation_email: string
          organization_id: string
          organization_invitation_id: string
          reject_status: string
        }[]
      }
      replace_advanced_duty_run_snapshot: {
        Args: {
          p_draft_lineage_key: string
          p_org_id: string
          p_snapshot_data: Json
        }
        Returns: {
          applied_at: string | null
          applied_run_id: string | null
          apply_error: string | null
          candidate_personnel_ids: Json
          created_at: string
          created_by_user_id: string | null
          draft_lineage_key: string
          end_date: string
          event_count: number
          event_dates: Json
          expires_at: string
          export_model: Json | null
          id: string
          input_payload: Json
          organization_id: string
          pattern: string
          preview_payload: Json
          snapshot_fingerprint: string
          snapshot_payload: Json
          snapshot_version: number
          start_date: string
          status: string
          template_id: string
          template_name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "advanced_duty_run_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_organization_invitation: {
        Args: { p_invitation_id: string; p_organization_id: string }
        Returns: {
          revoke_status: string
          revoked_email: string
        }[]
      }
      search_users_by_email: {
        Args: { max_results?: number; search_query: string }
        Returns: Json
      }
      sensitive_file_object_is_readable: {
        Args: { bucket_name: string; object_name: string }
        Returns: boolean
      }
      sensitive_file_object_is_writable: {
        Args: { bucket_name: string; object_name: string }
        Returns: boolean
      }
      sign_in_roster_scope_matches_personnel: {
        Args: {
          p_organization_id: string
          p_personnel_ids: string[]
          p_personnel_snapshot: Json
          p_scope_group_ids: string[]
        }
        Returns: boolean
      }
      storage_object_org_id: { Args: { object_name: string }; Returns: string }
      storage_object_scope: { Args: { object_name: string }; Returns: string }
      transfer_org_ownership: {
        Args: { p_new_owner_id: string; p_organization_id: string }
        Returns: undefined
      }
      update_advanced_duty_event_aggregate: {
        Args: {
          p_duty_event_id: string
          p_event_data: Json
          p_org_id: string
          p_slot_rows?: Json
        }
        Returns: Json
      }
      update_advanced_duty_template_aggregate: {
        Args: {
          p_org_id: string
          p_rotation_baseline_rows?: Json
          p_slot_rows?: Json
          p_template_data: Json
          p_template_id: string
        }
        Returns: Json
      }
      upsert_organization_billing_snapshot_and_mirror_if_current: {
        Args: { p_event_position?: Json; p_mirror: Json; p_snapshot: Json }
        Returns: boolean
      }
      upsert_organization_billing_snapshot_if_current: {
        Args: { p_snapshot: Json }
        Returns: boolean
      }
    }
    Enums: {
      announcement_type: "info" | "warning" | "maintenance"
      ict_validation_method:
        | "Lecture"
        | "Demonstration"
        | "Practical Exercise"
        | "Simulation"
        | "Case Study"
        | "Discussion"
        | "Problem-Based Learning"
        | "Role-Playing"
        | "Other"
      invitation_status:
        | "pending"
        | "accepted"
        | "revoked"
        | "declined"
        | "expired"
        | "blocked"
      organization_role: "owner" | "admin" | "member"
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
      announcement_type: ["info", "warning", "maintenance"],
      ict_validation_method: [
        "Lecture",
        "Demonstration",
        "Practical Exercise",
        "Simulation",
        "Case Study",
        "Discussion",
        "Problem-Based Learning",
        "Role-Playing",
        "Other",
      ],
      invitation_status: [
        "pending",
        "accepted",
        "revoked",
        "declined",
        "expired",
        "blocked",
      ],
      organization_role: ["owner", "admin", "member"],
    },
  },
} as const
