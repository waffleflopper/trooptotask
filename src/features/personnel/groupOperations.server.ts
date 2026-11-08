import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { error } from '@sveltejs/kit';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { z } from 'zod';
import { uuidSchema, issueMessage } from '$lib/utils/inputSchemas';
import {
	deletionBlockedMessage,
	GROUP_UNAVAILABLE_MESSAGE,
	type GroupPersistence,
	type PersonnelDeletionReferencesPort,
	type PersonnelRecordPersistence
} from './contracts';
import { nextSortOrder } from './groupStructure';
import { buildGroupTree } from './groupTree';

interface GroupWriteContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	groups: Pick<
		GroupPersistence,
		'listCatalog' | 'countArchivedMembers' | 'create' | 'rename' | 'move' | 'setOrder' | 'deleteWithReassignment'
	>;
}
const groupName = z
	.string()
	.trim()
	.min(1, 'Group name is required')
	.max(100, 'Group name must be 100 characters or fewer')
	.refine((name) => !name.includes(' / '), 'Group name cannot contain the path separator');
const createInput = z.object({
	name: groupName,
	sortOrder: z.number().int().optional(),
	parentId: uuidSchema.nullable().optional()
});
const renameInput = z.object({ id: uuidSchema, name: groupName });
const moveInput = z.object({ id: uuidSchema, parentId: uuidSchema.nullable() });
const orderInput = z.object({
	groupIds: z.array(uuidSchema).max(1000),
	expectedGroupIds: z.array(uuidSchema).max(1000),
	parentId: uuidSchema.nullable().optional()
});
const archivedMembersInput = z.object({ groupId: uuidSchema });
const deleteInput = z.object({ id: uuidSchema, moveMembersTo: uuidSchema.nullable().default(null) });

function validatedInput<T>(schema: z.ZodType<T>, input: unknown): T {
	const result = schema.safeParse(input);
	if (!result.success) throw error(400, issueMessage(result.error));
	return result.data;
}

async function requireGroupManager(ctx: GroupWriteContext, id?: string): Promise<void> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.manageGroups, { kind: 'organization' }, 'group', id);
}

export async function readGroupEditorCatalog(ctx: GroupWriteContext) {
	await requireGroupManager(ctx);
	return ctx.groups.listCatalog();
}

/** Archived People in the Group and every Group under it: the ones a delete moves that the roster does not show. */
export async function countArchivedGroupMembers(ctx: GroupWriteContext, input: Record<string, unknown>) {
	const { groupId } = validatedInput(archivedMembersInput, input);
	await requireGroupManager(ctx, groupId);
	const tree = buildGroupTree(await ctx.groups.listCatalog());
	if (!tree.node(groupId)) throw error(404, GROUP_UNAVAILABLE_MESSAGE);
	const subtree = tree.ordered.filter((node) => tree.contains(groupId, node.id)).map((node) => node.id);
	return { count: await ctx.groups.countArchivedMembers(subtree) };
}

export async function createGroup(ctx: GroupWriteContext, input: Record<string, unknown>) {
	const data = validatedInput(createInput, input);
	await requireGroupManager(ctx);
	const sortOrder = data.sortOrder ?? nextSortOrder(await ctx.groups.listCatalog(), data.parentId ?? null);
	const row = await ctx.groups.create({ ...data, sortOrder });
	return row;
}

export async function renameGroup(ctx: GroupWriteContext, input: Record<string, unknown>) {
	const { id, name } = validatedInput(renameInput, input);
	await requireGroupManager(ctx, id);
	const row = await ctx.groups.rename(id, name);
	return row;
}

export async function moveGroup(ctx: GroupWriteContext, input: Record<string, unknown>) {
	const { id, parentId } = validatedInput(moveInput, input);
	if (parentId === id) throw error(400, 'A Group cannot move under one of its own sub-groups.');
	await requireGroupManager(ctx, id);
	const row = await ctx.groups.move(id, parentId);
	return row;
}

export async function setGroupOrder(ctx: GroupWriteContext, input: Record<string, unknown>): Promise<void> {
	const { groupIds, expectedGroupIds, parentId } = validatedInput(orderInput, input);
	await requireGroupManager(ctx);
	await ctx.groups.setOrder(groupIds, expectedGroupIds, parentId);
	if (groupIds.length === 0) return;
	await ctx.audit.log({
		action: 'group.reordered',
		resourceType: 'organization',
		resourceId: ctx.auth.orgId,
		details: { count: groupIds.length }
	});
}

export async function deleteGroup(
	ctx: GroupWriteContext & { deletionReferences: PersonnelDeletionReferencesPort },
	input: Record<string, unknown>
) {
	const { id, moveMembersTo } = validatedInput(deleteInput, input);
	if (moveMembersTo === id) throw error(400, 'Choose another Group for the members');
	await requireGroupManager(ctx, id);
	const blocked = deletionBlockedMessage(
		'This Group',
		'responsible for',
		await ctx.deletionReferences.find({ groupId: id })
	);
	if (blocked) throw error(409, blocked);
	const movedCount = await ctx.groups.deleteWithReassignment(id, moveMembersTo);
	return { movedCount };
}

interface GroupMembershipContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	personnel: Pick<PersonnelRecordPersistence, 'listArchiveCandidates' | 'moveToGroup'>;
	groups: Pick<GroupPersistence, 'findReference'>;
}

export const GROUP_MEMBERSHIP_BATCH_LIMIT = 500;
const membershipInput = z.object({
	personnelIds: z
		.array(uuidSchema, 'Choose People to move')
		.min(1, 'Choose People to move')
		.max(GROUP_MEMBERSHIP_BATCH_LIMIT, `Move at most ${GROUP_MEMBERSHIP_BATCH_LIMIT} People at a time`),
	groupId: uuidSchema.nullable()
});

export interface GroupMembershipResult {
	groupId: string | null;
	movedIds: string[];
	unavailableIds: string[];
}

export async function moveGroupMembers(
	ctx: GroupMembershipContext,
	input: Record<string, unknown>
): Promise<GroupMembershipResult> {
	const { personnelIds, groupId } = validatedInput(membershipInput, input);
	const ids = [...new Set(personnelIds)];
	const manageRecords = (group: string | null) =>
		requireFeaturePolicy(
			ctx,
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResourceForGroup(group),
			'personnel'
		);

	await manageRecords(groupId);
	if (groupId && !(await ctx.groups.findReference(groupId))) throw error(404, GROUP_UNAVAILABLE_MESSAGE);
	const active = (await ctx.personnel.listArchiveCandidates(ids)).filter((person) => !person.archivedAt);
	for (const currentGroup of new Set(active.map((person) => person.groupId))) await manageRecords(currentGroup);

	const already = active.filter((person) => person.groupId === groupId).map((person) => person.id);
	const moving = active.filter((person) => person.groupId !== groupId).map((person) => person.id);
	const moved = moving.length ? await ctx.personnel.moveToGroup(moving, groupId) : [];
	const inGroup = new Set([...already, ...moved]);
	return {
		groupId,
		movedIds: ids.filter((id) => inGroup.has(id)),
		unavailableIds: ids.filter((id) => !inGroup.has(id))
	};
}

const undoMoveInput = z.object({
	moves: z
		.array(
			z
				.object({ personnelId: uuidSchema, fromGroupId: uuidSchema.nullable(), toGroupId: uuidSchema.nullable() })
				.strict()
		)
		.min(1, 'Nothing to undo')
		.max(GROUP_MEMBERSHIP_BATCH_LIMIT, `Undo at most ${GROUP_MEMBERSHIP_BATCH_LIMIT} People at a time`)
		.refine((moves) => new Set(moves.map((move) => move.personnelId)).size === moves.length, 'Each person appears once')
});

export interface GroupMembershipUndoResult {
	restoredIds: string[];
	/** People who were archived, removed or moved again since; left in the Group they are in now. */
	changedIds: string[];
}

/**
 * Puts People back in the Group a move took them from, only while each is still in the Group the move put them in.
 * The actor needs the same Personnel access as for a move, in both Groups of every pair.
 */
export async function undoGroupMembers(
	ctx: GroupMembershipContext,
	input: Record<string, unknown>
): Promise<GroupMembershipUndoResult> {
	const { moves } = validatedInput(undoMoveInput, input);
	const groupsInvolved = new Set(moves.flatMap((move) => [move.fromGroupId, move.toGroupId]));
	await Promise.all(
		[...groupsInvolved].map((group) =>
			requireFeaturePolicy(
				ctx,
				POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResourceForGroup(group),
				'personnel'
			)
		)
	);

	const destinations = [...new Set(moves.flatMap((move) => (move.toGroupId ? [move.toGroupId] : [])))];
	const existing = new Set(
		(await Promise.all(destinations.map((id) => ctx.groups.findReference(id))))
			.filter((group) => group !== null)
			.map((group) => group.id)
	);

	const pairs = new Map<string, { from: string | null; to: string | null; ids: string[] }>();
	for (const move of moves) {
		if (move.toGroupId && !existing.has(move.toGroupId)) continue;
		const key = `${move.fromGroupId}>${move.toGroupId}`;
		const pair = pairs.get(key) ?? { from: move.fromGroupId, to: move.toGroupId, ids: [] };
		pair.ids.push(move.personnelId);
		pairs.set(key, pair);
	}
	const restored = new Set(
		(
			await Promise.all(
				[...pairs.values()].map((pair) => ctx.personnel.moveToGroup(pair.ids, pair.to, { groupId: pair.from }))
			)
		).flat()
	);
	const ids = moves.map((move) => move.personnelId);
	return { restoredIds: ids.filter((id) => restored.has(id)), changedIds: ids.filter((id) => !restored.has(id)) };
}
