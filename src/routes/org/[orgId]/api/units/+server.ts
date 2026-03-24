import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';

function toClient(row: Record<string, unknown>) {
	return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: async (ctx, input) => {
		const row = await ctx.store.insert<Record<string, unknown>>('units', ctx.auth.orgId, {
			name: input.name,
			sort_order: input.sortOrder ?? 0
		});

		ctx.audit.log({ action: 'unit.created', resourceType: 'unit', resourceId: row.id as string });
		return toClient(row);
	}
});

export const PUT = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: async (ctx, input) => {
		const { id, ...fields } = input;
		if (!id) fail(400, 'Missing id');

		const updates: Record<string, unknown> = {};
		if (fields.name !== undefined) updates.name = fields.name;
		if (fields.sortOrder !== undefined) updates.sort_order = fields.sortOrder;

		const row = await ctx.store.update<Record<string, unknown>>('units', ctx.auth.orgId, id as string, updates);

		ctx.audit.log({ action: 'unit.updated', resourceType: 'unit', resourceId: id as string });
		return toClient(row);
	}
});

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: async (ctx, input) => {
		const { id } = input;
		if (!id) fail(400, 'Missing id');

		await ctx.store.delete('units', ctx.auth.orgId, id as string);

		ctx.audit.log({ action: 'unit.deleted', resourceType: 'unit', resourceId: id as string });
		return { success: true };
	}
});
