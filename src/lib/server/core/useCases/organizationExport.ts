import type { DataStore } from '../ports';

export interface OrganizationExportSection {
	key: string;
	title: string;
	table: string;
	area: string;
}

export type OrganizationExportSections = Record<string, Record<string, unknown>[]>;

export type OrganizationExportPayload = {
	exportedAt: string;
	organizationId: string;
	sectionInventory: Array<OrganizationExportSection & { rowCount: number }>;
	sections: OrganizationExportSections;
} & Record<string, unknown>;

export const ORGANIZATION_EXPORT_SECTIONS = [
	{ key: 'organizationProfile', title: 'Organization Profile', table: 'organizations', area: 'Settings' },
	{ key: 'memberships', title: 'Organization Memberships', table: 'organization_memberships', area: 'Settings' },
	{ key: 'invitations', title: 'Organization Invitations', table: 'organization_invitations', area: 'Settings' },
	{ key: 'dashboardConfigs', title: 'Dashboard Configs', table: 'dashboard_configs', area: 'Settings' },
	{ key: 'deletionRequests', title: 'Deletion Requests', table: 'deletion_requests', area: 'Settings' },
	{
		key: 'gettingStartedProgress',
		title: 'Getting Started Progress',
		table: 'getting_started_progress',
		area: 'Settings'
	},
	{ key: 'notifications', title: 'Notifications', table: 'notifications', area: 'Settings' },
	{
		key: 'userOrgPreferences',
		title: 'User Organization Preferences',
		table: 'user_org_preferences',
		area: 'Settings'
	},
	{ key: 'userPinnedGroups', title: 'User Pinned Groups', table: 'user_pinned_groups', area: 'Settings' },
	{ key: 'auditLogs', title: 'Audit Logs', table: 'audit_logs', area: 'Audit' },
	{ key: 'dataExports', title: 'Data Export Records', table: 'data_exports', area: 'Audit' },
	{ key: 'betaFeedback', title: 'Beta Feedback', table: 'beta_feedback', area: 'Feedback' },
	{ key: 'groups', title: 'Groups', table: 'groups', area: 'Personnel' },
	{ key: 'personnel', title: 'Personnel', table: 'personnel', area: 'Personnel' },
	{
		key: 'personnelExtendedInfo',
		title: 'Personnel Extended Info',
		table: 'personnel_extended_info',
		area: 'Personnel'
	},
	{ key: 'counselingRecords', title: 'Counseling Records', table: 'counseling_records', area: 'Personnel' },
	{ key: 'leaderNotes', title: 'Leader Notes', table: 'leader_notes', area: 'Personnel' },
	{ key: 'personnelFollowUps', title: 'Personnel Follow-ups', table: 'personnel_follow_ups', area: 'Personnel' },
	{ key: 'personnelDocuments', title: 'Personnel Documents', table: 'personnel_documents', area: 'Personnel' },
	{ key: 'signInRosters', title: 'Sign-in Rosters', table: 'sign_in_rosters', area: 'Personnel' },
	{ key: 'statusTypes', title: 'Status Types', table: 'status_types', area: 'Calendar' },
	{ key: 'availabilityEntries', title: 'Availability Entries', table: 'availability_entries', area: 'Calendar' },
	{ key: 'assignmentTypes', title: 'Assignment Types', table: 'assignment_types', area: 'Calendar' },
	{ key: 'dailyAssignments', title: 'Daily Assignments', table: 'daily_assignments', area: 'Calendar' },
	{ key: 'specialDays', title: 'Special Days', table: 'special_days', area: 'Calendar' },
	{ key: 'trainingTypes', title: 'Training Types', table: 'training_types', area: 'Training' },
	{ key: 'personnelTrainings', title: 'Personnel Trainings', table: 'personnel_trainings', area: 'Training' },
	{ key: 'trainingViews', title: 'Training Views', table: 'training_views', area: 'Training' },
	{ key: 'ictTasks', title: 'Critical Tasks', table: 'ict_tasks', area: 'Critical Tasks' },
	{
		key: 'personnelIctCompletions',
		title: 'Critical Task Completions',
		table: 'personnel_ict_completions',
		area: 'Critical Tasks'
	},
	{ key: 'onboardingTemplates', title: 'Onboarding Templates', table: 'onboarding_templates', area: 'Onboarding' },
	{
		key: 'onboardingTemplateSteps',
		title: 'Onboarding Template Steps',
		table: 'onboarding_template_steps',
		area: 'Onboarding'
	},
	{ key: 'personnelOnboardings', title: 'Personnel Onboardings', table: 'personnel_onboardings', area: 'Onboarding' },
	{
		key: 'onboardingStepProgress',
		title: 'Onboarding Step Progress',
		table: 'onboarding_step_progress',
		area: 'Onboarding'
	},
	{ key: 'ratingSchemeEntries', title: 'Rating Scheme Entries', table: 'rating_scheme_entries', area: 'Evals' },
	{ key: 'dutyTemplates', title: 'Advanced Duty Templates', table: 'duty_templates', area: 'Duty Rosters' },
	{
		key: 'dutyTemplateSlots',
		title: 'Advanced Duty Template Slots',
		table: 'duty_template_slots',
		area: 'Duty Rosters'
	},
	{
		key: 'dutyTemplateRotationBaselines',
		title: 'Advanced Duty Rotation Baselines',
		table: 'duty_template_rotation_baselines',
		area: 'Duty Rosters'
	},
	{ key: 'dutyEventRuns', title: 'Advanced Duty Runs', table: 'duty_event_runs', area: 'Duty Rosters' },
	{ key: 'dutyEvents', title: 'Advanced Duty Events', table: 'duty_events', area: 'Duty Rosters' },
	{ key: 'dutyEventSlots', title: 'Advanced Duty Event Slots', table: 'duty_event_slots', area: 'Duty Rosters' },
	{
		key: 'advancedDutyRunSnapshots',
		title: 'Advanced Duty Run Snapshots',
		table: 'advanced_duty_run_snapshots',
		area: 'Duty Rosters'
	},
	{
		key: 'advancedDutyRevisionDrafts',
		title: 'Advanced Duty Revision Drafts',
		table: 'advanced_duty_revision_drafts',
		area: 'Duty Rosters'
	},
	{
		key: 'advancedDutyRevisionChangeSets',
		title: 'Advanced Duty Revision Change Sets',
		table: 'advanced_duty_revision_change_sets',
		area: 'Duty Rosters'
	},
	{
		key: 'advancedDutyRevisionSlotChanges',
		title: 'Advanced Duty Revision Slot Changes',
		table: 'advanced_duty_revision_slot_changes',
		area: 'Duty Rosters'
	},
	{ key: 'dutyRosterHistory', title: 'Legacy Duty Roster History', table: 'duty_roster_history', area: 'Duty Rosters' },
	{ key: 'dutyRosterTemplates', title: 'Duty Roster Templates', table: 'duty_roster_templates', area: 'Duty Rosters' },
	{
		key: 'dutyRosterTemplateRuns',
		title: 'Duty Roster Template Runs',
		table: 'duty_roster_template_runs',
		area: 'Duty Rosters'
	},
	{
		key: 'dutyRosterTemplateRunCorrections',
		title: 'Duty Roster Template Run Corrections',
		table: 'duty_roster_template_run_corrections',
		area: 'Duty Rosters'
	}
] as const;

export async function loadOrganizationExportPayload(
	store: DataStore,
	orgId: string
): Promise<OrganizationExportPayload> {
	const entries = await Promise.all(
		ORGANIZATION_EXPORT_SECTIONS.map(async (section) => {
			const rows = await store.findMany<Record<string, unknown>>(section.table, orgId);
			return [section.key, rows] as const;
		})
	);
	const sections = Object.fromEntries(entries) as OrganizationExportSections;
	const sectionInventory = ORGANIZATION_EXPORT_SECTIONS.map((section) => ({
		...section,
		rowCount: sections[section.key]?.length ?? 0
	}));

	return {
		exportedAt: new Date().toISOString(),
		organizationId: orgId,
		sectionInventory,
		sections,
		...sections
	};
}
