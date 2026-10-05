import { listNotificationExportRows } from '$features/notifications/index.server';
import type { OrganizationDataExportReads } from '$features/data-export/index.server';
import { listDeletionRequestExportRows, type DeletionRequestStore } from '$features/deletion-requests/index.server';
import type { createRequestOrganizationExportContext } from '$lib/server/adapters/requestContexts.server';

export function createOrganizationDataExportReads(
	ctx: Pick<
		ReturnType<typeof createRequestOrganizationExportContext>,
		| 'auth'
		| 'archiveReaders'
		| 'organizationRawExport'
		| 'personnelOrganizationExport'
		| 'notificationSelf'
		| 'feedbackExport'
		| 'signInRosterExport'
	>,
	deletionRequestStore: DeletionRequestStore
): OrganizationDataExportReads {
	const { auth, archiveReaders, organizationRawExport, personnelOrganizationExport } = ctx;
	if (!personnelOrganizationExport) throw new Error('Personnel Organization export port is required');
	const orgId = auth.orgId;

	return {
		organizationProfile: () => organizationRawExport.listRows(orgId, 'organizations'),
		memberships: () => organizationRawExport.listRows(orgId, 'organization_memberships'),
		invitations: () => organizationRawExport.listRows(orgId, 'organization_invitations'),
		invitationEmailOutbox: () => organizationRawExport.listRows(orgId, 'organization_invitation_email_outbox'),
		invitationAccessRequestLinks: () =>
			organizationRawExport.listRows(orgId, 'access_request_organization_invitation_links'),
		organizationRankCatalog: () => archiveReaders.personnel.listRows('organization_rank_catalog'),
		dashboardConfigs: () => archiveReaders.dashboard.listRows(),
		deletionRequests: () => listDeletionRequestExportRows(deletionRequestStore, orgId),
		gettingStartedProgress: () => archiveReaders.identity.listRows('getting_started_progress'),
		notifications: () => listNotificationExportRows(ctx.notificationSelf),
		userOrgPreferences: () => archiveReaders.identity.listRows('user_org_preferences'),
		userPinnedGroups: () => archiveReaders.personnel.listRows('user_pinned_groups'),
		auditLogs: () => archiveReaders.audit.listRows(),
		dataExports: () => archiveReaders.dataExport.listRows(),
		betaFeedback: () => ctx.feedbackExport.listRows(orgId),
		groups: () => archiveReaders.personnel.listRows('groups'),
		personnel: () => archiveReaders.personnel.listRows('personnel'),
		personnelExtendedInfo: () => personnelOrganizationExport.listRows(auth, 'personnel_extended_info'),
		counselingRecords: () => personnelOrganizationExport.listRows(auth, 'counseling_records'),
		leaderNotes: () => personnelOrganizationExport.listRows(auth, 'leader_notes'),
		personnelFollowUps: () => personnelOrganizationExport.listRows(auth, 'personnel_follow_ups'),
		personnelDocuments: () => personnelOrganizationExport.listRows(auth, 'personnel_documents'),
		signInRosters: () => ctx.signInRosterExport.listRows(),
		statusTypes: () => archiveReaders.calendar.listRows('status_types'),
		availabilityEntries: () => archiveReaders.calendar.listRows('availability_entries'),
		assignmentTypes: () => archiveReaders.calendar.listRows('assignment_types'),
		dailyAssignments: () => archiveReaders.calendar.listRows('daily_assignments'),
		specialDays: () => archiveReaders.calendar.listRows('special_days'),
		trainingTypes: () => archiveReaders.training.listRows('training_types'),
		personnelTrainings: () => archiveReaders.training.listRows('personnel_trainings'),
		trainingViews: () => archiveReaders.training.listRows('training_views'),
		ictTasks: () => archiveReaders.criticalTasks.listRows('ict_tasks'),
		personnelIctCompletions: () => archiveReaders.criticalTasks.listRows('personnel_ict_completions'),
		onboardingTemplates: () => archiveReaders.onboarding.listRows('onboarding_templates'),
		onboardingTemplateSteps: () => archiveReaders.onboarding.listRows('onboarding_template_steps'),
		personnelOnboardings: () => archiveReaders.onboarding.listRows('personnel_onboardings'),
		onboardingStepProgress: () => archiveReaders.onboarding.listRows('onboarding_step_progress'),
		ratingSchemeEntries: () => archiveReaders.ratingScheme.listRows()
	};
}
