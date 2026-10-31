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
          approval_basis: string | null
          created_at: string
          email: string
          first_name: string | null
          heard_about: string | null
          heard_about_details: string | null
          id: string
          last_name: string | null
          name: string
          reason: string | null
          rescinded_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          setup_completed_at: string | null
          setup_user_id: string | null
          status: string
        }
        Insert: {
          approval_basis?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          heard_about?: string | null
          heard_about_details?: string | null
          id?: string
          last_name?: string | null
          name: string
          reason?: string | null
          rescinded_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          setup_completed_at?: string | null
          setup_user_id?: string | null
          status?: string
        }
        Update: {
          approval_basis?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          heard_about?: string | null
          heard_about_details?: string | null
          id?: string
          last_name?: string | null
          name?: string
          reason?: string | null
          rescinded_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          setup_completed_at?: string | null
          setup_user_id?: string | null
          status?: string
        }
        Relationships: []
      }
      account_setup_attempts: {
        Row: {
          auth_user_id: string | null
          created_at: string
          id: string
          normalized_email: string
          setup_link_id: string
          state: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          normalized_email: string
          setup_link_id: string
          state: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          normalized_email?: string
          setup_link_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_setup_attempts_setup_link_id_fkey"
            columns: ["setup_link_id"]
            isOneToOne: true
            referencedRelation: "account_setup_links"
            referencedColumns: ["id"]
          },
        ]
      }
      account_setup_links: {
        Row: {
          access_request_id: string
          bounce_reason: string | null
          bounced_at: string | null
          claimed_at: string | null
          created_at: string
          expires_at: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          resend_email_id: string | null
          revocation_reason: string | null
          revoked_at: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          access_request_id: string
          bounce_reason?: string | null
          bounced_at?: string | null
          claimed_at?: string | null
          created_at?: string
          expires_at: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          resend_email_id?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          access_request_id?: string
          bounce_reason?: string | null
          bounced_at?: string | null
          claimed_at?: string | null
          created_at?: string
          expires_at?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          resend_email_id?: string | null
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
          id: string
          name: string
          organization_id: string
          roster_pool_rules: Json | null
          roster_weekend_mode: string
          short_name: string
          show_on_calendar: boolean
          sort_order: number
        }
        Insert: {
          archived_at?: string | null
          assign_to: string
          color?: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          roster_pool_rules?: Json | null
          roster_weekend_mode?: string
          short_name: string
          show_on_calendar?: boolean
          sort_order?: number
        }
        Update: {
          archived_at?: string | null
          assign_to?: string
          color?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          roster_pool_rules?: Json | null
          roster_weekend_mode?: string
          short_name?: string
          show_on_calendar?: boolean
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
          set_for_tasking_id: string | null
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
          set_for_tasking_id?: string | null
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
          set_for_tasking_id?: string | null
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
            foreignKeyName: "availability_entries_org_status_type_fkey"
            columns: ["organization_id", "status_type_id"]
            isOneToOne: false
            referencedRelation: "status_types"
            referencedColumns: ["organization_id", "id"]
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
          {
            foreignKeyName: "availability_entries_tasking_fkey"
            columns: ["organization_id", "set_for_tasking_id"]
            isOneToOne: false
            referencedRelation: "calendar_taskings"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      beta_feedback: {
        Row: {
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
          updated_by: string | null
          user_email: string
          user_id: string
        }
        Insert: {
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
          updated_by?: string | null
          user_email: string
          user_id: string
        }
        Update: {
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
          updated_by?: string | null
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
      calendar_event_activity: {
        Row: {
          actor_id: string | null
          event_id: string
          id: number
          kind: string
          occurred_at: string
          organization_id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          event_id: string
          id?: never
          kind: string
          occurred_at?: string
          organization_id: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          event_id?: string
          id?: never
          kind?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_activity_organization_id_event_id_fkey"
            columns: ["organization_id", "event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          coordinator_user_id: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_on: string
          host_name: string | null
          id: string
          location: string | null
          organization_id: string
          source_reference: string | null
          starts_on: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          coordinator_user_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_on: string
          host_name?: string | null
          id?: string
          location?: string | null
          organization_id: string
          source_reference?: string | null
          starts_on: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          coordinator_user_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_on?: string
          host_name?: string | null
          id?: string
          location?: string | null
          organization_id?: string
          source_reference?: string | null
          starts_on?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_tasking_activity: {
        Row: {
          actor_id: string | null
          id: number
          kind: string
          occurred_at: string
          organization_id: string
          payload: Json
          tasking_id: string
        }
        Insert: {
          actor_id?: string | null
          id?: never
          kind: string
          occurred_at?: string
          organization_id: string
          payload?: Json
          tasking_id: string
        }
        Update: {
          actor_id?: string | null
          id?: never
          kind?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json
          tasking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tasking_activity_organization_id_tasking_id_fkey"
            columns: ["organization_id", "tasking_id"]
            isOneToOne: false
            referencedRelation: "calendar_taskings"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      calendar_tasking_checklist_items: {
        Row: {
          created_at: string
          created_by: string | null
          done: boolean
          done_at: string | null
          done_by: string | null
          id: string
          label: string
          organization_id: string
          position: number
          tasking_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          label: string
          organization_id: string
          position: number
          tasking_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          label?: string
          organization_id?: string
          position?: number
          tasking_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tasking_checklist_item_organization_id_tasking_id_fkey"
            columns: ["organization_id", "tasking_id"]
            isOneToOne: false
            referencedRelation: "calendar_taskings"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      calendar_tasking_equipment: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          position: number
          quantity: number
          returned_quantity: number
          secured_quantity: number
          tasking_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          position: number
          quantity: number
          returned_quantity?: number
          secured_quantity?: number
          tasking_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          position?: number
          quantity?: number
          returned_quantity?: number
          secured_quantity?: number
          tasking_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tasking_equipment_organization_id_tasking_id_fkey"
            columns: ["organization_id", "tasking_id"]
            isOneToOne: false
            referencedRelation: "calendar_taskings"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      calendar_tasking_participants: {
        Row: {
          organization_id: string
          personnel_id: string
          review_since: string | null
          selected_at: string
          selected_by: string | null
          tasking_id: string
        }
        Insert: {
          organization_id: string
          personnel_id: string
          review_since?: string | null
          selected_at?: string
          selected_by?: string | null
          tasking_id: string
        }
        Update: {
          organization_id?: string
          personnel_id?: string
          review_since?: string | null
          selected_at?: string
          selected_by?: string | null
          tasking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tasking_participants_personnel_fkey"
            columns: ["organization_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "calendar_tasking_participants_tasking_fkey"
            columns: ["organization_id", "tasking_id"]
            isOneToOne: false
            referencedRelation: "calendar_taskings"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      calendar_taskings: {
        Row: {
          block_reason: string | null
          blocked_at: string | null
          blocked_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completed_by: string | null
          completion_note: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          execution_ends_on: string | null
          execution_starts_on: string | null
          id: string
          instructions: string | null
          organization_id: string
          qualifications: string | null
          report_time: string | null
          responsible_group_id: string | null
          staffing_required: number | null
          staffing_revision: number
          status: string
          suspense_on: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          block_reason?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          execution_ends_on?: string | null
          execution_starts_on?: string | null
          id?: string
          instructions?: string | null
          organization_id: string
          qualifications?: string | null
          report_time?: string | null
          responsible_group_id?: string | null
          staffing_required?: number | null
          staffing_revision?: number
          status?: string
          suspense_on: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          block_reason?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          execution_ends_on?: string | null
          execution_starts_on?: string | null
          id?: string
          instructions?: string | null
          organization_id?: string
          qualifications?: string | null
          report_time?: string | null
          responsible_group_id?: string | null
          staffing_required?: number | null
          staffing_revision?: number
          status?: string
          suspense_on?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_taskings_event_fkey"
            columns: ["organization_id", "event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "calendar_taskings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_taskings_responsible_group_fkey"
            columns: ["organization_id", "responsible_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      counseling_records: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          conducted_by: string | null
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
          archived_by?: string | null
          conducted_by?: string | null
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
          archived_by?: string | null
          conducted_by?: string | null
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
          id: string
          organization_id: string
          source: string
        }
        Insert: {
          assignee_id: string
          assignment_type_id: string
          created_at?: string
          date: string
          id?: string
          organization_id: string
          source?: string
        }
        Update: {
          assignee_id?: string
          assignment_type_id?: string
          created_at?: string
          date?: string
          id?: string
          organization_id?: string
          source?: string
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
      feedback_replies: {
        Row: {
          author: string
          body: string
          feedback_id: string
          id: string
          sent_at: string
          sent_by: string
        }
        Insert: {
          author: string
          body: string
          feedback_id: string
          id?: string
          sent_at?: string
          sent_by?: string
        }
        Update: {
          author?: string
          body?: string
          feedback_id?: string
          id?: string
          sent_at?: string
          sent_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_replies_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "beta_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_staff_notes: {
        Row: {
          body: string
          feedback_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          feedback_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          feedback_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_staff_notes_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: true
            referencedRelation: "beta_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          depth: number | null
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          path: string[]
          sort_order: number
        }
        Insert: {
          created_at?: string
          depth?: number | null
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          path?: string[]
          sort_order?: number
        }
        Update: {
          created_at?: string
          depth?: number | null
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          path?: string[]
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
          {
            foreignKeyName: "groups_parent_fkey"
            columns: ["organization_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["organization_id", "id"]
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
          archived_by: string | null
          author: string
          created_at: string
          id: string
          organization_id: string
          personnel_id: string
          text: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          author: string
          created_at?: string
          id?: string
          organization_id: string
          personnel_id: string
          text: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          author?: string
          created_at?: string
          id?: string
          organization_id?: string
          personnel_id?: string
          text?: string
          updated_at?: string
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          progress_changed_at: string
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
          progress_changed_at?: string
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
          progress_changed_at?: string
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
            foreignKeyName: "onboarding_step_progress_org_training_type_fkey"
            columns: ["organization_id", "training_type_id"]
            isOneToOne: false
            referencedRelation: "training_types"
            referencedColumns: ["organization_id", "id"]
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
            foreignKeyName: "onboarding_template_steps_org_training_type_fkey"
            columns: ["organization_id", "training_type_id"]
            isOneToOne: false
            referencedRelation: "training_types"
            referencedColumns: ["organization_id", "id"]
          },
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
      organization_creation_requests: {
        Row: {
          created_at: string
          organization_id: string
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_creation_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
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
      organization_setup: {
        Row: {
          answers: Json
          branch: string | null
          finished_at: string | null
          organization_id: string
          prompts: Json
          updated_at: string
        }
        Insert: {
          answers?: Json
          branch?: string | null
          finished_at?: string | null
          organization_id: string
          prompts?: Json
          updated_at?: string
        }
        Update: {
          answers?: Json
          branch?: string | null
          finished_at?: string | null
          organization_id?: string
          prompts?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_setup_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_suspensions: {
        Row: {
          organization_id: string
          reason: string
          suspended_at: string
          suspended_by: string | null
        }
        Insert: {
          organization_id: string
          reason: string
          suspended_at: string
          suspended_by?: string | null
        }
        Update: {
          organization_id?: string
          reason?: string
          suspended_at?: string
          suspended_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_suspensions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
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
          disabled_features: string[]
          id: string
          loss_warning_window_days: number
          name: string
          personnel_document_storage_cap_bytes: number
          strength_floor_percent: number
          suspended_at: string | null
          training_readiness_goal_percent: number
          url_slug: string | null
        }
        Insert: {
          archive_retention_months?: number | null
          created_at?: string
          created_by: string
          critical_tasks_default_expiration_months?: number | null
          critical_tasks_expiring_soon_warning_days?: number | null
          disabled_features?: string[]
          id?: string
          loss_warning_window_days?: number
          name: string
          personnel_document_storage_cap_bytes?: number
          strength_floor_percent?: number
          suspended_at?: string | null
          training_readiness_goal_percent?: number
          url_slug?: string | null
        }
        Update: {
          archive_retention_months?: number | null
          created_at?: string
          created_by?: string
          critical_tasks_default_expiration_months?: number | null
          critical_tasks_expiring_soon_warning_days?: number | null
          disabled_features?: string[]
          id?: string
          loss_warning_window_days?: number
          name?: string
          personnel_document_storage_cap_bytes?: number
          strength_floor_percent?: number
          suspended_at?: string | null
          training_readiness_goal_percent?: number
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
          {
            foreignKeyName: "personnel_organization_group_fkey"
            columns: ["organization_id", "group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      personnel_attribute_history: {
        Row: {
          archived: boolean
          clinic_role: string
          effective_on: string
          group_id: string | null
          mos: string
          organization_id: string
          personnel_id: string
          rank: string
        }
        Insert: {
          archived: boolean
          clinic_role: string
          effective_on: string
          group_id?: string | null
          mos: string
          organization_id: string
          personnel_id: string
          rank: string
        }
        Update: {
          archived?: boolean
          clinic_role?: string
          effective_on?: string
          group_id?: string | null
          mos?: string
          organization_id?: string
          personnel_id?: string
          rank?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_attribute_history_personnel_fkey"
            columns: ["organization_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      personnel_documents: {
        Row: {
          archived_at: string | null
          archived_by: string | null
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
          archived_by?: string | null
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
          archived_by?: string | null
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
          dod_id: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          id: string
          marital_status: string | null
          marital_status_date: string | null
          military_education: Json | null
          number_of_dependents: number | null
          organization_id: string
          personal_email: string | null
          personal_phone: string | null
          personnel_id: string
          spouse_name: string | null
          spouse_phone: string | null
          updated_at: string
          updated_by: string | null
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
          dod_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          id?: string
          marital_status?: string | null
          marital_status_date?: string | null
          military_education?: Json | null
          number_of_dependents?: number | null
          organization_id: string
          personal_email?: string | null
          personal_phone?: string | null
          personnel_id: string
          spouse_name?: string | null
          spouse_phone?: string | null
          updated_at?: string
          updated_by?: string | null
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
          dod_id?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          id?: string
          marital_status?: string | null
          marital_status_date?: string | null
          military_education?: Json | null
          number_of_dependents?: number | null
          organization_id?: string
          personal_email?: string | null
          personal_phone?: string | null
          personnel_id?: string
          spouse_name?: string | null
          spouse_phone?: string | null
          updated_at?: string
          updated_by?: string | null
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
          archived_by: string | null
          completed_at: string | null
          completed_by: string | null
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
          archived_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
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
          archived_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
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
            foreignKeyName: "personnel_ict_completions_org_task_fkey"
            columns: ["organization_id", "ict_task_id"]
            isOneToOne: false
            referencedRelation: "ict_tasks"
            referencedColumns: ["organization_id", "id"]
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
      personnel_training_history: {
        Row: {
          certificate_url: string | null
          completion_date: string | null
          expiration_date: string | null
          id: string
          notes: string | null
          organization_id: string
          personnel_id: string
          superseded_at: string
          training_type_id: string
        }
        Insert: {
          certificate_url?: string | null
          completion_date?: string | null
          expiration_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          personnel_id: string
          superseded_at?: string
          training_type_id: string
        }
        Update: {
          certificate_url?: string | null
          completion_date?: string | null
          expiration_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          personnel_id?: string
          superseded_at?: string
          training_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_training_history_org_training_type_fkey"
            columns: ["organization_id", "training_type_id"]
            isOneToOne: false
            referencedRelation: "training_types"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "personnel_training_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_training_history_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
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
            foreignKeyName: "personnel_trainings_org_training_type_fkey"
            columns: ["organization_id", "training_type_id"]
            isOneToOne: false
            referencedRelation: "training_types"
            referencedColumns: ["organization_id", "id"]
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
      platform_operators: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
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
            foreignKeyName: "rating_scheme_entries_organization_intermediate_rater_fkey"
            columns: ["organization_id", "intermediate_rater_person_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rating_scheme_entries_organization_rater_fkey"
            columns: ["organization_id", "rater_person_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rating_scheme_entries_organization_reviewer_fkey"
            columns: ["organization_id", "reviewer_person_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "rating_scheme_entries_organization_senior_rater_fkey"
            columns: ["organization_id", "senior_rater_person_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["organization_id", "id"]
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
      roster_excusals: {
        Row: {
          assignment_type_id: string
          created_at: string
          ends_on: string | null
          id: string
          organization_id: string
          personnel_id: string
          reason: string
          starts_on: string
        }
        Insert: {
          assignment_type_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          organization_id: string
          personnel_id: string
          reason: string
          starts_on: string
        }
        Update: {
          assignment_type_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          organization_id?: string
          personnel_id?: string
          reason?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_excusals_assignment_type_fkey"
            columns: ["organization_id", "assignment_type_id"]
            isOneToOne: false
            referencedRelation: "assignment_types"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "roster_excusals_personnel_fkey"
            columns: ["organization_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      roster_forms: {
        Row: {
          assignment_type_id: string
          created_at: string
          ends_on: string | null
          id: string
          organization_id: string
          record: Json | null
          rules: Json
          starts_on: string
        }
        Insert: {
          assignment_type_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          organization_id: string
          record?: Json | null
          rules: Json
          starts_on: string
        }
        Update: {
          assignment_type_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          organization_id?: string
          record?: Json | null
          rules?: Json
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_forms_assignment_type_fkey"
            columns: ["organization_id", "assignment_type_id"]
            isOneToOne: false
            referencedRelation: "assignment_types"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      roster_starting_numbers: {
        Row: {
          count: number
          form_id: string
          organization_id: string
          origin: string
          personnel_id: string
          track: string
        }
        Insert: {
          count: number
          form_id: string
          organization_id: string
          origin: string
          personnel_id: string
          track: string
        }
        Update: {
          count?: number
          form_id?: string
          organization_id?: string
          origin?: string
          personnel_id?: string
          track?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_starting_numbers_form_fkey"
            columns: ["organization_id", "form_id"]
            isOneToOne: false
            referencedRelation: "roster_forms"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "roster_starting_numbers_personnel_fkey"
            columns: ["organization_id", "personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      roster_swaps: {
        Row: {
          assignment_type_id: string
          created_at: string
          created_by: string | null
          first_date: string
          first_held_by: string
          first_source: string
          id: string
          organization_id: string
          second_date: string
          second_held_by: string
          second_source: string
        }
        Insert: {
          assignment_type_id: string
          created_at?: string
          created_by?: string | null
          first_date: string
          first_held_by: string
          first_source: string
          id?: string
          organization_id: string
          second_date: string
          second_held_by: string
          second_source: string
        }
        Update: {
          assignment_type_id?: string
          created_at?: string
          created_by?: string | null
          first_date?: string
          first_held_by?: string
          first_source?: string
          id?: string
          organization_id?: string
          second_date?: string
          second_held_by?: string
          second_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_swaps_type_fkey"
            columns: ["organization_id", "assignment_type_id"]
            isOneToOne: false
            referencedRelation: "assignment_types"
            referencedColumns: ["organization_id", "id"]
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
          id: string
          name: string
          organization_id: string
          roster_effect: string
          short_label: string | null
          sort_order: number
          text_color: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          roster_effect?: string
          short_label?: string | null
          sort_order?: number
          text_color?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          roster_effect?: string
          short_label?: string | null
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
          group_id: string
          id: string
          organization_id: string
          sort_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          organization_id: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
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
          {
            foreignKeyName: "user_pinned_groups_group_fkey"
            columns: ["organization_id", "group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["organization_id", "id"]
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
      whats_new_entries: {
        Row: {
          created_at: string
          id: string
          paragraphs: string[]
          published_on: string | null
          published_seq: number | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          paragraphs?: string[]
          published_on?: string | null
          published_seq?: number | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          paragraphs?: string[]
          published_on?: string | null
          published_seq?: number | null
          title?: string
          updated_at?: string
          updated_by?: string | null
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
      access_request_setup_grant_is_live: {
        Args: { p_access_request_id: string }
        Returns: boolean
      }
      active_onboarding_calendar_personnel_ids: {
        Args: { p_organization_id: string }
        Returns: {
          personnel_id: string
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
      add_closure_days: {
        Args: { p_dates: string[]; p_name: string; p_organization_id: string }
        Returns: {
          created_at: string
          date: string
          id: string
          name: string
          organization_id: string
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "special_days"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      append_onboarding_step_note: {
        Args: { p_organization_id: string; p_step_id: string; p_text: string }
        Returns: Json
      }
      approve_counseling_deletion_request: {
        Args: {
          p_expected_file_path: string
          p_organization_id: string
          p_record_id: string
          p_request_id: string
          p_reviewed_at: string
          p_reviewer_id: string
        }
        Returns: undefined
      }
      approve_personnel_archive_request: {
        Args: {
          p_organization_id: string
          p_personnel_id: string
          p_request_id: string
          p_reviewed_at: string
        }
        Returns: boolean
      }
      approve_record_deletion_request: {
        Args: {
          p_organization_id: string
          p_request_id: string
          p_resource_id: string
          p_resource_type: string
          p_reviewed_at: string
          p_reviewer_id: string
        }
        Returns: undefined
      }
      archive_personnel: {
        Args: {
          p_archived_at: string
          p_organization_id: string
          p_personnel_ids: string[]
        }
        Returns: number
      }
      attach_sign_in_roster_scan: {
        Args: {
          p_object_name: string
          p_organization_id: string
          p_roster_id: string
        }
        Returns: string
      }
      calendar_deletion_references: {
        Args: {
          p_group_id: string
          p_organization_id: string
          p_personnel_id: string
        }
        Returns: {
          tasking_id: string
          title: string
        }[]
      }
      calendar_person_labels: {
        Args: { p_organization_id: string; p_personnel_ids: string[] }
        Returns: {
          label: string
          personnel_id: string
        }[]
      }
      calendar_personnel_group_scope_matches: {
        Args: { p_group_id: string; p_organization_id: string }
        Returns: boolean
      }
      calendar_range_projection: {
        Args: {
          p_organization_id: string
          p_range_end: string
          p_range_start: string
        }
        Returns: Json
      }
      calendar_roster_attribute_timelines: {
        Args: {
          p_from: string
          p_group_ids?: string[]
          p_organization_id: string
          p_through: string
        }
        Returns: {
          archived_at: string
          clinic_role: string
          created_at: string
          first_name: string
          group_id: string
          history: Json
          id: string
          last_name: string
          mos: string
          rank: string
        }[]
      }
      calendar_tasking_advisories: {
        Args: { p_organization_id: string; p_tasking_id: string }
        Returns: {
          ends_on: string
          execution_days: number
          is_conflict: boolean
          kind: string
          label: string
          other_tasking_id: string
          overlap_days: number
          personnel_id: string
          starts_on: string
        }[]
      }
      calendar_tasking_attention: {
        Args: { p_limit?: number; p_organization_id: string; p_today: string }
        Returns: {
          attention_total: number
          equipment_not_ready: number
          event_title: string
          execution_starts_on: string
          kind: string
          responsible_group_id: string
          staffing_picked: number
          staffing_required: number
          status: string
          suspense_on: string
          tasking_id: string
          title: string
        }[]
      }
      calendar_tasking_availability_gaps: {
        Args: { p_organization_id: string; p_tasking_id: string }
        Returns: {
          covered: boolean
          personnel_id: string
        }[]
      }
      calendar_tasking_conflict_people: {
        Args: { p_organization_id: string }
        Returns: {
          personnel_id: string
          tasking_id: string
        }[]
      }
      calendar_tasking_dashboard: {
        Args: { p_limit?: number; p_organization_id: string; p_today: string }
        Returns: Json
      }
      calendar_tasking_people: {
        Args: { p_organization_id: string; p_tasking_id: string }
        Returns: {
          archived: boolean
          clinic_role: string
          first_name: string
          group_id: string
          last_name: string
          mos: string
          personnel_id: string
          rank: string
          review_since: string
          selected_at: string
        }[]
      }
      calendar_tasking_staffing: {
        Args: { p_organization_id: string; p_tasking_ids: string[] }
        Returns: {
          needs_review: number
          outside_scope: number
          picked: number
          revision: number
          tasking_id: string
        }[]
      }
      calendar_tasking_workspace: {
        Args: {
          p_event_id?: string
          p_organization_id: string
          p_today: string
        }
        Returns: Json
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
      can_configure_personnel_record: {
        Args: { p_group_id: string; p_organization_id: string }
        Returns: boolean
      }
      can_configure_personnel_training_record: {
        Args: { p_organization_id: string; p_personnel_id: string }
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
      can_edit_daily_assignment_record: {
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
      can_edit_personnel_training_record_with_type: {
        Args: {
          p_organization_id: string
          p_personnel_id: string
          p_training_type_id: string
        }
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
      can_manage_onboarding_configuration: {
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
      can_view_calendar: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      can_view_critical_tasks: {
        Args: { p_organization_id: string }
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
      can_view_personnel_record: {
        Args: { p_group_id: string; p_organization_id: string }
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
      cancel_calendar_event: {
        Args: {
          p_event_id: string
          p_organization_id: string
          p_reason: string
        }
        Returns: undefined
      }
      cancel_own_deletion_request: {
        Args: { p_organization_id: string; p_request_id: string }
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
      close_roster_form: {
        Args: {
          p_actor: string
          p_assignment_type_id: string
          p_carry: Json
          p_form_id: string
          p_organization_id: string
          p_pool_rules: Json
          p_record: Json
          p_today: string
          p_weekend_mode: string
        }
        Returns: string
      }
      complete_account_setup_recovery: {
        Args: {
          p_first_name?: string
          p_last_name?: string
          p_source_setup_link_id: string
          p_target_access_request_id: string
          p_target_setup_link_id: string
        }
        Returns: Json
      }
      complete_organization_file_retirements: {
        Args: { p_bucket_id: string; p_object_names: string[] }
        Returns: number
      }
      correct_training_completion: {
        Args: {
          p_completion_date: string
          p_expiration_date: string
          p_id: string
          p_kind: string
          p_notes: string
          p_organization_id: string
        }
        Returns: Json
      }
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
      create_organization: {
        Args: { p_defaults: Json; p_name: string; p_request_id: string }
        Returns: string
      }
      critical_tasks_personnel_scope_matches: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      current_session_sensitive_action_assured: {
        Args: never
        Returns: boolean
      }
      daily_signups_last_30_days: { Args: never; Returns: Json }
      decline_organization_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          decline_status: string
          declined_organization_id: string
        }[]
      }
      delete_archived_personnel_artifact: {
        Args: {
          p_archived_at: string
          p_artifact_id: string
          p_kind: string
          p_organization_id: string
          p_personnel_id: string
        }
        Returns: {
          bucket_id: string
          deleted: boolean
          file_removed: boolean
          object_name: string
        }[]
      }
      delete_availability_entries: {
        Args: { p_ids: string[]; p_organization_id: string }
        Returns: number
      }
      delete_calendar_event: {
        Args: {
          p_event_id: string
          p_organization_id: string
          p_taskings: string
        }
        Returns: {
          taskings: number
        }[]
      }
      delete_expired_personnel: {
        Args: { p_candidate_ids: string[]; p_cutoff: string; p_org_id: string }
        Returns: number
      }
      delete_expired_unreferenced_assignment_types: {
        Args: { p_candidate_ids: string[]; p_cutoff: string; p_org_id: string }
        Returns: number
      }
      delete_expired_unreferenced_critical_tasks: {
        Args: { p_cutoff: string; p_org_id: string }
        Returns: number
      }
      delete_group_with_reassignment: {
        Args: {
          p_group_id: string
          p_organization_id: string
          p_target_group_id: string
        }
        Returns: number
      }
      delete_onboarding_template: {
        Args: { p_organization_id: string; p_template_id: string }
        Returns: boolean
      }
      delete_sign_in_roster: {
        Args: { p_organization_id: string; p_roster_id: string }
        Returns: {
          retired_object_name: string
          title: string
        }[]
      }
      delete_unused_organization_rank_catalog_entry: {
        Args: { p_code: string; p_entry_id: string; p_organization_id: string }
        Returns: undefined
      }
      duplicate_onboarding_template: {
        Args: {
          p_organization_id: string
          p_request_id: string
          p_source_template_id: string
        }
        Returns: Json
      }
      export_organization_setup: {
        Args: { p_organization_id: string }
        Returns: {
          answers: Json
          branch: string | null
          finished_at: string | null
          organization_id: string
          prompts: Json
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "organization_setup"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      feature_is_off: {
        Args: { p_feature: string; p_organization_id: string }
        Returns: boolean
      }
      finish_organization_setup: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      get_current_session_started_at: { Args: never; Returns: string }
      import_availability_entries: {
        Args: { p_entries: Json; p_organization_id: string }
        Returns: Json
      }
      is_org_member: { Args: { p_organization_id: string }; Returns: boolean }
      is_org_owner: { Args: { p_organization_id: string }; Returns: boolean }
      is_org_privileged: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      is_platform_operator: { Args: never; Returns: boolean }
      is_roster_form_rules: { Args: { p_rules: Json }; Returns: boolean }
      is_roster_pool_rules: { Args: { p_rules: Json }; Returns: boolean }
      is_user_suspended: { Args: { check_user_id: string }; Returns: boolean }
      is_valid_sensitive_file_path: {
        Args: { bucket_name: string; object_name: string }
        Returns: boolean
      }
      issue_account_setup_link: {
        Args: {
          p_access_request_id: string
          p_created_at?: string
          p_expires_at: string
          p_token_hash: string
        }
        Returns: {
          created_at: string
          expires_at: string
          issue_status: string
          revoked_setup_link_ids: string[]
          setup_link_id: string
        }[]
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
      link_organization_invitation_access_request: {
        Args: {
          p_access_scope_group_ids: string[]
          p_access_scope_kind: string
          p_capability_overrides: Json
          p_email: string
          p_invitation_id: string
          p_invited_at: string
          p_invited_by: string
          p_member_preset: string
          p_organization_id: string
          p_role: string
        }
        Returns: {
          access_request_id: string
          bridge_status: string
        }[]
      }
      list_audit_log_actions: {
        Args: { p_excluded_actions?: string[]; p_org_id: string }
        Returns: {
          action: string
        }[]
      }
      list_calendar_event_tasking_summaries: {
        Args: { p_event_id: string; p_organization_id: string }
        Returns: {
          execution_ends_on: string
          execution_starts_on: string
          id: string
          responsible_group_name: string
          staffing_picked: number
          staffing_required: number
          status: string
          suspense_on: string
          title: string
        }[]
      }
      list_pending_organization_file_retirements: {
        Args: { p_limit: number }
        Returns: {
          bucket_id: string
          object_name: string
        }[]
      }
      list_personnel_award_tracking_acknowledged: {
        Args: { p_organization_id: string }
        Returns: {
          personnel_id: string
        }[]
      }
      list_platform_activity: {
        Args: {
          p_actions: string[]
          p_from: string
          p_limit: number
          p_offset: number
          p_prefixes: string[]
          p_search: string
          p_to: string
        }
        Returns: {
          action: string
          actor_email: string
          actor_name: string
          details: Json
          id: string
          ip_address: string
          org_id: string
          org_name: string
          page_offset: number
          resource_id: string
          resource_type: string
          severity: string
          timestamp: string
          total_count: number
          user_id: string
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
      list_roster_detail_days: {
        Args: {
          p_assignment_type_id: string
          p_from: string
          p_organization_id: string
          p_through: string
        }
        Returns: {
          assignee_id: string
          date: string
          source: string
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
      move_group: {
        Args: {
          p_group_id: string
          p_organization_id: string
          p_parent_id?: string
        }
        Returns: {
          depth: number
          id: string
          name: string
          parent_id: string
          sort_order: number
        }[]
      }
      onboarding_template_training_type_matches: {
        Args: { p_organization_id: string; p_training_type_id: string }
        Returns: boolean
      }
      organization_access_admitted:
        | { Args: { p_organization_id: string }; Returns: boolean }
        | {
            Args: { p_feature: string; p_organization_id: string }
            Returns: boolean
          }
      organization_feature_enabled: {
        Args: { p_feature: string; p_organization_id: string }
        Returns: boolean
      }
      organization_member_labels: {
        Args: { p_organization_id: string }
        Returns: {
          email: string
          first_name: string
          last_name: string
          rank: string
          user_id: string
        }[]
      }
      organization_rank_catalog_reference_matches: {
        Args: { p_allow_normalized: boolean; p_code: string; p_value: string }
        Returns: boolean
      }
      organization_storage_object_is_owner_removable: {
        Args: { bucket_name: string; object_name: string }
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
      personnel_dod_ids_in_use: {
        Args: { p_dod_ids: string[]; p_organization_id: string }
        Returns: string[]
      }
      personnel_extended_info_scope_matches: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      personnel_file_artifact_deletion: {
        Args: {
          p_artifact_id: string
          p_kind: string
          p_organization_id: string
          p_personnel_id: string
        }
        Returns: {
          bucket_id: string
          file_removed: boolean
          object_name: string
        }[]
      }
      personnel_sensitive_artifact_is_readable: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      platform_account_directory: {
        Args: {
          p_dir?: string
          p_filter?: string
          p_limit?: number
          p_page?: number
          p_search?: string
          p_sort?: string
        }
        Returns: Json
      }
      platform_announcement_dismissal_counts: {
        Args: never
        Returns: {
          announcement_id: string
          dismissal_count: number
        }[]
      }
      platform_inbox_stats: { Args: { p_since: string }; Returns: Json }
      platform_list_organizations: {
        Args: {
          p_dir?: string
          p_filter: string
          p_page: number
          p_page_size: number
          p_search: string
          p_sort?: string
        }
        Returns: {
          active_week_count: number
          all_count: number
          created_at: string
          last_active_at: string
          member_count: number
          name: string
          organization_id: string
          owner_count: number
          owner_email: string
          page: number
          personnel_count: number
          quiet_count: number
          status: string
          suspended_count: number
          total_count: number
        }[]
      }
      platform_organization_detail: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      platform_organization_status: {
        Args: {
          p_created_at: string
          p_last_active_at: string
          p_suspended_at: string
        }
        Returns: string
      }
      platform_setup_email_inbox: {
        Args: {
          p_limit?: number
          p_link_id?: string
          p_now?: string
          p_tab?: string
        }
        Returns: Json
      }
      platform_suspend_organization: {
        Args: {
          p_actor_user_id: string
          p_organization_id: string
          p_reason: string
          p_suspended_at: string
        }
        Returns: string
      }
      platform_transfer_org_ownership: {
        Args: {
          p_actor_user_id: string
          p_confirm_name: string
          p_organization_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      platform_unsuspend_organization: {
        Args: { p_actor_user_id: string; p_organization_id: string }
        Returns: boolean
      }
      rating_scheme_personnel_group_scope_matches: {
        Args: { p_group_id: string; p_organization_id: string }
        Returns: boolean
      }
      read_calendar_tasking_activity: {
        Args: { p_organization_id: string; p_tasking_id?: string }
        Returns: {
          actor_id: string
          id: number
          kind: string
          occurred_at: string
          organization_id: string
          payload: Json
          tasking_id: string
        }[]
      }
      read_organization_setup: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      read_request_member_access: {
        Args: { p_organization_id: string }
        Returns: {
          access_scope_group_ids: string[]
          access_scope_kind: string
          capability_overrides: Json
          covered_group_ids: string[]
          id: string
          member_preset: string
          role: string
        }[]
      }
      reconcile_account_setup_claim: {
        Args: {
          p_target_access_request_id: string
          p_target_setup_link_id: string
        }
        Returns: Json
      }
      reconcile_onboarding_packet: {
        Args: {
          p_new_template_id?: string
          p_onboarding_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      reconcile_personnel_file_attachment: {
        Args: {
          p_kind: string
          p_object_name: string
          p_organization_id: string
          p_personnel_id: string
        }
        Returns: string
      }
      register_organization_file_upload: {
        Args: {
          p_actor_id: string
          p_bucket_id: string
          p_object_name: string
          p_organization_id: string
          p_upload_id: string
        }
        Returns: string
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
      release_account_setup_claim_for_staff: {
        Args: {
          p_access_request_id: string
          p_evidence_reference: string
          p_operator_user_id: string
          p_release_reason: string
          p_setup_link_id: string
        }
        Returns: boolean
      }
      remove_sign_in_roster_scan: {
        Args: {
          p_expected_object_name: string
          p_organization_id: string
          p_roster_id: string
        }
        Returns: {
          outcome: string
          retired_object_name: string
        }[]
      }
      rename_group: {
        Args: { p_group_id: string; p_name: string; p_organization_id: string }
        Returns: {
          depth: number
          id: string
          name: string
          parent_id: string
          sort_order: number
        }[]
      }
      reorder_calendar_tasking_list: {
        Args: {
          p_ids: string[]
          p_list: string
          p_organization_id: string
          p_tasking_id: string
        }
        Returns: undefined
      }
      reorder_ict_tasks: {
        Args: { p_changes: Json; p_organization_id: string }
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "ict_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reorder_onboarding_template_steps: {
        Args: {
          p_organization_id: string
          p_step_ids: string[]
          p_template_id: string
        }
        Returns: Json
      }
      replace_daily_assignment_slots: {
        Args: {
          p_organization_id: string
          p_replace_days: string[]
          p_slots: Json
        }
        Returns: {
          assignee_id: string
          assignment_type_id: string
          created_at: string
          date: string
          id: string
          organization_id: string
          source: string
        }[]
        SetofOptions: {
          from: "*"
          to: "daily_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reply_to_feedback: {
        Args: { p_body: string; p_close?: boolean; p_feedback_id: string }
        Returns: Json
      }
      reply_to_own_feedback: {
        Args: { p_body: string; p_feedback_id: string }
        Returns: Json
      }
      rescind_access_request_and_block_linked_invitations: {
        Args: { p_access_request_id: string; p_reviewer_id: string }
        Returns: {
          blocked_at: string
          invitation_email: string
          organization_id: string
          organization_invitation_id: string
          rescind_status: string
        }[]
      }
      reset_federal_holidays: {
        Args: { p_holidays: Json; p_organization_id: string }
        Returns: {
          created_at: string
          date: string
          id: string
          name: string
          organization_id: string
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "special_days"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      restore_personnel: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      revoke_organization_invitation: {
        Args: { p_invitation_id: string; p_organization_id: string }
        Returns: {
          revoke_status: string
          revoked_email: string
        }[]
      }
      roster_form_effective_start: {
        Args: { p_form: Database["public"]["Tables"]["roster_forms"]["Row"] }
        Returns: string
      }
      roster_signals: {
        Args: {
          p_as_of: string
          p_organization_id: string
          p_personnel_ids?: string[]
          p_since: string
          p_sources: string[]
        }
        Returns: Json
      }
      save_calendar_tasking_people: {
        Args: {
          p_expected_revision: number
          p_kept_ids: string[]
          p_organization_id: string
          p_personnel_ids: string[]
          p_remove_outside_scope: boolean
          p_tasking_id: string
        }
        Returns: {
          outcome: string
          revision: number
        }[]
      }
      save_feedback_github_issue: {
        Args: {
          p_feedback_id: string
          p_issue_number: number
          p_issue_url: string
        }
        Returns: boolean
      }
      save_feedback_staff_note: {
        Args: { p_body: string; p_feedback_id: string }
        Returns: boolean
      }
      save_organization_setup_answer: {
        Args: { p_answer: string; p_organization_id: string; p_step: string }
        Returns: Json
      }
      save_organization_setup_branch: {
        Args: { p_branch: string; p_organization_id: string }
        Returns: Json
      }
      save_organization_setup_prompt: {
        Args: { p_key: string; p_organization_id: string; p_state: Json }
        Returns: Json
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
      set_calendar_lanes: {
        Args: {
          p_expected_lane_type_ids: string[]
          p_lane_type_ids: string[]
          p_organization_id: string
        }
        Returns: undefined
      }
      set_critical_tasks_defaults: {
        Args: {
          p_default_expiration_months: number
          p_expiring_soon_warning_days: number
          p_organization_id: string
        }
        Returns: undefined
      }
      set_group_order: {
        Args: {
          p_expected_group_ids: string[]
          p_group_ids: string[]
          p_organization_id: string
          p_parent_id?: string
        }
        Returns: undefined
      }
      set_roster_excusals: {
        Args: {
          p_assignment_type_id: string
          p_excusals: Json
          p_organization_id: string
          p_today: string
        }
        Returns: undefined
      }
      set_roster_starting_numbers: {
        Args: {
          p_actor: string
          p_assignment_type_id: string
          p_form_id: string
          p_numbers: Json
          p_organization_id: string
          p_repicks: Json
          p_today: string
        }
        Returns: {
          assignee_id: string
          assignment_type_id: string
          created_at: string
          date: string
          id: string
          organization_id: string
          source: string
        }[]
        SetofOptions: {
          from: "*"
          to: "daily_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_status_type_order: {
        Args: {
          p_expected_status_type_ids: string[]
          p_organization_id: string
          p_status_type_ids: string[]
        }
        Returns: undefined
      }
      set_training_exemption: {
        Args: {
          p_exempt: boolean
          p_organization_id: string
          p_personnel_id: string
          p_training_type_id: string
        }
        Returns: boolean
      }
      set_training_type_order: {
        Args: {
          p_expected_training_type_ids: string[]
          p_organization_id: string
          p_training_type_ids: string[]
        }
        Returns: undefined
      }
      settle_organization_file_upload: {
        Args: {
          p_actor_id: string
          p_bucket_id: string
          p_object_name: string
          p_organization_id: string
          p_upload_id: string
        }
        Returns: boolean
      }
      settle_sign_in_roster_scan_upload: {
        Args: {
          p_object_name: string
          p_organization_id: string
          p_roster_id: string
        }
        Returns: {
          attached: boolean
          retired_object_name: string
        }[]
      }
      setup_grant_live: {
        Args: {
          request: Database["public"]["Tables"]["access_requests"]["Row"]
        }
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
      start_onboarding_packet: {
        Args: {
          p_organization_id: string
          p_personnel_id: string
          p_started_at: string
          p_steps: Json
          p_template_id: string
        }
        Returns: Json
      }
      storage_object_org_id: { Args: { object_name: string }; Returns: string }
      storage_object_scope: { Args: { object_name: string }; Returns: string }
      submit_deletion_request: {
        Args: {
          p_description: string
          p_organization_id: string
          p_requested_by: string
          p_requester_email: string
          p_resource_id: string
          p_resource_type: string
          p_resource_url: string
        }
        Returns: Json
      }
      swap_roster_days: {
        Args: {
          p_assignment_type_id: string
          p_first_date: string
          p_first_was: string
          p_organization_id: string
          p_second_date: string
          p_second_was: string
          p_today: string
        }
        Returns: Json
      }
      training_personnel_scope_matches: {
        Args: { p_organization_id: string; p_personnel_id: string }
        Returns: boolean
      }
      training_record_type_matches: {
        Args: { p_organization_id: string; p_training_type_id: string }
        Returns: boolean
      }
      transfer_org_ownership: {
        Args: { p_new_owner_id: string; p_organization_id: string }
        Returns: undefined
      }
      transition_calendar_tasking: {
        Args: {
          p_action: string
          p_note: string
          p_organization_id: string
          p_tasking_id: string
        }
        Returns: boolean
      }
      undo_roster_swap: {
        Args: { p_organization_id: string; p_swap_id: string; p_today: string }
        Returns: Json
      }
      write_roster_assignment_slots: {
        Args: { p_actor: string; p_organization_id: string; p_slots: Json }
        Returns: {
          assignee_id: string
          assignment_type_id: string
          created_at: string
          date: string
          id: string
          organization_id: string
          source: string
        }[]
        SetofOptions: {
          from: "*"
          to: "daily_assignments"
          isOneToOne: false
          isSetofReturn: true
        }
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
