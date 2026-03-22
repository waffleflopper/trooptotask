import { StatusTypeEntity } from '$lib/server/entities/statusType';
import { notifyAdminsViaStore } from './notifyAdminsHelper';
import type { CrudConfig } from './crud';

export const statusTypeCrudConfig: CrudConfig = {
	entity: StatusTypeEntity,
	permission: 'calendar',
	auditResource: 'status_type',
	requireFullEditor: true,
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
};
