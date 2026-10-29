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

interface GroupWriteContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	groups: Pick<GroupPersistence, 'listCatalog' | 'create' | 'rename' | 'setOrder' | 'deleteWithReassignment'>;
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
const orderInput = z.object({
	groupIds: z.array(uuidSchema).max(1000),
	expectedGroupIds: z.array(uuidSchema).max(1000),
	parentId: uuidSchema.nullable().optional()
});
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

export async function createGroup(ctx: GroupWriteContext, input: Record<string, unknown>) {
	const data = validatedInput(createInput, input);
	await requireGroupManager(ctx);
	const row = await ctx.groups.create(data);
	await ctx.audit.log({ action: 'group.created', resourceType: 'group', resourceId: row.id });
	return row;
}

export async function renameGroup(ctx: GroupWriteContext, input: Record<string, unknown>) {
	const { id, name } = validatedInput(renameInput, input);
	await requireGroupManager(ctx, id);
	const row = await ctx.groups.rename(id, name);
	await ctx.audit.log({ action: 'group.updated', resourceType: 'group', resourceId: id });
	return row;
}

export async function setGroupOrder(ctx: GroupWriteContext, input: Record<string, unknown>): Promise<void> {
	const { groupIds, expectedGroupIds, parentId } = validatedInput(orderInput, input);
	await requireGroupManager(ctx);
	await ctx.groups.setOrder(groupIds, expectedGroupIds, parentId);
	await ctx.audit.log({
		action: 'group.reordered',
		resourceType: 'organization',
		resourceId: ctx.auth.orgId,
		details: { groupIds }
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
	await ctx.audit.log({
		action: 'group.deleted',
		resourceType: 'group',
		resourceId: id,
		details: { moveMembersTo, movedCount }
	});
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
	if (moved.length) {
		await ctx.audit.log({
			action: 'personnel.group_changed',
			resourceType: 'personnel',
			details: { groupId, personnelIds: moved }
		});
	}
	const inGroup = new Set([...already, ...moved]);
	return {
		groupId,
		movedIds: ids.filter((id) => inGroup.has(id)),
		unavailableIds: ids.filter((id) => !inGroup.has(id))
	};
}
