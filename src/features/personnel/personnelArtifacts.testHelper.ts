import type { createTestContext } from '$lib/server/adapters/inMemory';
import {
	loadOrganizationMemberLabels,
	loadPersonnelDocumentStorageCapBytes,
	type OrganizationMemberLabelRow
} from '$features/organization/index.server';
import type {
	PersonnelArtifactsContext,
	CounselingRecordRow,
	PersonnelDocumentRow,
	FollowUpRow
} from './personnelArtifactContext.server';

/** In-memory collaborators for owned operation tests; SDK delivery has separate checks. */
export function testPersonnelArtifactsContext(ctx: ReturnType<typeof createTestContext>): PersonnelArtifactsContext {
	const orgId = ctx.auth.orgId;
	return {
		actor: ctx.auth,
		scope: ctx.scope,
		audit: ctx.audit,
		persistence: {
			async findPersonnelGroup(personnelId) {
				return (await ctx.rawStore.findOne<{ group_id: string | null }>('personnel', orgId, { id: personnelId }))
					?.group_id;
			},
			listCounselingRecords: (personnelId, { archived, limit }) =>
				ctx.store.findMany<CounselingRecordRow>(
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
				ctx.store.findMany<PersonnelDocumentRow>(
					'personnel_documents',
					orgId,
					{ personnel_id: personnelId },
					{ orderBy: [{ column: 'created_at', ascending: false }], isNull: { archived_at: !archived }, limit }
				),
			listFollowUps: (personnelId, { archived, limit }) =>
				ctx.store.findMany<FollowUpRow>(
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
				ctx.store.findOne<PersonnelDocumentRow>('personnel_documents', orgId, {
					id: documentId,
					personnel_id: personnelId
				})
		},
		writerFor(personnelId) {
			if (!ctx.personnelArtifactWrites) throw new Error('Personnel artifact write port is required');
			return ctx.personnelArtifactWrites.forPerson(ctx.auth, personnelId);
		},
		contributorLabels: (ids) =>
			loadOrganizationMemberLabels(
				{
					findMembers: (memberOrgId, userIds) =>
						ctx.rawStore.findMany<OrganizationMemberLabelRow>('organization_memberships', memberOrgId, undefined, {
							inFilters: { user_id: userIds }
						})
				},
				orgId,
				ids
			),
		documentStorageCapBytes: () => loadPersonnelDocumentStorageCapBytes(ctx.organizationSettings, orgId),
		createDocumentSignedUrl: (path, expiresInSeconds) =>
			ctx.storage.createSignedUrl('personnel-documents', path, expiresInSeconds)
	};
}
