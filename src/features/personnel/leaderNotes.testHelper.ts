import type { createTestContext } from '$lib/server/adapters/inMemory';
import { loadOrganizationMemberLabels, type OrganizationMemberLabelRow } from '$features/organization/index.server';
import type { LeaderNoteContext, LeaderNoteRow } from './index.server';

export function testLeaderNoteContext(ctx: ReturnType<typeof createTestContext>): LeaderNoteContext {
	const orgId = ctx.auth.orgId;
	const writerFor = (personnelId: string) => {
		if (!ctx.personnelArtifactWrites) throw new Error('Personnel artifact write port is required');
		return ctx.personnelArtifactWrites.forPerson(ctx.auth, personnelId);
	};
	return {
		actor: ctx.auth,
		scope: ctx.scope,
		audit: ctx.audit,
		persistence: {
			async findPersonnelGroup(personnelId) {
				const row = await ctx.rawStore.findOne<{ group_id: string | null }>('personnel', orgId, { id: personnelId });
				return row?.group_id;
			},
			async listPage(personnelId, { archived, limit, before }) {
				const rows = await ctx.store.findMany<LeaderNoteRow>(
					'leader_notes',
					orgId,
					{ personnel_id: personnelId },
					{
						orderBy: [
							{ column: 'created_at', ascending: false },
							{ column: 'id', ascending: false }
						],
						isNull: { archived_at: !archived }
					}
				);
				return rows
					.filter(
						(row) =>
							!before ||
							row.created_at < before.createdAt ||
							(row.created_at === before.createdAt && row.id < before.id)
					)
					.slice(0, limit);
			},
			countActive: (personnelId) =>
				ctx.store
					.findMany<LeaderNoteRow>(
						'leader_notes',
						orgId,
						{ personnel_id: personnelId },
						{ isNull: { archived_at: true } }
					)
					.then((rows) => rows.length),
			find: async (personnelId, noteId) => (await writerFor(personnelId)).findLeaderNote(noteId),
			insert: async (input) =>
				(await writerFor(input.personnelId)).createLeaderNote({
					author: input.author,
					text: input.text,
					createdAt: input.createdAt
				}),
			setArchive: async (personnelId, noteId, archived) =>
				(await writerFor(personnelId)).setLeaderNoteArchive(noteId, archived),
			setText: async (personnelId, noteId, text, updatedAt) =>
				(await writerFor(personnelId)).setLeaderNoteText(noteId, text, updatedAt),
			delete: async (personnelId, noteId) => (await writerFor(personnelId)).deleteLeaderNote(noteId)
		},
		contributorLabels: (userIds) =>
			loadOrganizationMemberLabels(
				{
					findMembers: (memberOrgId, ids) =>
						ctx.rawStore.findMany<OrganizationMemberLabelRow>('organization_memberships', memberOrgId, undefined, {
							inFilters: { user_id: ids }
						})
				},
				orgId,
				userIds
			)
	};
}
