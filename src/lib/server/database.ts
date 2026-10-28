import type { SupabaseClient as Client } from '@supabase/supabase-js';
import type { Database as GeneratedDatabase } from './database.types';

type Public = GeneratedDatabase['public'];
type InsertWithTriggerPosition<Name extends 'calendar_tasking_equipment' | 'calendar_tasking_checklist_items'> = Omit<
	Public['Tables'][Name],
	'Insert'
> & {
	Insert: Omit<Public['Tables'][Name]['Insert'], 'position'> & {
		position?: Public['Tables'][Name]['Insert']['position'];
	};
};
type AccessRequest = Public['Tables']['access_requests'];
type Functions = GeneratedDatabase['public']['Functions'];
type NullableArgs<Name extends keyof Functions, Keys extends keyof Functions[Name]['Args']> = Omit<
	Functions[Name],
	'Args'
> & {
	Args: { [Key in keyof Functions[Name]['Args']]: Functions[Name]['Args'][Key] | (Key extends Keys ? null : never) };
};

// PostgreSQL accepts these explicit nulls. The generator does not describe argument nullability.
type RpcOverrides = {
	save_organization_setup_answer: NullableArgs<'save_organization_setup_answer', 'p_answer'>;
	save_organization_setup_branch: NullableArgs<'save_organization_setup_branch', 'p_branch'>;
	close_roster_form: NullableArgs<'close_roster_form', 'p_weekend_mode'>;
	password_change_attempt: NullableArgs<'password_change_attempt', 'p_flow' | 'p_id'>;
	complete_account_setup_recovery: NullableArgs<'complete_account_setup_recovery', 'p_first_name' | 'p_last_name'>;
	platform_setup_email_inbox: NullableArgs<'platform_setup_email_inbox', 'p_link_id'>;
	mark_organization_invitation_email_outbox_delivery: NullableArgs<
		'mark_organization_invitation_email_outbox_delivery',
		'p_last_error'
	>;
	list_platform_activity: NullableArgs<'list_platform_activity', 'p_search' | 'p_from' | 'p_to'>;
	delete_group_with_reassignment: NullableArgs<'delete_group_with_reassignment', 'p_target_group_id'>;
	calendar_roster_attribute_timelines: NullableArgs<'calendar_roster_attribute_timelines', 'p_group_ids'>;
	delete_archived_personnel_artifact: NullableArgs<'delete_archived_personnel_artifact', 'p_archived_at'>;
	approve_counseling_deletion_request: NullableArgs<'approve_counseling_deletion_request', 'p_expected_file_path'>;
	roster_signals: NullableArgs<'roster_signals', 'p_personnel_ids'>;
	calendar_tasking_workspace: NullableArgs<'calendar_tasking_workspace', 'p_event_id'>;
	cancel_calendar_event: NullableArgs<'cancel_calendar_event', 'p_reason'>;
	transition_calendar_tasking: NullableArgs<'transition_calendar_tasking', 'p_note'>;
	calendar_deletion_references: NullableArgs<'calendar_deletion_references', 'p_personnel_id' | 'p_group_id'>;
	submit_deletion_request: NullableArgs<'submit_deletion_request', 'p_resource_url'>;
	correct_training_completion: NullableArgs<
		'correct_training_completion',
		'p_completion_date' | 'p_expiration_date' | 'p_notes'
	>;
	set_critical_tasks_defaults: NullableArgs<
		'set_critical_tasks_defaults',
		'p_default_expiration_months' | 'p_expiring_soon_warning_days'
	>;
	latest_active_personnel_ict_completions: NullableArgs<
		'latest_active_personnel_ict_completions',
		'p_personnel_ids' | 'p_ict_task_ids'
	>;
	reconcile_onboarding_packet: NullableArgs<'reconcile_onboarding_packet', 'p_new_template_id'>;
};

export type Database = Omit<GeneratedDatabase, 'public'> & {
	public: Omit<Public, 'Functions' | 'Tables'> & {
		Functions: Omit<Functions, keyof RpcOverrides> & RpcOverrides;
		Tables: Omit<
			Public['Tables'],
			'access_requests' | 'calendar_tasking_equipment' | 'calendar_tasking_checklist_items'
		> & {
			// BEFORE INSERT triggers assign position even though the column has no default.
			calendar_tasking_equipment: InsertWithTriggerPosition<'calendar_tasking_equipment'>;
			calendar_tasking_checklist_items: InsertWithTriggerPosition<'calendar_tasking_checklist_items'>;
			// PostgREST exposes this row-taking function as a read-only computed field.
			access_requests: Omit<AccessRequest, 'Row'> & {
				Row: AccessRequest['Row'] & { setup_grant_live: Functions['setup_grant_live']['Returns'] };
			};
		};
	};
};
export type SupabaseClient = Client<Database>;
