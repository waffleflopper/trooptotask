import { createSupabaseOrganizationSettingsReader } from '$features/organization/index.server';
import type { AdmittedOrganizationRequest } from './requestContexts.server';
import { createRequestNotificationDelivery } from './requestContexts.server';
import { getAdminClient } from '$lib/server/supabase';
import {
	loadOrganizationRankCatalog,
	createSupabasePersonnelRecordPersistence,
	createSupabasePersonnelArtifactWritePort,
	createSupabaseRankCatalogPersistence,
	createSupabaseGroupPersistence,
	createSupabaseSelfPinPersistence,
	createSupabasePersonnelTrainingRosterPort,
	createSupabasePersonnelCriticalTasksRosterPort,
	createSupabasePersonnelRatingSchemeRosterPort,
	createSupabasePersonnelOnboardingRosterPort
} from '$features/personnel/index.server';
import {
	createSupabaseTrainingCatalogPersistence,
	createSupabaseTrainingCertificateStore,
	createSupabaseTrainingCompletionPersistence,
	createSupabaseTrainingOnboardingReferencesPort
} from '$features/training/index.server';
import type {
	correctTrainingCompletion,
	createTrainingRecord,
	listPersonTrainingRecords,
	openTrainingCertificate,
	recordTrainingCompletion,
	updateTrainingRecord,
	deleteTrainingRecord,
	describeTrainingRecordDeletionRequest,
	describeTrainingTypeDeletionRequest,
	importTrainingRecords,
	deleteTrainingType,
	fetchTrainingBriefingReport,
	fetchTrainingWorkspaceData
} from '$features/training/index.server';
import {
	createSupabaseCriticalTasksReadModelAdapter,
	createSupabaseCriticalTaskLibraryPersistence,
	createSupabaseCriticalTaskCompletionPersistence,
	createSupabaseCriticalTasksSettingsWritePort
} from '$features/critical-tasks/index.server';
import type {
	createPersonnelIctCompletion,
	createIctTask,
	updateIctTask,
	importIctTasksBatch,
	fetchCriticalTasksBootstrap,
	fetchCriticalTasksPersonnelHistory,
	fetchCriticalTasksReportsPageModel,
	importIctCompletionsBatch
} from '$features/critical-tasks/index.server';
import type { CriticalTasksSettingsWritePort } from '$features/critical-tasks/contracts';
import type {
	createRatingSchemeEntry,
	describeRatingSchemeEntryDeletionRequest,
	loadRatingSchemeWorkspace,
	removeRatingSchemeEntry
} from '$features/rating-scheme/index.server';
import type {
	describeCounselingDeletionRequest,
	describePersonnelArchiveRequest
} from '$features/personnel/index.server';
import { createSupabaseRatingSchemePersistence } from '$features/rating-scheme/index.server';
import {
	createSupabaseOnboardingReconciliationPort,
	createSupabaseOnboardingNoteAppendPort,
	createSupabaseOnboardingLifecycleTransitionPort,
	createSupabaseOnboardingInactiveStepRemovalPort,
	createSupabaseOnboardingPacketCreationPort,
	createSupabaseOnboardingCatalogPersistence,
	createSupabaseOnboardingWorkflowPersistence
} from '$features/onboarding/index.server';
import type {
	addNote,
	advanceStage,
	cancelOnboarding,
	createOnboardingTemplateStep,
	fetchOnboardingStartOptions,
	fetchOnboardingTemplateActivity,
	fetchOnboardingWorkspace,
	removeInactiveStep,
	resyncOnboarding,
	startOnboarding
} from '$features/onboarding/index.server';

export function createRequestTrainingCatalogContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		trainingCatalog: createSupabaseTrainingCatalogPersistence(request.supabase, request.auth.orgId)
	};
}

export function createRequestTrainingRosterContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof createTrainingRecord>[0] &
	Parameters<typeof listPersonTrainingRecords>[0] &
	Parameters<typeof updateTrainingRecord>[0] &
	Parameters<typeof deleteTrainingRecord>[0] &
	Parameters<typeof importTrainingRecords>[0] &
	Parameters<typeof fetchTrainingWorkspaceData>[0] {
	const rankCatalog = createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId);
	return {
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		selfPins: createSupabaseSelfPinPersistence(request.supabase, request.auth.orgId, request.auth.userId),
		...createRequestTrainingCatalogContext(request),
		loadRankCatalog: () =>
			loadOrganizationRankCatalog({ auth: request.auth, rankCatalog: rankCatalog }, { authorization: 'training-view' }),
		trainingCompletions: createSupabaseTrainingCompletionPersistence(request.supabase, request.auth.orgId),
		personnelTrainingRoster: createSupabasePersonnelTrainingRosterPort(getAdminClient)
	};
}

export function createRequestTrainingCompletionContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof recordTrainingCompletion>[0] &
	Parameters<typeof correctTrainingCompletion>[0] &
	Parameters<typeof openTrainingCertificate>[0] {
	return {
		...createRequestTrainingCatalogContext(request),
		trainingCompletions: createSupabaseTrainingCompletionPersistence(request.supabase, request.auth.orgId),
		personnelTrainingRoster: createSupabasePersonnelTrainingRosterPort(getAdminClient),
		trainingCertificates: createSupabaseTrainingCertificateStore(request.supabase, getAdminClient, request.auth)
	};
}

export function createRequestTrainingBriefingContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof fetchTrainingBriefingReport>[0] {
	const rankCatalog = createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId);
	return {
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		...createRequestTrainingCatalogContext(request),
		loadRankCatalog: () =>
			loadOrganizationRankCatalog(
				{ auth: request.auth, rankCatalog: rankCatalog },
				{ authorization: 'training-records' }
			),
		trainingCompletions: createSupabaseTrainingCompletionPersistence(request.supabase, request.auth.orgId),
		personnelTrainingRoster: createSupabasePersonnelTrainingRosterPort(getAdminClient),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase)
	};
}

export function createRequestTrainingTypeDeletionContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof deleteTrainingType>[0] {
	const notifications = createRequestNotificationDelivery();
	return {
		...createRequestTrainingCatalogContext(request),
		notifyTrainingTypeDeleted: () =>
			notifications.notifyAdmins(request.auth.orgId, request.auth.userId, {
				type: 'config_type_deleted',
				title: 'Training Type Deleted',
				message: 'A training type was deleted.'
			})
	};
}

export function createRequestCriticalTaskLibraryContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof createIctTask>[0] &
	Parameters<typeof updateIctTask>[0] &
	Parameters<typeof importIctTasksBatch>[0] {
	return {
		auth: request.auth,
		audit: request.audit,
		criticalTaskLibrary: createSupabaseCriticalTaskLibraryPersistence(request.supabase, request.auth.orgId)
	};
}

export function createRequestIctCompletionContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof createPersonnelIctCompletion>[0] & Parameters<typeof importIctCompletionsBatch>[0] {
	return {
		auth: request.auth,
		audit: request.audit,
		criticalTaskLibrary: createSupabaseCriticalTaskLibraryPersistence(request.supabase, request.auth.orgId),
		criticalTaskCompletions: createSupabaseCriticalTaskCompletionPersistence(request.supabase, request.auth.orgId),
		personnelCriticalTasksRoster: createSupabasePersonnelCriticalTasksRosterPort(getAdminClient)
	};
}

export function createRequestCriticalTasksReadContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof fetchCriticalTasksBootstrap>[0] & Parameters<typeof fetchCriticalTasksReportsPageModel>[0] {
	return {
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		auth: request.auth,
		rankCatalog: createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		criticalTaskLibrary: createSupabaseCriticalTaskLibraryPersistence(request.supabase, request.auth.orgId),
		criticalTaskCompletions: createSupabaseCriticalTaskCompletionPersistence(request.supabase, request.auth.orgId),
		personnelCriticalTasksRoster: createSupabasePersonnelCriticalTasksRosterPort(getAdminClient),
		criticalTasksReadModel: createSupabaseCriticalTasksReadModelAdapter(request.supabase)
	};
}

export function createRequestCriticalTasksHistoryContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof fetchCriticalTasksPersonnelHistory>[0] {
	return {
		auth: request.auth,
		criticalTaskLibrary: createSupabaseCriticalTaskLibraryPersistence(request.supabase, request.auth.orgId),
		criticalTaskCompletions: createSupabaseCriticalTaskCompletionPersistence(request.supabase, request.auth.orgId),
		personnelCriticalTasksRoster: createSupabasePersonnelCriticalTasksRosterPort(getAdminClient)
	};
}

export function createRequestCriticalTasksSettingsContext(request: AdmittedOrganizationRequest): {
	auth: AdmittedOrganizationRequest['auth'];
	audit: AdmittedOrganizationRequest['audit'];
	criticalTasksSettingsWrite?: CriticalTasksSettingsWritePort;
} {
	return {
		auth: request.auth,
		audit: request.audit,
		criticalTasksSettingsWrite: createSupabaseCriticalTasksSettingsWritePort(request.supabase)
	};
}

export function createRequestRatingSchemeWriteContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof createRatingSchemeEntry>[0] {
	return {
		auth: request.auth,
		audit: request.audit,
		ratingScheme: createSupabaseRatingSchemePersistence(request.supabase, request.auth.orgId),
		personnelRatingSchemeRoster: createSupabasePersonnelRatingSchemeRosterPort(request.supabase, getAdminClient)
	};
}

export function createRequestRatingSchemeDeletionContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof removeRatingSchemeEntry>[0] {
	const notifications = createRequestNotificationDelivery();
	return {
		...createRequestRatingSchemeWriteContext(request),
		notifyRatingSchemeEntryDeleted: () =>
			notifications.notifyAdmins(request.auth.orgId, request.auth.userId, {
				type: 'config_type_deleted',
				title: 'Rating Scheme Entry Deleted',
				message: 'A rating scheme entry was deleted.'
			})
	};
}

/** The feature that owns a request target describes it with the requester's access. */
export function createRequestDeletionRequestSubmissionContext(request: AdmittedOrganizationRequest) {
	const owners = {
		auth: request.auth,
		audit: request.audit,
		personnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		personnelArtifactWrites: createSupabasePersonnelArtifactWritePort(request.supabase, getAdminClient),
		trainingCatalog: createSupabaseTrainingCatalogPersistence(request.supabase, request.auth.orgId),
		trainingCompletions: createSupabaseTrainingCompletionPersistence(request.supabase, request.auth.orgId),
		personnelTrainingRoster: createSupabasePersonnelTrainingRosterPort(getAdminClient),
		ratingScheme: createSupabaseRatingSchemePersistence(request.supabase, request.auth.orgId),
		personnelRatingSchemeRoster: createSupabasePersonnelRatingSchemeRosterPort(request.supabase, getAdminClient)
	} satisfies Parameters<typeof describePersonnelArchiveRequest>[0] &
		Parameters<typeof describeTrainingRecordDeletionRequest>[0] &
		Parameters<typeof describeRatingSchemeEntryDeletionRequest>[0] &
		Parameters<typeof describeTrainingTypeDeletionRequest>[0] &
		Parameters<typeof describeCounselingDeletionRequest>[0];
	return { ...owners, notifications: createRequestNotificationDelivery() };
}

export function createRequestRatingSchemeWorkspaceContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof loadRatingSchemeWorkspace>[0] {
	return {
		auth: request.auth,
		audit: request.audit,
		ratingScheme: createSupabaseRatingSchemePersistence(request.supabase, request.auth.orgId),
		personnelRatingSchemeRoster: createSupabasePersonnelRatingSchemeRosterPort(request.supabase, getAdminClient)
	};
}

export function createRequestOnboardingTemplateStepContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		onboardingCatalog: createSupabaseOnboardingCatalogPersistence(request.supabase, request.auth.orgId),
		trainingCatalog: createSupabaseTrainingCatalogPersistence(request.supabase, request.auth.orgId),
		trainingOnboardingReferences: createSupabaseTrainingOnboardingReferencesPort(getAdminClient)
	} satisfies Parameters<typeof createOnboardingTemplateStep>[0] & {
		trainingCatalog: ReturnType<typeof createSupabaseTrainingCatalogPersistence>;
	};
}

export function createRequestOnboardingTemplateActivityContext(request: AdmittedOrganizationRequest) {
	return {
		onboardingWorkflow: createSupabaseOnboardingWorkflowPersistence(request.supabase, request.auth.orgId)
	} satisfies Parameters<typeof fetchOnboardingTemplateActivity>[0];
}

export function createRequestOnboardingStartContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof startOnboarding>[0] {
	return {
		auth: request.auth,
		audit: request.audit,
		onboardingWorkflow: createSupabaseOnboardingWorkflowPersistence(request.supabase, request.auth.orgId),
		personnelOnboardingRoster: createSupabasePersonnelOnboardingRosterPort(getAdminClient),
		trainingOnboardingReferences: createSupabaseTrainingOnboardingReferencesPort(getAdminClient),
		onboardingCatalog: createSupabaseOnboardingCatalogPersistence(request.supabase, request.auth.orgId),
		onboardingPacketCreation: createSupabaseOnboardingPacketCreationPort(request.supabase)
	};
}

export function createRequestOnboardingLifecycleContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof cancelOnboarding>[0] {
	return {
		auth: request.auth,
		audit: request.audit,
		onboardingWorkflow: createSupabaseOnboardingWorkflowPersistence(request.supabase, request.auth.orgId),
		personnelOnboardingRoster: createSupabasePersonnelOnboardingRosterPort(getAdminClient),
		onboardingLifecycleTransition: createSupabaseOnboardingLifecycleTransitionPort(request.supabase)
	};
}

export function createRequestOnboardingReconciliationContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof resyncOnboarding>[0] {
	return {
		auth: request.auth,
		audit: request.audit,
		onboardingWorkflow: createSupabaseOnboardingWorkflowPersistence(request.supabase, request.auth.orgId),
		personnelOnboardingRoster: createSupabasePersonnelOnboardingRosterPort(getAdminClient),
		onboardingReconciliation: createSupabaseOnboardingReconciliationPort(request.supabase)
	};
}

export function createRequestOnboardingStepProgressContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof advanceStage>[0] & Parameters<typeof addNote>[0] {
	return {
		auth: request.auth,
		audit: request.audit,
		onboardingWorkflow: createSupabaseOnboardingWorkflowPersistence(request.supabase, request.auth.orgId),
		personnelOnboardingRoster: createSupabasePersonnelOnboardingRosterPort(getAdminClient),
		onboardingNoteAppend: createSupabaseOnboardingNoteAppendPort(request.supabase)
	};
}

export function createRequestOnboardingInactiveStepContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof removeInactiveStep>[0] {
	return {
		auth: request.auth,
		audit: request.audit,
		onboardingWorkflow: createSupabaseOnboardingWorkflowPersistence(request.supabase, request.auth.orgId),
		personnelOnboardingRoster: createSupabasePersonnelOnboardingRosterPort(getAdminClient),
		onboardingInactiveStepRemoval: createSupabaseOnboardingInactiveStepRemovalPort(request.supabase)
	};
}

export function createRequestOnboardingStartOptionsContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof fetchOnboardingStartOptions>[0] {
	const rankCatalog = createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId);
	return {
		auth: request.auth,
		audit: request.audit,
		onboardingCatalog: createSupabaseOnboardingCatalogPersistence(request.supabase, request.auth.orgId),
		loadRankCatalog: () => loadOrganizationRankCatalog({ auth: request.auth, audit: request.audit, rankCatalog })
	};
}

export function createRequestOnboardingWorkspaceContext(
	request: AdmittedOrganizationRequest
): Parameters<typeof fetchOnboardingWorkspace>[0] {
	const rankCatalog = createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId);
	return {
		onboardingCatalog: createSupabaseOnboardingCatalogPersistence(request.supabase, request.auth.orgId),
		loadRankCatalog: () =>
			loadOrganizationRankCatalog({
				auth: request.auth,
				audit: request.audit,
				rankCatalog: rankCatalog
			}),
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		auth: request.auth,
		audit: request.audit,
		onboardingWorkflow: createSupabaseOnboardingWorkflowPersistence(request.supabase, request.auth.orgId),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		personnelOnboardingRoster: createSupabasePersonnelOnboardingRosterPort(getAdminClient),
		trainingOnboardingReferences: createSupabaseTrainingOnboardingReferencesPort(getAdminClient)
	};
}
