import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { notifyAdmins } from '$lib/server/notifications';

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'privileged',
	mutation: true,
	fn: async (ctx, input) => {
		const { id } = input;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');

		const person = await ctx.store.findOne<{
			rank: string;
			first_name: string;
			last_name: string;
			archived_at: string | null;
		}>('personnel', ctx.auth.orgId, { id });

		if (!person) fail(404, 'Personnel not found');
		if (!person.archived_at) fail(400, 'Can only permanently delete archived personnel');

		await ctx.store.delete('personnel', ctx.auth.orgId, id);

		const personName = `${person.rank} ${person.last_name}, ${person.first_name}`;

		ctx.audit.log({
			action: 'personnel.permanently_deleted',
			resourceType: 'personnel',
			resourceId: id,
			details: { name: personName }
		});

		await notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
			type: 'personnel_permanently_deleted',
			title: 'Personnel Permanently Deleted',
			message: `Personnel "${personName}" was permanently deleted.`
		});

		return { success: true };
	}
});
