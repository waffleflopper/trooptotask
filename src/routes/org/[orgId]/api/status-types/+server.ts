import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';
import { notifyAdminsViaStore } from '$lib/server/core/useCases/notifyAdminsHelper';

export const { POST, PUT, DELETE } = entityHandlers(StatusTypeEntity, {
	beforeDelete: async (ctx, id) => {
		await ctx.store.deleteWhere('availability_entries', ctx.auth.orgId, {
			status_type_id: id
		});
	},
	afterDelete: async (ctx) => {
		await notifyAdminsViaStore(ctx.store, ctx.auth.orgId, ctx.auth.userId, {
			type: 'config_type_deleted',
			title: 'Status Type Deleted',
			message: 'A status type was deleted.'
		});
	}
});
