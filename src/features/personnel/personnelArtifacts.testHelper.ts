import type { createTestContext } from '$lib/server/adapters/inMemory';
import {
	loadOrganizationMemberLabels,
	loadPersonnelDocumentStorageCapBytes,
	type OrganizationMemberLabelRow
} from '$features/organization/index.server';
import { SENSITIVE_FILE_BUCKET } from '$lib/storage/sensitiveFiles';
import type { PersonnelArtifactsContext } from './personnelArtifactContext.server';

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
			listCounselingRecords: ctx.artifactReads.listCounselingRecords,
			countActiveCounselingRecords: ctx.artifactReads.countActiveCounselingRecords,
			listActiveCounselingDates: ctx.artifactReads.listActiveCounselingDates,
			findCounseling: ctx.artifactReads.findCounseling,
			listDocuments: ctx.artifactReads.listDocuments,
			summarizeActiveDocuments: ctx.artifactReads.summarizeActiveDocuments,
			listFollowUps: ctx.artifactReads.listFollowUps,
			findDocument: ctx.artifactReads.findDocument
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
			ctx.storage.createSignedUrl('personnel-documents', path, expiresInSeconds),
		createCounselingSignedUrl: (path, expiresInSeconds) =>
			ctx.storage.createSignedUrl(SENSITIVE_FILE_BUCKET, path, expiresInSeconds)
	};
}
