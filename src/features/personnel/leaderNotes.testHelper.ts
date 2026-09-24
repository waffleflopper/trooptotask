import type { createTestContext } from '$lib/server/adapters/inMemory';
import { loadOrganizationMemberLabels, type OrganizationMemberLabelRow } from '$features/organization/index.server';
import type { LeaderNoteContext, LeaderNoteRow } from './index.server';

export function testLeaderNoteContext(ctx: ReturnType<typeof createTestContext>): LeaderNoteContext {
	const orgId = ctx.auth.orgId;
	return {
		actor: ctx.auth,
		scope: ctx.scope,
		audit: ctx.audit,
		persistence: {
			async findPersonnelGroup(personnelId) {
				const row = await ctx.rawStore.findOne<{ group_id: string | null }>('personnel', orgId, { id: personnelId });
				return row?.group_id;
			},
			list: (personnelId, options) =>
				ctx.store.findMany<LeaderNoteRow>(
					'leader_notes',
					orgId,
					{ personnel_id: personnelId },
					{
						orderBy: [{ column: 'created_at', ascending: false }],
						isNull: { archived_at: !options.archived },
						limit: options.limit
					}
				),
			find: (personnelId, noteId) =>
				ctx.store.findOne<LeaderNoteRow>('leader_notes', orgId, { id: noteId, personnel_id: personnelId }),
			insert: (input) =>
				ctx.store.insert<LeaderNoteRow>('leader_notes', orgId, {
					personnel_id: input.personnelId,
					author: input.author,
					text: input.text,
					created_at: input.createdAt
				}),
			update: (noteId, archivedAt) =>
				ctx.store.update<LeaderNoteRow>('leader_notes', orgId, noteId, { archived_at: archivedAt }),
			delete: (noteId) => ctx.store.delete('leader_notes', orgId, noteId)
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
