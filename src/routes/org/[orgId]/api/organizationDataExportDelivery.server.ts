import {
	listAssignmentTypeExportRows,
	listAvailabilityExportRows,
	listDailyAssignmentExportRows,
	listSpecialDayExportRows,
	listStatusTypeExportRows
} from '$features/calendar/index.server';
import {
	listCriticalTaskExportRows,
	listPersonnelCriticalTaskCompletionExportRows
} from '$features/critical-tasks/index.server';
import { listDashboardConfigExportRows } from '$features/dashboard/index.server';
import { listDataExportRows, type OrganizationDataExportReads } from '$features/data-export/index.server';
import { listDeletionRequestExportRows, type DeletionRequestStore } from '$features/deletion-requests/index.server';
import { listGettingStartedProgressExportRows, listUserOrgPreferenceExportRows } from '$features/identity/index.server';
import { listNotificationExportRows } from '$features/notifications/index.server';
import {
	listOnboardingStepProgressExportRows,
	listOnboardingTemplateExportRows,
	listOnboardingTemplateStepExportRows,
	listPersonnelOnboardingExportRows
} from '$features/onboarding/index.server';
import {
	listGroupExportRows,
	listOrganizationRankCatalogExportRows,
	listPersonnelExportRows,
	listUserPinnedGroupExportRows
} from '$features/personnel/index.server';
import { listRatingSchemeExportRows } from '$features/rating-scheme/index.server';
import {
	listTrainingCompletionExportRows,
	listTrainingTypeExportRows,
	listTrainingViewExportRows
} from '$features/training/index.server';
import { listAuditExportRows } from '$lib/audit/index.server';
import type { createRequestOrganizationExportContext } from '$lib/server/adapters/requestContexts.server';

export function createOrganizationDataExportReads(
	ctx: Pick<
		ReturnType<typeof createRequestOrganizationExportContext>,
		| 'auth'
		| 'rawStore'
		| 'organizationRawExport'
		| 'personnelOrganizationExport'
		| 'notificationSelf'
		| 'feedbackExport'
		| 'signInRosterExport'
	>,
	deletionRequestStore: DeletionRequestStore
): OrganizationDataExportReads {
	const { auth, rawStore, organizationRawExport, personnelOrganizationExport } = ctx;
	if (!personnelOrganizationExport) throw new Error('Personnel Organization export port is required');
	const orgId = auth.orgId;

	return {
		organizationProfile: () => organizationRawExport.listRows(orgId, 'organizations'),
		memberships: () => organizationRawExport.listRows(orgId, 'organization_memberships'),
		invitations: () => organizationRawExport.listRows(orgId, 'organization_invitations'),
		invitationEmailOutbox: () => organizationRawExport.listRows(orgId, 'organization_invitation_email_outbox'),
		invitationAccessRequestLinks: () =>
			organizationRawExport.listRows(orgId, 'access_request_organization_invitation_links'),
		organizationRankCatalog: () => listOrganizationRankCatalogExportRows(rawStore, orgId),
		dashboardConfigs: () => listDashboardConfigExportRows(rawStore, orgId),
		deletionRequests: () => listDeletionRequestExportRows(deletionRequestStore, orgId),
		gettingStartedProgress: () => listGettingStartedProgressExportRows(rawStore, orgId),
		notifications: () => listNotificationExportRows(ctx.notificationSelf),
		userOrgPreferences: () => listUserOrgPreferenceExportRows(rawStore, orgId),
		userPinnedGroups: () => listUserPinnedGroupExportRows(rawStore, orgId),
		auditLogs: () => listAuditExportRows(rawStore, orgId),
		dataExports: () => listDataExportRows(rawStore, orgId),
		betaFeedback: () => ctx.feedbackExport.listRows(orgId),
		groups: () => listGroupExportRows(rawStore, orgId),
		personnel: () => listPersonnelExportRows(rawStore, orgId),
		personnelExtendedInfo: () => personnelOrganizationExport.listRows(auth, 'personnel_extended_info'),
		counselingRecords: () => personnelOrganizationExport.listRows(auth, 'counseling_records'),
		leaderNotes: () => personnelOrganizationExport.listRows(auth, 'leader_notes'),
		personnelFollowUps: () => personnelOrganizationExport.listRows(auth, 'personnel_follow_ups'),
		personnelDocuments: () => personnelOrganizationExport.listRows(auth, 'personnel_documents'),
		signInRosters: () => ctx.signInRosterExport.listRows(),
		statusTypes: () => listStatusTypeExportRows(rawStore, orgId),
		availabilityEntries: () => listAvailabilityExportRows(rawStore, orgId),
		assignmentTypes: () => listAssignmentTypeExportRows(rawStore, orgId),
		dailyAssignments: () => listDailyAssignmentExportRows(rawStore, orgId),
		specialDays: () => listSpecialDayExportRows(rawStore, orgId),
		trainingTypes: () => listTrainingTypeExportRows(rawStore, orgId),
		personnelTrainings: () => listTrainingCompletionExportRows(rawStore, orgId),
		trainingViews: () => listTrainingViewExportRows(rawStore, orgId),
		ictTasks: () => listCriticalTaskExportRows(rawStore, orgId),
		personnelIctCompletions: () => listPersonnelCriticalTaskCompletionExportRows(rawStore, orgId),
		onboardingTemplates: () => listOnboardingTemplateExportRows(rawStore, orgId),
		onboardingTemplateSteps: () => listOnboardingTemplateStepExportRows(rawStore, orgId),
		personnelOnboardings: () => listPersonnelOnboardingExportRows(rawStore, orgId),
		onboardingStepProgress: () => listOnboardingStepProgressExportRows(rawStore, orgId),
		ratingSchemeEntries: () => listRatingSchemeExportRows(rawStore, orgId)
	};
}
