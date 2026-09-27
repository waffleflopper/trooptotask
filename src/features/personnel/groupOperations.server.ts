import { error } from '@sveltejs/kit';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { GroupEntity } from './groupEntity.server';

interface GroupWriteContext {
	auth: Parameters<typeof requireFeaturePolicy>[0]['auth'];
	audit: NonNullable<Parameters<typeof requireFeaturePolicy>[0]['audit']>;
	store: {
		insert<T>(table: string, orgId: string, data: Record<string, unknown>, select?: string): Promise<T>;
		update<T>(table: string, orgId: string, id: string, data: Record<string, unknown>, select?: string): Promise<T>;
		delete(table: string, orgId: string, id: string): Promise<void>;
	};
}

function validatedInput(schema: typeof GroupEntity.createSchema, input: Record<string, unknown>) {
	const result = schema.safeParse(input);
	if (!result.success) throw error(400, result.error.issues.map((issue) => issue.message).join('; '));
	return result.data;
}

async function requireGroupManager(ctx: GroupWriteContext, id?: string): Promise<void> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.manageGroups, { kind: 'organization' }, 'group', id);
}

export async function createGroup(ctx: GroupWriteContext, input: Record<string, unknown>) {
	const data = validatedInput(GroupEntity.createSchema, input);
	await requireGroupManager(ctx);
	const row = await ctx.store.insert<Record<string, unknown>>(
		GroupEntity.table,
		ctx.auth.orgId,
		GroupEntity.toDbInsert(data, ctx.auth.orgId),
		GroupEntity.select
	);
	ctx.audit.log({ action: 'group.created', resourceType: 'group', resourceId: row.id as string | undefined });
	return GroupEntity.fromDb(row);
}

export async function updateGroup(ctx: GroupWriteContext, input: Record<string, unknown>) {
	const data = validatedInput(GroupEntity.updateSchema, input);
	const id = data.id as string;
	await requireGroupManager(ctx, id);
	const row = await ctx.store.update<Record<string, unknown>>(
		GroupEntity.table,
		ctx.auth.orgId,
		id,
		GroupEntity.toDbUpdate(data),
		GroupEntity.select
	);
	ctx.audit.log({ action: 'group.updated', resourceType: 'group', resourceId: id });
	return GroupEntity.fromDb(row);
}

export async function deleteGroup(ctx: GroupWriteContext, id: string): Promise<void> {
	await requireGroupManager(ctx, id);
	await ctx.store.delete(GroupEntity.table, ctx.auth.orgId, id);
	ctx.audit.log({ action: 'group.deleted', resourceType: 'group', resourceId: id });
}
