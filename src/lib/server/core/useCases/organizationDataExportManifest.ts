export const ORGANIZATION_DATA_EXPORT_AREA_KEYS = [
	'settings',
	'audit',
	'feedback',
	'personnel',
	'calendar',
	'training',
	'critical-tasks',
	'onboarding',
	'rating-scheme',
	'duty-rosters'
] as const;

export type OrganizationDataExportAreaKey = (typeof ORGANIZATION_DATA_EXPORT_AREA_KEYS)[number];

export type OrganizationDataExportSelection =
	| { mode: 'all' }
	| { mode: 'areas'; areas: OrganizationDataExportAreaKey[] };

export type OrganizationDataExportSections = Record<string, Record<string, unknown>[]>;

export interface OrganizationDataExportSection {
	key: string;
	title: string;
	table: string;
	areaKey: OrganizationDataExportAreaKey;
	areaLabel: string;
}

export interface OrganizationDataExportLabels {
	personnel: Map<string, string>;
	groups: Map<string, string>;
	statusTypes: Map<string, string>;
	assignmentTypes: Map<string, string>;
	trainingTypes: Map<string, string>;
	criticalTasks: Map<string, string>;
	extendedInfoByPerson: Map<string, Record<string, unknown>>;
}

export interface OrganizationDataExportReadableSheetDefinition {
	name: string;
	areaKey: OrganizationDataExportAreaKey;
	rows: (sections: OrganizationDataExportSections, labels: OrganizationDataExportLabels) => Record<string, unknown>[];
}

const ORGANIZATION_DATA_EXPORT_RESERVED_PAYLOAD_KEYS = new Set([
	'exportedAt',
	'organizationId',
	'sectionInventory',
	'sections'
]);

function section(
	key: string,
	title: string,
	table: string,
	areaKey: OrganizationDataExportAreaKey,
	areaLabel: string
): OrganizationDataExportSection {
	return { key, title, table, areaKey, areaLabel };
}

export const ORGANIZATION_DATA_EXPORT_SECTIONS = [
	section('organizationProfile', 'Organization Profile', 'organizations', 'settings', 'Settings'),
	section('memberships', 'Organization Memberships', 'organization_memberships', 'settings', 'Settings'),
	section('invitations', 'Organization Invitations', 'organization_invitations', 'settings', 'Settings'),
	section(
		'invitationEmailOutbox',
		'Organization Invitation Email Outbox',
		'organization_invitation_email_outbox',
		'settings',
		'Settings'
	),
	section(
		'invitationAccessRequestLinks',
		'Organization Invitation Access Request Links',
		'access_request_organization_invitation_links',
		'settings',
		'Settings'
	),
	section('billingSnapshot', 'Organization Billing Snapshot', 'organization_billing_snapshots', 'settings', 'Settings'),
	section('dashboardConfigs', 'Dashboard Configs', 'dashboard_configs', 'settings', 'Settings'),
	section('deletionRequests', 'Deletion Requests', 'deletion_requests', 'settings', 'Settings'),
	section('gettingStartedProgress', 'Getting Started Progress', 'getting_started_progress', 'settings', 'Settings'),
	section('notifications', 'Notifications', 'notifications', 'settings', 'Settings'),
	section('userOrgPreferences', 'User Organization Preferences', 'user_org_preferences', 'settings', 'Settings'),
	section('userPinnedGroups', 'User Pinned Groups', 'user_pinned_groups', 'settings', 'Settings'),
	section('auditLogs', 'Audit Logs', 'audit_logs', 'audit', 'Audit'),
	section('dataExports', 'Data Export Records', 'data_exports', 'audit', 'Audit'),
	section('betaFeedback', 'Beta Feedback', 'beta_feedback', 'feedback', 'Feedback'),
	section('groups', 'Groups', 'groups', 'personnel', 'Personnel'),
	section('personnel', 'Personnel', 'personnel', 'personnel', 'Personnel'),
	section('personnelExtendedInfo', 'Personnel Extended Info', 'personnel_extended_info', 'personnel', 'Personnel'),
	section('counselingRecords', 'Counseling Records', 'counseling_records', 'personnel', 'Personnel'),
	section('leaderNotes', 'Leader Notes', 'leader_notes', 'personnel', 'Personnel'),
	section('personnelFollowUps', 'Personnel Follow-ups', 'personnel_follow_ups', 'personnel', 'Personnel'),
	section('personnelDocuments', 'Personnel Documents', 'personnel_documents', 'personnel', 'Personnel'),
	section('signInRosters', 'Sign-in Rosters', 'sign_in_rosters', 'personnel', 'Personnel'),
	section('statusTypes', 'Status Types', 'status_types', 'calendar', 'Calendar'),
	section('availabilityEntries', 'Availability Entries', 'availability_entries', 'calendar', 'Calendar'),
	section('assignmentTypes', 'Assignment Types', 'assignment_types', 'calendar', 'Calendar'),
	section('dailyAssignments', 'Daily Assignments', 'daily_assignments', 'calendar', 'Calendar'),
	section('specialDays', 'Special Days', 'special_days', 'calendar', 'Calendar'),
	section('trainingTypes', 'Training Types', 'training_types', 'training', 'Training'),
	section('personnelTrainings', 'Personnel Trainings', 'personnel_trainings', 'training', 'Training'),
	section('trainingViews', 'Training Views', 'training_views', 'training', 'Training'),
	section('ictTasks', 'Critical Tasks', 'ict_tasks', 'critical-tasks', 'Critical Tasks'),
	section(
		'personnelIctCompletions',
		'Critical Task Completions',
		'personnel_ict_completions',
		'critical-tasks',
		'Critical Tasks'
	),
	section('onboardingTemplates', 'Onboarding Templates', 'onboarding_templates', 'onboarding', 'Onboarding'),
	section(
		'onboardingTemplateSteps',
		'Onboarding Template Steps',
		'onboarding_template_steps',
		'onboarding',
		'Onboarding'
	),
	section('personnelOnboardings', 'Personnel Onboardings', 'personnel_onboardings', 'onboarding', 'Onboarding'),
	section('onboardingStepProgress', 'Onboarding Step Progress', 'onboarding_step_progress', 'onboarding', 'Onboarding'),
	section('ratingSchemeEntries', 'Rating Scheme Entries', 'rating_scheme_entries', 'rating-scheme', 'Evals'),
	section('dutyTemplates', 'Advanced Duty Templates', 'duty_templates', 'duty-rosters', 'Duty Rosters'),
	section('dutyTemplateSlots', 'Advanced Duty Template Slots', 'duty_template_slots', 'duty-rosters', 'Duty Rosters'),
	section(
		'dutyTemplateRotationBaselines',
		'Advanced Duty Rotation Baselines',
		'duty_template_rotation_baselines',
		'duty-rosters',
		'Duty Rosters'
	),
	section('dutyEventRuns', 'Advanced Duty Runs', 'duty_event_runs', 'duty-rosters', 'Duty Rosters'),
	section('dutyEvents', 'Advanced Duty Events', 'duty_events', 'duty-rosters', 'Duty Rosters'),
	section('dutyEventSlots', 'Advanced Duty Event Slots', 'duty_event_slots', 'duty-rosters', 'Duty Rosters'),
	section(
		'advancedDutyRunSnapshots',
		'Advanced Duty Run Snapshots',
		'advanced_duty_run_snapshots',
		'duty-rosters',
		'Duty Rosters'
	),
	section(
		'advancedDutyRevisionDrafts',
		'Advanced Duty Revision Drafts',
		'advanced_duty_revision_drafts',
		'duty-rosters',
		'Duty Rosters'
	),
	section(
		'advancedDutyRevisionChangeSets',
		'Advanced Duty Revision Change Sets',
		'advanced_duty_revision_change_sets',
		'duty-rosters',
		'Duty Rosters'
	),
	section(
		'advancedDutyRevisionSlotChanges',
		'Advanced Duty Revision Slot Changes',
		'advanced_duty_revision_slot_changes',
		'duty-rosters',
		'Duty Rosters'
	),
	section('dutyRosterHistory', 'Legacy Duty Roster History', 'duty_roster_history', 'duty-rosters', 'Duty Rosters'),
	section('dutyRosterTemplates', 'Duty Roster Templates', 'duty_roster_templates', 'duty-rosters', 'Duty Rosters'),
	section(
		'dutyRosterTemplateRuns',
		'Duty Roster Template Runs',
		'duty_roster_template_runs',
		'duty-rosters',
		'Duty Rosters'
	),
	section(
		'dutyRosterTemplateRunCorrections',
		'Duty Roster Template Run Corrections',
		'duty_roster_template_run_corrections',
		'duty-rosters',
		'Duty Rosters'
	)
] as const;

export const ORGANIZATION_DATA_EXPORT_READABLE_SHEETS: OrganizationDataExportReadableSheetDefinition[] = [
	{
		name: 'Personnel',
		areaKey: 'personnel',
		rows: (sections, labels) =>
			(sections.personnel ?? []).map((person) => {
				const ext = typeof person.id === 'string' ? labels.extendedInfoByPerson.get(person.id) : undefined;
				return {
					rank: person.rank,
					last_name: person.last_name,
					first_name: person.first_name,
					mos: person.mos,
					clinic_role: person.clinic_role,
					group: lookup(labels.groups, person.group_id),
					ets: person.ets ?? '',
					deros: person.deros ?? '',
					archived_at: person.archived_at ?? '',
					emergency_contact: ext?.emergency_contact_name ?? '',
					emergency_phone: ext?.emergency_contact_phone ?? '',
					phone: ext?.personal_phone ?? '',
					email: ext?.personal_email ?? '',
					address: ext
						? [ext.address_street, ext.address_city, ext.address_state, ext.address_zip].filter(Boolean).join(', ')
						: '',
					leader_notes: ext?.leader_notes ?? ''
				};
			})
	},
	{ name: 'Groups', areaKey: 'personnel', rows: (sections) => sections.groups ?? [] },
	{
		name: 'Calendar',
		areaKey: 'calendar',
		rows: (sections, labels) =>
			(sections.availabilityEntries ?? []).map((entry) => ({
				person: lookup(labels.personnel, entry.personnel_id),
				status: lookup(labels.statusTypes, entry.status_type_id),
				start_date: entry.start_date,
				end_date: entry.end_date,
				note: entry.note ?? ''
			}))
	},
	{ name: 'Training Types', areaKey: 'training', rows: (sections) => sections.trainingTypes ?? [] },
	{
		name: 'Training Records',
		areaKey: 'training',
		rows: (sections, labels) =>
			(sections.personnelTrainings ?? []).map((training) => ({
				person: lookup(labels.personnel, training.personnel_id),
				training_type: lookup(labels.trainingTypes, training.training_type_id),
				completion_date: training.completion_date,
				expiration_date: training.expiration_date,
				notes: training.notes,
				certificate_url: training.certificate_url
			}))
	},
	{ name: 'Status Types', areaKey: 'calendar', rows: (sections) => sections.statusTypes ?? [] },
	{ name: 'Assignment Types', areaKey: 'calendar', rows: (sections) => sections.assignmentTypes ?? [] },
	{
		name: 'Daily Assignments',
		areaKey: 'calendar',
		rows: (sections, labels) =>
			(sections.dailyAssignments ?? []).map((assignment) => ({
				date: assignment.date,
				person: lookup(labels.personnel, assignment.assignee_id),
				assignment_type: lookup(labels.assignmentTypes, assignment.assignment_type_id)
			}))
	},
	{
		name: 'Counseling Records',
		areaKey: 'personnel',
		rows: (sections, labels) =>
			(sections.counselingRecords ?? []).map((record) => ({
				person: lookup(labels.personnel, record.personnel_id),
				date_conducted: record.date_conducted,
				subject: record.subject,
				key_points: record.key_points,
				plan_of_action: record.plan_of_action,
				status: record.status,
				notes: record.notes
			}))
	},
	{
		name: 'Leader Notes',
		areaKey: 'personnel',
		rows: (sections, labels) =>
			(sections.leaderNotes ?? []).map((note) => ({
				person: lookup(labels.personnel, note.personnel_id),
				author: note.author,
				text: note.text,
				created_at: note.created_at,
				archived_at: note.archived_at
			}))
	},
	{
		name: 'Personnel Follow-ups',
		areaKey: 'personnel',
		rows: (sections, labels) =>
			(sections.personnelFollowUps ?? []).map((followUp) => ({
				person: lookup(labels.personnel, followUp.personnel_id),
				title: followUp.title,
				notes: followUp.notes,
				due_date: followUp.due_date,
				status: followUp.status,
				created_at: followUp.created_at,
				completed_at: followUp.completed_at,
				archived_at: followUp.archived_at
			}))
	},
	{
		name: 'Personnel Documents',
		areaKey: 'personnel',
		rows: (sections, labels) =>
			(sections.personnelDocuments ?? []).map((document) => ({
				person: lookup(labels.personnel, document.personnel_id),
				title: document.title,
				file_name:
					String(document.file_path ?? '')
						.split(/[\\/]/)
						.pop() ?? '',
				file_size_bytes: document.file_size_bytes,
				content_type: document.content_type,
				uploaded_by: document.uploaded_by,
				created_at: document.created_at,
				archived_at: document.archived_at
			}))
	},
	{ name: 'Special Days', areaKey: 'calendar', rows: (sections) => sections.specialDays ?? [] },
	{ name: 'Onboarding Templates', areaKey: 'onboarding', rows: (sections) => sections.onboardingTemplates ?? [] },
	{
		name: 'Onboarding Progress',
		areaKey: 'onboarding',
		rows: (sections, labels) =>
			(sections.personnelOnboardings ?? []).map((onboarding) => ({
				person: lookup(labels.personnel, onboarding.personnel_id),
				status: onboarding.status,
				started_at: onboarding.started_at,
				completed_at: onboarding.completed_at,
				cancelled_at: onboarding.cancelled_at
			}))
	},
	{
		name: 'Rating Scheme',
		areaKey: 'rating-scheme',
		rows: (sections, labels) =>
			(sections.ratingSchemeEntries ?? []).map((entry) => ({
				person: lookup(labels.personnel, entry.rated_person_id),
				eval_type: entry.eval_type,
				report_type: entry.report_type,
				rater: lookup(labels.personnel, entry.rater_person_id) || entry.rater_name,
				senior_rater: lookup(labels.personnel, entry.senior_rater_person_id) || entry.senior_rater_name,
				intermediate_rater:
					lookup(labels.personnel, entry.intermediate_rater_person_id) || entry.intermediate_rater_name,
				reviewer: lookup(labels.personnel, entry.reviewer_person_id) || entry.reviewer_name,
				rating_period_start: entry.rating_period_start,
				rating_period_end: entry.rating_period_end,
				status: entry.status,
				workflow_status: entry.workflow_status,
				notes: entry.notes
			}))
	},
	{ name: 'Critical Tasks', areaKey: 'critical-tasks', rows: (sections) => sections.ictTasks ?? [] },
	{
		name: 'Critical Task Completions',
		areaKey: 'critical-tasks',
		rows: (sections, labels) =>
			(sections.personnelIctCompletions ?? []).map((completion) => ({
				person: lookup(labels.personnel, completion.personnel_id),
				task: lookup(labels.criticalTasks, completion.ict_task_id),
				completed_at: completion.completed_at,
				validation_method: completion.validation_method,
				validated_by: completion.validated_by,
				notes: completion.notes
			}))
	},
	{ name: 'Duty Roster Templates', areaKey: 'duty-rosters', rows: (sections) => sections.dutyRosterTemplates ?? [] },
	{
		name: 'Duty Roster Template Runs',
		areaKey: 'duty-rosters',
		rows: (sections) => sections.dutyRosterTemplateRuns ?? []
	},
	{
		name: 'Duty Roster Template Run Corrections',
		areaKey: 'duty-rosters',
		rows: (sections) => sections.dutyRosterTemplateRunCorrections ?? []
	}
];

export function getOrganizationDataExportSections(
	selection: OrganizationDataExportSelection = { mode: 'all' }
): OrganizationDataExportSection[] {
	return ORGANIZATION_DATA_EXPORT_SECTIONS.filter((section) => selectionIncludesArea(selection, section.areaKey));
}

export function getOrganizationDataExportReadableSheets(
	selection: OrganizationDataExportSelection = { mode: 'all' }
): OrganizationDataExportReadableSheetDefinition[] {
	return ORGANIZATION_DATA_EXPORT_READABLE_SHEETS.filter((sheet) => selectionIncludesArea(selection, sheet.areaKey));
}

export function selectionIncludesArea(
	selection: OrganizationDataExportSelection,
	area: OrganizationDataExportAreaKey
): boolean {
	return selection.mode === 'all' || selection.areas.includes(area);
}

export function assertOrganizationDataExportManifestIsSafe(): void {
	const seen = new Set<string>();
	for (const section of ORGANIZATION_DATA_EXPORT_SECTIONS) {
		if (ORGANIZATION_DATA_EXPORT_RESERVED_PAYLOAD_KEYS.has(section.key)) {
			throw new Error(`Organization export section key "${section.key}" conflicts with payload metadata`);
		}
		if (seen.has(section.key)) {
			throw new Error(`Organization export section key "${section.key}" is duplicated`);
		}
		seen.add(section.key);
	}
}

function lookup(labels: Map<string, string>, value: unknown): string {
	const key = typeof value === 'string' ? value : String(value ?? '');
	return labels.get(key) ?? key;
}
