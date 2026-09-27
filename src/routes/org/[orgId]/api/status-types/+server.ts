import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = entityHandlers(StatusTypeEntity, {
	afterDelete: async (ctx) => {
		await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
			type: 'config_type_deleted',
			title: 'Status Type Deleted',
			message: 'A status type was deleted.'
		});
	}
});
