import { createSupabaseDashboardExportReader } from '$features/dashboard/index.server';
import {
	createSupabaseDataExportReader,
	createSupabaseDataExportLifecycleWriter
} from '$features/data-export/index.server';
import { createSupabaseTrainingExportReader } from '$features/training/index.server';
import {
	createSupabaseCalendarExportReader,
	createSupabaseCalendarAssignmentReplacementPort
} from '$features/calendar/index.server';
import {
	createSupabaseCriticalTasksExportReader,
	createSupabaseCriticalTasksReadModelAdapter,
	createSupabaseCriticalTaskLibraryPersistence
} from '$features/critical-tasks/index.server';
import { listFeedbackExportRows } from '$features/feedback/index.server';
import {
	createSupabaseNotificationDelivery,
	createSupabaseNotificationStore
} from '$features/notifications/index.server';
import {
	createSupabaseOrganizationAdministratorRecipients,
	createSupabaseOrganizationPolicyWritePort,
	createSupabaseOrganizationRawExportReader,
	createSupabaseOrganizationSettingsReader
} from '$features/organization/index.server';
import {
	createSupabasePersonnelExportReader,
	createSupabasePersonnelArtifactWritePort,
	createSupabasePersonnelAwardAcknowledgementPort,
	createSupabasePersonnelCalendarRosterPort,
	createSupabasePersonnelCriticalTasksRosterPort,
	createSupabasePersonnelOrganizationExportPort,
	createSupabasePersonnelTrainingRosterPort,
	createSupabaseSignInRosterPersonnelLookupPort,
	findGroupNamesByIds,
	loadOrganizationRankCatalog
} from '$features/personnel/index.server';
import {
	createSupabaseRatingSchemeExportReader,
	createSupabaseRatingSchemeDuePort
} from '$features/rating-scheme/index.server';
import {
	createSupabaseSignInRosterPersistence,
	createSupabaseSignInRosterExportReader,
	createSupabaseSignInRosterFileWritePort
} from '$features/sign-in-rosters/index.server';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { createSupabaseAuditExportReader, createSupabaseAuditAdapter, getRequestInfo } from '$lib/audit/index.server';
import { getAdminClient } from '$lib/server/supabase';
import { validateUUID } from '$lib/server/validation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { createScopedDataStore } from './scopedDataStore';
import { defaultScopeRules } from './scopeRules';
import { createSupabaseDataStore } from './supabaseDataStore';
import { createSupabaseScopeEnforcementAdapter } from '$features/personnel/index.server';
import { createSupabaseStorageAdapter } from './supabaseStorage';

import {
	createSupabaseIdentityExportReader,
	createSupabaseSensitiveActionAuthorizer
} from '$features/identity/index.server';
import {
	createSupabaseOnboardingExportReader,
	createSupabaseOnboardingCalendarMarkersPort
} from '$features/onboarding/index.server';
import {
	loadOrganizationMemberLabels,
	loadPersonnelDocumentStorageCapBytes,
	resolveOrganizationRouteIdentity,
	type OrganizationMemberLabelRow
} from '$features/organization/index.server';
import type {
	CounselingRecordRow,
	FollowUpRow,
	LeaderNoteContext,
	LeaderNoteRow,
	PersonnelArtifactsContext,
	PersonnelDocumentRow
} from '$features/personnel/index.server';

import { readOrganizationMembershipForRequest } from '$features/organization/index.server';
import { getOrLoadRequestMembership } from '$lib/access/index.server';
import { projectOrganizationAccessGrant } from '$lib/access/memberAccessProjection';
import type { AuditPort } from '$lib/audit/contracts';
import type { DataStore, ScopeEnforcementPort, WritePorts } from '$lib/server/core/ports';
import type { Session } from '@supabase/supabase-js';

export interface AdmittedOrganizationRequest {
	readonly auth: OrganizationAccessGrant;
	readonly audit: AuditPort;
	readonly supabase: SupabaseClient;
	readonly session: Session | null;
	readonly store: DataStore;
	readonly rawStore: DataStore;
	readonly scope: ScopeEnforcementPort;
}

export type RequestContextBuilder<TContext> = (request: AdmittedOrganizationRequest) => TContext;

export function getAdmittedRequestClient(locals: App.Locals): { supabase: SupabaseClient; userId: string } {
	if (!locals.actor) throw error(401, 'Unauthorized');
	return { supabase: locals.supabase, userId: locals.actor.userId };
}

async function canonicalOrganizationId(supabase: SupabaseClient, segment: string): Promise<string> {
	if (validateUUID(segment)) return segment;
	const identity = await resolveOrganizationRouteIdentity(supabase, segment);
	if (!identity) throw error(404, 'Organization not found');
	return identity.id;
}

async function createOrganizationRequest(
	locals: App.Locals,
	supabase: SupabaseClient,
	userId: string,
	orgId: string,
	audit: AuditPort
): Promise<AdmittedOrganizationRequest> {
	const membership = await getOrLoadRequestMembership(locals, userId, orgId, () =>
		readOrganizationMembershipForRequest(supabase, userId, orgId)
	);
	const auth = projectOrganizationAccessGrant(membership, userId, orgId);
	const rawStore = createSupabaseDataStore(supabase);
	return {
		auth,
		audit,
		supabase,
		session: locals.session,
		rawStore,
		store: createScopedDataStore(
			rawStore,
			auth.scopeSet.kind === 'groups' ? auth.scopeSet.groupIds : null,
			defaultScopeRules
		),
		scope: createSupabaseScopeEnforcementAdapter({ supabase, orgId, scopeSet: auth.scopeSet })
	};
}

export async function buildRouteRequest(event: RequestEvent): Promise<AdmittedOrganizationRequest> {
	const { supabase, userId } = getAdmittedRequestClient(event.locals);
	const orgId = await canonicalOrganizationId(supabase, event.params.orgId as string);
	return createOrganizationRequest(
		event.locals,
		supabase,
		userId,
		orgId,
		createSupabaseAuditAdapter(orgId, getRequestInfo(event))
	);
}

export async function buildLayoutRequest(locals: App.Locals, orgId: string): Promise<AdmittedOrganizationRequest> {
	const { supabase, userId } = getAdmittedRequestClient(locals);
	const canonicalOrgId = await canonicalOrganizationId(supabase, orgId);
	return createOrganizationRequest(locals, supabase, userId, canonicalOrgId, { log() {} });
}

export function createRequestDataContext(request: AdmittedOrganizationRequest): WritePorts & { rawStore: DataStore } {
	return { auth: request.auth, audit: request.audit, store: request.store, rawStore: request.rawStore };
}

export function createRequestPersonnelArtifactsContext(
	request: AdmittedOrganizationRequest
): PersonnelArtifactsContext {
	return createPersonnelArtifactDeliveryContext({
		...request,
		personnelArtifactWrites: createSupabasePersonnelArtifactWritePort(request.supabase, getAdminClient),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		storage: createSupabaseStorageAdapter(request.supabase)
	});
}

export function createPersonnelArtifactDeliveryContext(
	request: Pick<AdmittedOrganizationRequest, 'auth' | 'audit' | 'store' | 'rawStore' | 'scope'> & {
		personnelArtifactWrites: ReturnType<typeof createSupabasePersonnelArtifactWritePort>;
		organizationSettings: Pick<ReturnType<typeof createSupabaseOrganizationSettingsReader>, 'findStorageCapBytes'>;
		storage: Pick<ReturnType<typeof createSupabaseStorageAdapter>, 'createSignedUrl'>;
	}
): PersonnelArtifactsContext {
	const orgId = request.auth.orgId;
	const requestStore = request.rawStore;
	const artifactWrites = request.personnelArtifactWrites;
	const organizationSettings = request.organizationSettings;
	const storage = request.storage;
	return {
		actor: request.auth,
		scope: request.scope,
		audit: request.audit,
		persistence: {
			async findPersonnelGroup(personnelId) {
				const row = await requestStore.findOne<{ group_id: string | null }>(
					'personnel',
					orgId,
					{ id: personnelId },
					'id, group_id'
				);
				return row?.group_id;
			},
			listCounselingRecords: (personnelId, { archived, limit }) =>
				request.store.findMany<CounselingRecordRow>(
					'counseling_records',
					orgId,
					{ personnel_id: personnelId },
					{
						orderBy: [
							{ column: 'date_conducted', ascending: false },
							{ column: 'created_at', ascending: false }
						],
						isNull: { archived_at: !archived },
						limit
					}
				),
			listDocuments: (personnelId, { archived, limit }) =>
				request.store.findMany<PersonnelDocumentRow>(
					'personnel_documents',
					orgId,
					{ personnel_id: personnelId },
					{
						orderBy: [{ column: 'created_at', ascending: false }],
						isNull: { archived_at: !archived },
						limit
					}
				),
			listFollowUps: (personnelId, { archived, limit }) =>
				request.store.findMany<FollowUpRow>(
					'personnel_follow_ups',
					orgId,
					{ personnel_id: personnelId, ...(archived ? { status: 'archived' } : {}) },
					{
						orderBy: [
							{ column: 'status', ascending: false },
							...(archived ? [{ column: 'archived_at', ascending: false }] : []),
							{ column: 'created_at', ascending: false }
						],
						...(archived ? {} : { notInFilters: { status: ['archived'] } }),
						limit
					}
				),
			findDocument: (personnelId, documentId) =>
				request.store.findOne<PersonnelDocumentRow>('personnel_documents', orgId, {
					id: documentId,
					personnel_id: personnelId
				})
		},
		writerFor(personnelId) {
			return artifactWrites.forPerson(request.auth, personnelId);
		},
		contributorLabels: (userIds) =>
			loadOrganizationMemberLabels(
				{
					async findMembers(memberOrgId, ids) {
						const rows: OrganizationMemberLabelRow[] = [];
						for (let from = 0; from < ids.length; from += 100) {
							rows.push(
								...(await requestStore.findMany<OrganizationMemberLabelRow>(
									'organization_memberships',
									memberOrgId,
									undefined,
									{ inFilters: { user_id: ids.slice(from, from + 100) } }
								))
							);
						}
						return rows;
					}
				},
				orgId,
				userIds
			),
		documentStorageCapBytes: () => loadPersonnelDocumentStorageCapBytes(organizationSettings, orgId),
		createDocumentSignedUrl: (filePath, expiresInSeconds) =>
			storage.createSignedUrl('personnel-documents', filePath, expiresInSeconds)
	};
}

export function createRequestPersonnelLeaderNoteContext(request: AdmittedOrganizationRequest): LeaderNoteContext {
	return createPersonnelLeaderNoteDeliveryContext({
		...request,
		personnelArtifactWrites: createSupabasePersonnelArtifactWritePort(request.supabase, getAdminClient)
	});
}

export function createPersonnelLeaderNoteDeliveryContext(
	request: Pick<AdmittedOrganizationRequest, 'auth' | 'audit' | 'store' | 'rawStore' | 'scope'> & {
		personnelArtifactWrites: ReturnType<typeof createSupabasePersonnelArtifactWritePort>;
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
				const row = await request.rawStore.findOne<{ group_id: string | null }>(
					'personnel',
					orgId,
					{ id: personnelId },
					'group_id'
				);
				return row?.group_id;
			},
			async listPage(personnelId, { archived, limit, before }) {
				const options = {
					orderBy: [
						{ column: 'created_at', ascending: false },
						{ column: 'id', ascending: false }
					],
					isNull: { archived_at: !archived },
					limit
				};
				if (!before) {
					return request.store.findMany<LeaderNoteRow>('leader_notes', orgId, { personnel_id: personnelId }, options);
				}
				const tied = await request.store.findMany<LeaderNoteRow>(
					'leader_notes',
					orgId,
					{ personnel_id: personnelId, created_at: before.createdAt },
					{ ...options, rangeFilters: [{ column: 'id', op: 'lt', value: before.id }] }
				);
				if (tied.length === limit) return tied;
				const older = await request.store.findMany<LeaderNoteRow>(
					'leader_notes',
					orgId,
					{ personnel_id: personnelId },
					{
						...options,
						limit: limit - tied.length,
						rangeFilters: [{ column: 'created_at', op: 'lt', value: before.createdAt }]
					}
				);
				return [...tied, ...older];
			},
			async find(personnelId, noteId) {
				return (await writerFor(personnelId)).find<LeaderNoteRow>('leader_notes', noteId);
			},
			async insert(input) {
				return (await writerFor(input.personnelId)).insert<LeaderNoteRow>('leader_notes', {
					author: input.author,
					text: input.text,
					created_at: input.createdAt
				});
			},
			async update(personnelId, noteId, archivedAt) {
				return (await writerFor(personnelId)).update<LeaderNoteRow>('leader_notes', noteId, {
					archived_at: archivedAt
				});
			},
			async delete(personnelId, noteId) {
				return (await writerFor(personnelId)).delete('leader_notes', noteId);
			}
		},
		contributorLabels: (userIds) =>
			loadOrganizationMemberLabels(
				{
					findMembers: (memberOrgId, ids) =>
						request.rawStore.findMany<OrganizationMemberLabelRow>('organization_memberships', memberOrgId, undefined, {
							inFilters: { user_id: ids }
						})
				},
				orgId,
				userIds
			)
	};
}

export function createRequestNotificationDelivery() {
	return createSupabaseNotificationDelivery({
		getAdminClient,
		resolveAdministratorRecipients: createSupabaseOrganizationAdministratorRecipients(getAdminClient)
	});
}

export function createRequestWriteContext(request: AdmittedOrganizationRequest): WritePorts {
	return { auth: request.auth, audit: request.audit, store: request.store };
}

export function createRequestActorContext(request: AdmittedOrganizationRequest) {
	return { auth: request.auth };
}

export function createRequestEmptyContext(_request: AdmittedOrganizationRequest) {
	return {};
}

export function createRequestPersonnelDetailContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		store: request.store,
		rawStore: request.rawStore,
		scope: request.scope
	};
}

export function createRequestPersonnelExtendedInfoContext(request: AdmittedOrganizationRequest) {
	return { auth: request.auth, audit: request.audit, store: request.store, scope: request.scope };
}

export function createRequestPersonnelAwardContext(request: AdmittedOrganizationRequest) {
	return { auth: request.auth, audit: request.audit, rawStore: request.rawStore, scope: request.scope };
}

export function createRequestPersonnelLifecycleContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		store: request.store,
		rawStore: request.rawStore,
		personnelArtifactWrites: createSupabasePersonnelArtifactWritePort(request.supabase, getAdminClient)
	};
}

export function createRequestPersonnelArchiveBatchContext(request: AdmittedOrganizationRequest) {
	return { ...createRequestPersonnelLifecycleContext(request), notifications: createRequestNotificationDelivery() };
}

export function createRequestPersonnelPermanentDeletionContext(request: AdmittedOrganizationRequest) {
	const notifications = createRequestNotificationDelivery();
	return {
		...createRequestDataContext(request),
		notifyPersonnelDeleted: (name: string) =>
			notifications.notifyAdmins(request.auth.orgId, request.auth.userId, {
				type: 'personnel_permanently_deleted',
				title: 'Personnel Permanently Deleted',
				message: `Personnel "${name}" was permanently deleted.`
			})
	};
}

export function createRequestPersonnelWorkspaceContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		store: request.store,
		rawStore: request.rawStore,
		personnelAwardAcknowledgement: createSupabasePersonnelAwardAcknowledgementPort(request.supabase),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase)
	};
}

export function createRequestPersonnelArchivedArtifactsContext(request: AdmittedOrganizationRequest) {
	return {
		artifacts: createRequestPersonnelArtifactsContext(request),
		leaderNotes: createRequestPersonnelLeaderNoteContext(request)
	};
}

export function createRequestPersonnelDetailStreamsContext(request: AdmittedOrganizationRequest) {
	const organizationSettings = createSupabaseOrganizationSettingsReader(request.supabase);
	return {
		detail: createRequestPersonnelDetailContext(request),
		criticalTaskLibrary: createSupabaseCriticalTaskLibraryPersistence(request.supabase, request.auth.orgId),
		extendedInfo: createRequestPersonnelExtendedInfoContext(request),
		artifacts: createRequestPersonnelArtifactsContext(request),
		leaderNotes: createRequestPersonnelLeaderNoteContext(request),
		loadLossWarningWindowDays: () => organizationSettings.findLossWarningWindowDays(request.auth.orgId)
	};
}

export function createRequestPersonnelExportContext(request: AdmittedOrganizationRequest) {
	return { auth: request.auth, audit: request.audit, rawStore: request.rawStore };
}

export function createRequestNotificationSelfContext(request: AdmittedOrganizationRequest) {
	return { auth: request.auth, audit: request.audit, store: createSupabaseNotificationStore(request.supabase) };
}

export function createRequestAvailabilityContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		store: request.store,
		rawStore: request.rawStore,
		personnelCalendarRoster: createSupabasePersonnelCalendarRosterPort(getAdminClient)
	};
}

export function createRequestDailyAssignmentContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestAvailabilityContext(request),
		calendarAssignmentReplacement: createSupabaseCalendarAssignmentReplacementPort(request.supabase)
	};
}

export function createRequestCalendarCatalogDeletionContext(request: AdmittedOrganizationRequest) {
	return { ...createRequestWriteContext(request), notifications: createRequestNotificationDelivery() };
}

export function createRequestCalendarRangeContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		store: request.store,
		personnelCalendarRoster: createSupabasePersonnelCalendarRosterPort(getAdminClient)
	};
}

export function createRequestCalendarWorkspaceContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestCalendarRangeContext(request),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		onboardingCalendarMarkers: createSupabaseOnboardingCalendarMarkersPort(request.supabase)
	};
}

export function createRequestCalendarReportContext(request: AdmittedOrganizationRequest) {
	return {
		auth: request.auth,
		audit: request.audit,
		store: request.store,
		rawStore: request.rawStore,
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
	return {
		...createRequestSignInRosterContext(request),
		userId: request.auth.userId,
		scopeSet: request.auth.scopeSet,
		personnelLookup: createSupabaseSignInRosterPersonnelLookupPort(getAdminClient),
		findGroupNamesByIds: (groupIds: string[]) =>
			findGroupNamesByIds({ auth: request.auth, store: request.rawStore }, groupIds),
		loadRankCatalog: () =>
			loadOrganizationRankCatalog(
				{ auth: request.auth, store: request.rawStore },
				{ authorization: 'training-records' }
			)
	};
}

export function createRequestSignInRosterUploadContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestSignInRosterContext(request),
		actor: request.auth,
		fileWrites: createSupabaseSignInRosterFileWritePort(request.supabase, getAdminClient)
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
	return { ...createRequestPersonnelLifecycleContext(request), notifications: createRequestNotificationDelivery() };
}

export function createRequestDashboardWorkspaceContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestDailyAssignmentContext(request),
		organizationSettings: createSupabaseOrganizationSettingsReader(request.supabase),
		ratingSchemeDue: createSupabaseRatingSchemeDuePort(request.supabase),
		personnelAwardAcknowledgement: createSupabasePersonnelAwardAcknowledgementPort(request.supabase)
	};
}

export function createRequestDashboardSummaryContext(request: AdmittedOrganizationRequest) {
	return {
		...createRequestDataContext(request),
		criticalTasksReadModel: createSupabaseCriticalTasksReadModelAdapter(request.supabase),
		criticalTaskLibrary: createSupabaseCriticalTaskLibraryPersistence(request.supabase, request.auth.orgId),
		personnelCriticalTasksRoster: createSupabasePersonnelCriticalTasksRosterPort(getAdminClient),
		personnelTrainingRoster: createSupabasePersonnelTrainingRosterPort(getAdminClient)
	};
}
