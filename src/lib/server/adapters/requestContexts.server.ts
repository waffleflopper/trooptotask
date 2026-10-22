import type { ApprovedDeletionEffects } from '$features/deletion-requests/index.server';
import type { DeletionRequestResourceType } from '$features/deletion-requests/contracts';
import { createSupabaseOrganizationInvitationSetupStateLookupPort } from '$features/organization/index.server';
import {
	approvePersonnelArchiveRequest,
	createSupabasePersonnelGovernanceDeletionPort,
	createSupabasePersonnelLifecycleCommands
} from '$features/personnel/index.server';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import { createSupabaseApprovedRatingSchemeDeletionPort } from '$features/rating-scheme/index.server';
import { createSupabaseApprovedTrainingDeletionPort } from '$features/training/index.server';
import { createSupabaseDashboardExportReader } from '$features/dashboard/index.server';
import {
	createSupabaseDataExportReader,
	createSupabaseDataExportLifecycleWriter
} from '$features/data-export/index.server';
import {
	createSupabaseTrainingExportReader,
	createSupabaseTrainingCatalogPersistence,
	createSupabaseTrainingCompletionPersistence,
	createSupabaseTrainingTypeNamesReader
} from '$features/training/index.server';
import {
	createSupabaseCalendarExportReader,
	createSupabaseCalendarAssignmentReplacementPort,
	createSupabaseCalendarAvailabilityRemovalPort,
	createSupabaseCalendarCatalogPersistence,
	createSupabaseCalendarAvailabilityPersistence,
	createSupabaseCalendarAssignmentReader,
	createSupabaseStatusTypeNamesReader
} from '$features/calendar/index.server';
import {
	createSupabaseCriticalTasksExportReader,
	createSupabaseCriticalTasksReadModelAdapter,
	createSupabaseCriticalTaskLibraryPersistence,
	createSupabaseCriticalTaskCompletionPersistence
} from '$features/critical-tasks/index.server';
import { listFeedbackExportRows } from '$features/feedback/index.server';
import {
	createSupabaseNotificationDelivery,
	createSupabaseNotificationStore
} from '$features/notifications/index.server';
import {
	createSupabaseOrganizationAdministratorRecipients,
	createSupabaseOrganizationInvitationDeliveryPort,
	createSupabaseOrganizationInvitationRateLimiter,
	createSupabaseOrganizationMemberEmailsReader,
	createSupabaseOrganizationPolicyWritePort,
	createSupabaseOrganizationRawExportReader,
	createSupabaseOrganizationSettingsReader,
	createSupabaseOrganizationUnitCountsPort
} from '$features/organization/index.server';
import {
	createSupabasePersonnelExportReader,
	createSupabasePersonnelNamesReader,
	createSupabasePersonnelRosterReader,
	createSupabasePersonnelRecordPersistence,
	createSupabasePersonnelArtifactReadPersistence,
	createSupabasePersonnelSheetPersistence,
	createSupabasePersonnelWorkbookHistoryReader,
	createSupabaseGroupPersistence,
	createSupabaseSelfPinPersistence,
	createSupabasePersonnelArtifactWritePort,
	createSupabasePersonnelAwardAcknowledgementPort,
	createSupabasePersonnelCalendarRosterPort,
	createSupabasePersonnelCalendarScopeIds,
	createSupabasePersonnelCriticalTasksRosterPort,
	createSupabasePersonnelOrganizationExportPort,
	createSupabasePersonnelRatingSchemeRosterPort,
	createSupabasePersonnelTrainingRosterPort,
	createSupabaseSignInRosterPersonnelLookupPort,
	findGroupNamesByIds,
	loadOrganizationRankCatalog,
	createSupabaseRankCatalogPersistence
} from '$features/personnel/index.server';
import {
	createSupabaseRatingSchemeExportReader,
	createSupabaseRatingSchemeDuePort,
	createSupabaseRatingSchemePersistence
} from '$features/rating-scheme/index.server';
import {
	createSupabaseSignInRosterPersistence,
	createSupabaseSignInRosterExportReader,
	createSupabaseSignInRosterScanPort
} from '$features/sign-in-rosters/index.server';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { FeatureKey } from '$lib/access/featureSwitches';
import {
	createSupabaseAuditExportReader,
	createSupabaseAuditAdapter,
	createSupabaseOrganizationAuditStore,
	getRequestInfo
} from '$lib/audit/index.server';
import { createSupabaseAccountSetupLinkIssuancePorts } from '$features/identity/index.server';
import { getAdminClient } from '$lib/server/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { createSupabaseScopeEnforcementAdapter } from '$features/personnel/index.server';
import { createSupabaseStorageAdapter } from './supabaseStorage';

import {
	createSupabaseIdentityExportReader,
	createSupabaseSensitiveActionAuthorizer
} from '$features/identity/index.server';
import {
	createSupabaseOnboardingExportReader,
	createSupabaseOnboardingCalendarMarkersPort,
	createSupabaseOnboardingCatalogPersistence,
	createSupabaseOnboardingWorkflowPersistence
} from '$features/onboarding/index.server';
import {
	loadPersonnelDocumentStorageCapBytes,
	requireActiveOrganization,
	type ActiveOrganization
} from '$features/organization/index.server';
import type { LeaderNoteContext, PersonnelArtifactsContext } from '$features/personnel/index.server';

import { readOrganizationMembershipForRequest } from '$features/organization/index.server';
import { getOrLoadRequestMembership } from '$lib/access/index.server';
import { projectOrganizationAccessGrant } from '$lib/access/memberAccessProjection';
import type { AuditPort } from '$lib/audit/contracts';
import type { PersonnelScopeEnforcement } from '$features/personnel/contracts';
import type { PersonnelRecordPersistence } from '$features/personnel/contracts';
import type { Session } from '@supabase/supabase-js';

export interface AdmittedOrganizationRequest {
	readonly auth: OrganizationAccessGrant;
	readonly audit: AuditPort;
	readonly supabase: SupabaseClient;
	readonly session: Session | null;
	readonly scope: PersonnelScopeEnforcement;
	/** Read with the active Organization row, so consumers of a switch add no query. */
	readonly disabledFeatures: readonly FeatureKey[];
}

export type RequestContextBuilder<TContext> = (request: AdmittedOrganizationRequest) => TContext;

export function getAdmittedRequestClient(locals: App.Locals): { supabase: SupabaseClient; userId: string } {
	if (!locals.actor) throw error(401, 'Unauthorized');
	return { supabase: locals.supabase, userId: locals.actor.userId };
}

async function createOrganizationRequest(
	locals: App.Locals,
	supabase: SupabaseClient,
	userId: string,
	organization: ActiveOrganization,
	audit: AuditPort
): Promise<AdmittedOrganizationRequest> {
	const orgId = organization.id;
	const membership = await getOrLoadRequestMembership(locals, userId, orgId, () =>
		readOrganizationMembershipForRequest(supabase, userId, orgId)
	);
	const auth = projectOrganizationAccessGrant(membership, userId, orgId, organization);
	return {
		auth,
		audit,
		supabase,
		session: locals.session,
		scope: createSupabaseScopeEnforcementAdapter({ supabase, orgId, scopeSet: auth.scopeSet }),
		disabledFeatures: organization.disabledFeatures
	};
}

export async function buildRouteRequest(event: RequestEvent): Promise<AdmittedOrganizationRequest> {
	const { supabase, userId } = getAdmittedRequestClient(event.locals);
	const organization = await requireActiveOrganization(event.locals, event.params.orgId as string);
	return createOrganizationRequest(
		event.locals,
		supabase,
		userId,
		organization,
		createSupabaseAuditAdapter(organization.id, getRequestInfo(event))
	);
}

export async function buildLayoutRequest(locals: App.Locals, orgId: string): Promise<AdmittedOrganizationRequest> {
	const { supabase, userId } = getAdmittedRequestClient(locals);
	const organization = await requireActiveOrganization(locals, orgId);
	return createOrganizationRequest(locals, supabase, userId, organization, { log() {} });
}

export function createRequestPersonnelArtifactsContext(
	request: AdmittedOrganizationRequest
): PersonnelArtifactsContext {
	return createPersonnelArtifactDeliveryContext({
		...request,
		organizationPersonnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId),
		personnelArtifactWrites: createSupabasePersonnelArtifactWritePort(request.supabase, getAdminClient),
		artifactReads: createSupabasePersonnelArtifactReadPersistence(request.supabase, request.auth.orgId),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		storage: createSupabaseStorageAdapter(request.supabase)
	});
}

export function createPersonnelArtifactDeliveryContext(
	request: Pick<AdmittedOrganizationRequest, 'auth' | 'audit' | 'scope'> & {
		organizationPersonnel: Pick<PersonnelRecordPersistence, 'findGroupReference'>;
		personnelArtifactWrites: ReturnType<typeof createSupabasePersonnelArtifactWritePort>;
		artifactReads: ReturnType<typeof createSupabasePersonnelArtifactReadPersistence>;
		organizationSettings: Pick<
			ReturnType<typeof createSupabaseOrganizationSettingsReader>,
			'findStorageCapBytes' | 'findMemberLabels'
		>;
		storage: Pick<ReturnType<typeof createSupabaseStorageAdapter>, 'createSignedUrl'>;
	}
): PersonnelArtifactsContext {
	const orgId = request.auth.orgId;
	const artifactWrites = request.personnelArtifactWrites;
	const organizationSettings = request.organizationSettings;
	const storage = request.storage;
	return {
		actor: request.auth,
		scope: request.scope,
		audit: request.audit,
		persistence: {
			async findPersonnelGroup(personnelId) {
				const row = await request.organizationPersonnel.findGroupReference(personnelId);
				return row?.groupId;
			},
			listCounselingRecords: request.artifactReads.listCounselingRecords,
			countActiveCounselingRecords: request.artifactReads.countActiveCounselingRecords,
			listActiveCounselingDates: request.artifactReads.listActiveCounselingDates,
			findCounseling: request.artifactReads.findCounseling,
			listDocuments: request.artifactReads.listDocuments,
			summarizeActiveDocuments: request.artifactReads.summarizeActiveDocuments,
			listFollowUps: request.artifactReads.listFollowUps,
			findDocument: request.artifactReads.findDocument
		},
		writerFor(personnelId) {
			return artifactWrites.forPerson(request.auth, personnelId);
		},
		contributorLabels: (userIds) => organizationSettings.findMemberLabels(orgId, userIds),
		documentStorageCapBytes: () => loadPersonnelDocumentStorageCapBytes(organizationSettings, orgId),
		createDocumentSignedUrl: (filePath, expiresInSeconds) =>
			storage.createSignedUrl('personnel-documents', filePath, expiresInSeconds),
		createCounselingSignedUrl: (filePath, expiresInSeconds) =>
			storage.createSignedUrl(SENSITIVE_FILE_BUCKET, filePath, expiresInSeconds)
	};
}

export function createRequestPersonnelLeaderNoteContext(request: AdmittedOrganizationRequest): LeaderNoteContext {
	return createPersonnelLeaderNoteDeliveryContext({
		...request,
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		organizationPersonnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId),
		personnelArtifactWrites: createSupabasePersonnelArtifactWritePort(request.supabase, getAdminClient),
		artifactReads: createSupabasePersonnelArtifactReadPersistence(request.supabase, request.auth.orgId)
	});
}

export function createPersonnelLeaderNoteDeliveryContext(
	request: Pick<AdmittedOrganizationRequest, 'auth' | 'audit' | 'scope'> & {
		organizationPersonnel: Pick<PersonnelRecordPersistence, 'findGroupReference'>;
		organizationSettings: Pick<ReturnType<typeof createSupabaseOrganizationSettingsReader>, 'findMemberLabels'>;
		personnelArtifactWrites: ReturnType<typeof createSupabasePersonnelArtifactWritePort>;
		artifactReads: ReturnType<typeof createSupabasePersonnelArtifactReadPersistence>;
	}
): LeaderNoteContext {
	const artifactWrites = request.personnelArtifactWrites;
	const orgId = request.auth.orgId;
	const writerFor = (personnelId: string) => artifactWrites.forPerson(request.auth, personnelId);
	return {
		actor: request.auth,
		scope: request.scope,
		audit: request.audit,
		persistence: {
			async findPersonnelGroup(personnelId) {
				const row = await request.organizationPersonnel.findGroupReference(personnelId);
				return row?.groupId;
			},
			listPage: request.artifactReads.listLeaderNotePage,
			countActive: request.artifactReads.countActiveLeaderNotes,
			async find(personnelId, noteId) {
				return (await writerFor(personnelId)).findLeaderNote(noteId);
			},
			async insert(input) {
				return (await writerFor(input.personnelId)).createLeaderNote({
					author: input.author,
					text: input.text,
					createdAt: input.createdAt
				});
			},
			async setArchive(personnelId, noteId, archived) {
				return (await writerFor(personnelId)).setLeaderNoteArchive(noteId, archived);
			},
			async setText(personnelId, noteId, text, updatedAt) {
				return (await writerFor(personnelId)).setLeaderNoteText(noteId, text, updatedAt);
			},
			async delete(personnelId, noteId) {
				return (await writerFor(personnelId)).deleteLeaderNote(noteId);
			}
		},
		contributorLabels: (userIds) => request.organizationSettings.findMemberLabels(orgId, userIds)
	};
}

export function createRequestNotificationDelivery() {
	return createSupabaseNotificationDelivery({
		getAdminClient,
		resolveAdministratorRecipients: createSupabaseOrganizationAdministratorRecipients(getAdminClient)
	});
}

export function createRequestActorContext(request: AdmittedOrganizationRequest) {
	return { auth: request.auth, audit: request.audit };
}

/** Organization audit-log reads use service-role audit and label ports bound to the admitted Organization. */
export function createRequestOrganizationAuditLogContext(request: AdmittedOrganizationRequest) {
	const adminClient = getAdminClient();
	const orgId = request.auth.orgId;
	return {
		auth: request.auth,
		audit: request.audit,
		auditStore: createSupabaseOrganizationAuditStore(adminClient),
		auditLabels: {
			personnelNames: createSupabasePersonnelNamesReader(adminClient, orgId),
			trainingTypeNames: createSupabaseTrainingTypeNamesReader(adminClient, orgId),
			statusTypeNames: createSupabaseStatusTypeNamesReader(adminClient, orgId),
			actorEmails: createSupabaseOrganizationMemberEmailsReader(adminClient, orgId)
		}
	};
}

/** Member invitation delivery, limits and account-setup links require service-role provider access. */
export function createOrganizationInvitationPorts() {
	const adminClient = getAdminClient();
	return {
		invitationDelivery: createSupabaseOrganizationInvitationDeliveryPort(adminClient),
		invitationRateLimiter: createSupabaseOrganizationInvitationRateLimiter(adminClient)
	};
}

export function createAccountSetupLinkIssuancePorts() {
	return createSupabaseAccountSetupLinkIssuancePorts(getAdminClient());
}

export function createRequestEmptyContext(_request: AdmittedOrganizationRequest) {
	return {};
}

export function createRequestPersonnelRecordContext(request: AdmittedOrganizationRequest) {
	const rankCatalog = createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId);
	return {
		auth: request.auth,
		audit: request.audit,
		personnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		organizationPersonnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId),
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		loadRankCatalog: () =>
			loadOrganizationRankCatalog({ auth: request.auth, audit: request.audit, rankCatalog: rankCatalog })
	};
}

export function createRequestRankCatalogContext(request: AdmittedOrganizationRequest) {
	return {
		trainingCatalog: createSupabaseTrainingCatalogPersistence(request.supabase, request.auth.orgId),
		auth: request.auth,
		audit: request.audit,
		rankCatalog: createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId),
		organizationPersonnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId)
	};
}

export function createRequestGroupContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet)
	};
}

export function createRequestSelfPinContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		selfPins: createSupabaseSelfPinPersistence(request.supabase, request.auth.orgId, request.auth.userId)
	};
}

export function createRequestPersonnelRosterContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		roster: createSupabasePersonnelRosterReader(request.supabase, request.auth.orgId, request.auth.scopeSet)
	};
}

export function createRequestPersonnelDetailContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		organizationPersonnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId),
		personnelSheets: createSupabasePersonnelSheetPersistence(request.supabase, request.auth.orgId),
		scope: request.scope
	};
}

export function createRequestPersonnelDetailLayoutContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		artifactReads: createSupabasePersonnelArtifactReadPersistence(request.supabase, request.auth.orgId),
		calendar: {
			...createRequestAvailabilityContext(request),
			calendarCatalogs: createSupabaseCalendarCatalogPersistence(request.supabase, request.auth.orgId)
		}
	};
}

export function createRequestPersonnelExtendedInfoContext(request: AdmittedOrganizationRequest) {
	const organizationSettings = createSupabaseOrganizationSettingsReader(request.supabase);
	return {
		auth: request.auth,
		audit: request.audit,
		personnelSheets: createSupabasePersonnelSheetPersistence(request.supabase, request.auth.orgId),
		personnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		scope: request.scope,
		contributorLabels: (userIds: string[]) => organizationSettings.findMemberLabels(request.auth.orgId, userIds)
	};
}

export function createRequestPersonnelDataSheetContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestPersonnelRecordContext(request),
		...createRequestPersonnelExtendedInfoContext(request)
	};
}

export function createRequestPersonnelAwardContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		disabledFeatures: request.disabledFeatures,
		personnelSheets: createSupabasePersonnelSheetPersistence(request.supabase, request.auth.orgId),
		organizationPersonnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId),
		scope: request.scope
	};
}

export function createRequestPersonnelLifecycleContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		personnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		organizationPersonnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId),
		personnelLifecycle: createSupabasePersonnelLifecycleCommands(request.supabase, request.auth.orgId),
		artifactReads: createSupabasePersonnelArtifactReadPersistence(request.supabase, request.auth.orgId)
	};
}

export function createRequestPersonnelArchiveBatchContext(request: AdmittedOrganizationRequest) {
	return { ...createRequestPersonnelLifecycleContext(request), notifications: createRequestNotificationDelivery() };
}

export function createRequestPersonnelPermanentDeletionContext(request: AdmittedOrganizationRequest) {
	const notifications = createRequestNotificationDelivery();
	return {
		...createRequestPersonnelLifecycleContext(request),
		notifyPersonnelDeleted: (name: string) =>
			notifications.notifyAdmins(request.auth.orgId, request.auth.userId, {
				type: 'personnel_permanently_deleted',
				title: 'Personnel Permanently Deleted',
				message: `Personnel "${name}" was permanently deleted.`
			})
	};
}

export function createRequestPersonnelWorkspaceContext(request: AdmittedOrganizationRequest) {
	const rankCatalog = createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId);
	return {
		...createRequestPersonnelRosterContext(request),
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		selfPins: createSupabaseSelfPinPersistence(request.supabase, request.auth.orgId, request.auth.userId),
		loadRankCatalog: () => loadOrganizationRankCatalog({ auth: request.auth, rankCatalog: rankCatalog }),
		calendarCatalogs: createSupabaseCalendarCatalogPersistence(request.supabase, request.auth.orgId),
		personnelAwardAcknowledgement: createSupabasePersonnelAwardAcknowledgementPort(request.supabase),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		disabledFeatures: request.disabledFeatures
	};
}

export function createRequestPersonnelArchivedArtifactsContext(request: AdmittedOrganizationRequest) {
	return {
		artifacts: createRequestPersonnelArtifactsContext(request),
		leaderNotes: createRequestPersonnelLeaderNoteContext(request)
	};
}

export function createRequestPersonnelOverviewContext(request: AdmittedOrganizationRequest) {
	return {
		calendar: {
			...createRequestAvailabilityContext(request),
			calendarAssignments: createSupabaseCalendarAssignmentReader(request.supabase, request.auth.orgId),
			calendarCatalogs: createSupabaseCalendarCatalogPersistence(request.supabase, request.auth.orgId)
		},
		extendedInfo: createRequestPersonnelExtendedInfoContext(request),
		artifacts: createRequestPersonnelArtifactsContext(request),
		leaderNotes: createRequestPersonnelLeaderNoteContext(request)
	};
}

export function createRequestPersonnelReadinessContext(request: AdmittedOrganizationRequest) {
	const organizationSettings = createSupabaseOrganizationSettingsReader(request.supabase);
	const personnel = createSupabasePersonnelRecordPersistence(
		request.supabase,
		request.auth.orgId,
		request.auth.scopeSet
	);
	return {
		detail: { auth: request.auth, audit: request.audit },
		trainingCatalog: createSupabaseTrainingCatalogPersistence(request.supabase, request.auth.orgId),
		trainingCompletions: createSupabaseTrainingCompletionPersistence(request.supabase, request.auth.orgId),
		organizationSettings,
		criticalTaskLibrary: createSupabaseCriticalTaskLibraryPersistence(request.supabase, request.auth.orgId),
		criticalTaskCompletions: createSupabaseCriticalTaskCompletionPersistence(request.supabase, request.auth.orgId),
		ratingScheme: createSupabaseRatingSchemePersistence(request.supabase, request.auth.orgId),
		onboardingWorkflow: createSupabaseOnboardingWorkflowPersistence(request.supabase, request.auth.orgId),
		findPersonNames: (ids: string[]) => personnel.findDisplayNamesByIds(ids),
		loadLossWarningWindowDays: () => organizationSettings.findLossWarningWindowDays(request.auth.orgId),
		disabledFeatures: request.disabledFeatures
	};
}

export function createRequestPersonnelExportContext(request: AdmittedOrganizationRequest) {
	return {
		disabledFeatures: request.disabledFeatures,
		trainingCompletions: createSupabaseTrainingCompletionPersistence(request.supabase, request.auth.orgId),
		trainingCatalog: createSupabaseTrainingCatalogPersistence(request.supabase, request.auth.orgId),
		...createRequestAvailabilityContext(request),
		calendarCatalogs: createSupabaseCalendarCatalogPersistence(request.supabase, request.auth.orgId),
		organizationPersonnel: createSupabasePersonnelRecordPersistence(request.supabase, request.auth.orgId),
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		personnelWorkbookHistory: createSupabasePersonnelWorkbookHistoryReader(request.supabase, request.auth.orgId)
	};
}

export function createRequestNotificationSelfContext(request: AdmittedOrganizationRequest) {
	return { auth: request.auth, audit: request.audit, store: createSupabaseNotificationStore(request.supabase) };
}

export function createRequestAvailabilityContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		calendarAvailability: createSupabaseCalendarAvailabilityPersistence(request.supabase, {
			orgId: request.auth.orgId,
			scopeSet: request.auth.scopeSet,
			loadScopedPersonnelIds: createSupabasePersonnelCalendarScopeIds(
				request.supabase,
				request.auth.orgId,
				request.auth.scopeSet
			)
		}),
		personnelCalendarRoster: createSupabasePersonnelCalendarRosterPort(getAdminClient)
	};
}

export function createRequestCalendarCatalogContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		calendarCatalogs: createSupabaseCalendarCatalogPersistence(request.supabase, request.auth.orgId)
	};
}

export function createRequestDailyAssignmentContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestCalendarCatalogContext(request),
		calendarAssignments: createSupabaseCalendarAssignmentReader(request.supabase, request.auth.orgId),
		personnelCalendarRoster: createSupabasePersonnelCalendarRosterPort(getAdminClient),
		calendarAssignmentReplacement: createSupabaseCalendarAssignmentReplacementPort(request.supabase, {
			admin: getAdminClient,
			actorId: request.auth.userId
		})
	};
}

export function createRequestRosterSettingsContext(request: AdmittedOrganizationRequest) {
	const rankCatalog = createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId);
	return {
		...createRequestAvailabilityContext(request),
		calendarCatalogs: createSupabaseCalendarCatalogPersistence(request.supabase, request.auth.orgId),
		calendarAssignments: createSupabaseCalendarAssignmentReader(request.supabase, request.auth.orgId),
		loadRankCatalog: () =>
			loadOrganizationRankCatalog({ auth: request.auth, rankCatalog }, { authorization: 'calendar-view' })
	};
}

export function createRequestRosterPlannerContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestRosterSettingsContext(request),
		calendarAssignmentReplacement: createSupabaseCalendarAssignmentReplacementPort(request.supabase, {
			admin: getAdminClient,
			actorId: request.auth.userId
		})
	};
}

export function createRequestAvailabilityRemovalContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		personnelCalendarRoster: createSupabasePersonnelCalendarRosterPort(getAdminClient),
		availabilityRemoval: createSupabaseCalendarAvailabilityRemovalPort(request.supabase, request.auth.orgId)
	};
}

export function createRequestCalendarCatalogDeletionContext(request: AdmittedOrganizationRequest) {
	return { ...createRequestCalendarCatalogContext(request), notifications: createRequestNotificationDelivery() };
}

export function createRequestCalendarRangeContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestAvailabilityContext(request),
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		selfPins: createSupabaseSelfPinPersistence(request.supabase, request.auth.orgId, request.auth.userId),
		calendarCatalogs: createSupabaseCalendarCatalogPersistence(request.supabase, request.auth.orgId),
		calendarAssignments: createSupabaseCalendarAssignmentReader(request.supabase, request.auth.orgId)
	};
}

export function createRequestCalendarWorkspaceContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestCalendarRangeContext(request),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		onboardingCalendarMarkers: createSupabaseOnboardingCalendarMarkersPort(request.supabase),
		disabledFeatures: request.disabledFeatures
	};
}

export function createRequestCalendarReportContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestCalendarCatalogContext(request),
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		personnelCalendarRoster: createSupabasePersonnelCalendarRosterPort(getAdminClient)
	};
}

export function createRequestSignInRosterContext(request: AdmittedOrganizationRequest) {
	return {
		orgId: request.auth.orgId,
		persistence: createSupabaseSignInRosterPersistence(request.supabase, {
			orgId: request.auth.orgId,
			scopeSet: request.auth.scopeSet
		}),
		storage: createSupabaseStorageAdapter(request.supabase),
		audit: request.audit
	};
}

export function createRequestSignInRosterCreationContext(request: AdmittedOrganizationRequest) {
	const rankCatalog = createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId);
	return {
		...createRequestSignInRosterContext(request),
		userId: request.auth.userId,
		scopeSet: request.auth.scopeSet,
		personnelLookup: createSupabaseSignInRosterPersonnelLookupPort(getAdminClient),
		findGroupNamesByIds: (groupIds: string[]) =>
			findGroupNamesByIds(
				{ groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet) },
				groupIds
			),
		loadRankCatalog: () =>
			loadOrganizationRankCatalog(
				{ auth: request.auth, rankCatalog: rankCatalog },
				{ authorization: 'training-records' }
			)
	};
}

export function createRequestSignInRosterUploadContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestSignInRosterContext(request),
		actor: request.auth,
		scans: createSupabaseSignInRosterScanPort(request.supabase, getAdminClient)
	};
}

export function createRequestNotificationContext(request: AdmittedOrganizationRequest) {
	return { auth: request.auth, audit: request.audit, notifications: createRequestNotificationDelivery() };
}

export function createRequestSensitiveActionContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
			supabase: request.supabase,
			authenticatedUserId: request.auth.userId,
			session: request.session
		})
	};
}

export function createRequestOrganizationPolicyContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		organizationPolicyWrite: createSupabaseOrganizationPolicyWritePort(request.supabase)
	};
}

export function createRequestOrganizationExportContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		disabledFeatures: request.disabledFeatures,
		audit: request.audit,
		exportLifecycle: createSupabaseDataExportLifecycleWriter(request.supabase, request.auth.orgId),
		notifications: createRequestNotificationDelivery(),
		archiveReaders: {
			calendar: createSupabaseCalendarExportReader(request.supabase, request.auth.orgId),
			training: createSupabaseTrainingExportReader(request.supabase, request.auth.orgId),
			onboarding: createSupabaseOnboardingExportReader(request.supabase, request.auth.orgId),
			personnel: createSupabasePersonnelExportReader(request.supabase, request.auth.orgId),
			identity: createSupabaseIdentityExportReader(request.supabase, request.auth.orgId),
			criticalTasks: createSupabaseCriticalTasksExportReader(request.supabase, request.auth.orgId),
			dashboard: createSupabaseDashboardExportReader(request.supabase, request.auth.orgId),
			ratingScheme: createSupabaseRatingSchemeExportReader(request.supabase, request.auth.orgId),
			dataExport: createSupabaseDataExportReader(request.supabase, request.auth.orgId),
			audit: createSupabaseAuditExportReader(request.supabase, request.auth.orgId)
		},
		organizationRawExport: createSupabaseOrganizationRawExportReader(request.supabase),
		signInRosterExport: createSupabaseSignInRosterExportReader(request.supabase, request.auth.orgId),
		personnelOrganizationExport: createSupabasePersonnelOrganizationExportPort(getAdminClient),
		notificationSelf: createRequestNotificationSelfContext(request),
		feedbackExport: { listRows: (orgId: string) => listFeedbackExportRows(request.supabase, orgId) }
	};
}

export function createRequestDeletionReviewContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestPersonnelLifecycleContext(request),
		disabledFeatures: request.disabledFeatures,
		notifications: createRequestNotificationDelivery()
	};
}

export function createRequestGettingStartedContext(request: AdmittedOrganizationRequest) {
	return {
		trainingCatalog: createSupabaseTrainingCatalogPersistence(request.supabase, request.auth.orgId),
		auth: request.auth,
		audit: request.audit,
		onboardingCatalog: createSupabaseOnboardingCatalogPersistence(request.supabase, request.auth.orgId),
		ratingScheme: createSupabaseRatingSchemePersistence(request.supabase, request.auth.orgId)
	};
}

/** Counts what the Organization retains, turned-off features included, so only governance pages may use it. */
export function createRequestUnitCountsContext(request: AdmittedOrganizationRequest) {
	const orgId = request.auth.orgId;
	let admin: ReturnType<typeof getAdminClient> | undefined;
	const client = () => (admin ??= getAdminClient());
	return {
		unitCounts: createSupabaseOrganizationUnitCountsPort(client, orgId, {
			countEntries: () => createSupabaseRatingSchemePersistence(client(), orgId).countEntries()
		})
	};
}

export function createRequestDashboardWorkspaceContext(request: AdmittedOrganizationRequest) {
	return {
		trainingCatalog: createSupabaseTrainingCatalogPersistence(request.supabase, request.auth.orgId),
		...createRequestCalendarRangeContext(request),
		...createRequestPersonnelRosterContext(request),
		onboardingWorkflow: createSupabaseOnboardingWorkflowPersistence(request.supabase, request.auth.orgId),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		ratingSchemeDue: createSupabaseRatingSchemeDuePort(
			request.supabase,
			createSupabasePersonnelRatingSchemeRosterPort(request.supabase, getAdminClient)
		),
		personnelAwardAcknowledgement: createSupabasePersonnelAwardAcknowledgementPort(request.supabase),
		disabledFeatures: request.disabledFeatures
	};
}

export function createRequestDashboardSummaryContext(request: AdmittedOrganizationRequest) {
	return {
		trainingCompletions: createSupabaseTrainingCompletionPersistence(request.supabase, request.auth.orgId),
		auth: request.auth,
		audit: request.audit,
		rankCatalog: createSupabaseRankCatalogPersistence(request.supabase, request.auth.orgId),
		groups: createSupabaseGroupPersistence(request.supabase, request.auth.orgId, request.auth.scopeSet),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		criticalTasksReadModel: createSupabaseCriticalTasksReadModelAdapter(request.supabase),
		criticalTaskLibrary: createSupabaseCriticalTaskLibraryPersistence(request.supabase, request.auth.orgId),
		criticalTaskCompletions: createSupabaseCriticalTaskCompletionPersistence(request.supabase, request.auth.orgId),
		personnelCriticalTasksRoster: createSupabasePersonnelCriticalTasksRosterPort(getAdminClient),
		personnelTrainingRoster: createSupabasePersonnelTrainingRosterPort(getAdminClient)
	};
}

/** Approved Deletion Request effects. Counseling removes its file only after the approval commits. */
export function createApprovedDeletionEffects(
	ctx: ReturnType<typeof createRequestDeletionReviewContext>,
	requirePending: (
		orgId: string,
		requestId: string,
		resourceType: DeletionRequestResourceType,
		resourceId: string
	) => Promise<void>
): ApprovedDeletionEffects {
	const training = createSupabaseApprovedTrainingDeletionPort(getAdminClient);
	const rating = createSupabaseApprovedRatingSchemeDeletionPort(getAdminClient);
	const counseling = createSupabasePersonnelGovernanceDeletionPort(getAdminClient, requirePending);
	return {
		approvePersonnelArchive: (requestId, id, reviewedAt) =>
			approvePersonnelArchiveRequest(ctx, requestId, id, reviewedAt),
		approveTrainingType: (requestId, id, reviewedAt) =>
			training.approveTrainingTypeDeletion(ctx, requestId, id, reviewedAt),
		approveTrainingRecord: (requestId, id, reviewedAt) =>
			training.approveTrainingRecordDeletion(ctx, requestId, id, reviewedAt),
		approveRatingEntry: (requestId, id, reviewedAt) =>
			rating.approveRatingSchemeEntryDeletion(ctx, requestId, id, reviewedAt),
		approveCounseling: (requestId, id, reviewedAt) =>
			counseling.deleteApprovedCounselingRecord(ctx.auth, requestId, id, reviewedAt)
	};
}

/** Invitation setup state is read with service-role access only when the members page asks for it. */
export function createOrganizationInvitationSetupStateLookup() {
	return createSupabaseOrganizationInvitationSetupStateLookupPort(getAdminClient);
}
