import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { notifyAdminsViaStore } from './notifyAdminsHelper';
import type { CrudConfig } from './crud';

export const trainingTypeCrudConfig: CrudConfig = {
	entity: TrainingTypeEntity,
	permission: 'training',
	auditResource: 'training_type',
	requireFullEditor: true,
	beforeDelete: async (ctx, id) => {
		await ctx.store.deleteWhere('personnel_trainings', ctx.auth.orgId, {
			training_type_id: id
		});
	},
	afterDelete: async (ctx) => {
		await notifyAdminsViaStore(ctx.store, ctx.auth.orgId, ctx.auth.userId, {
			type: 'config_type_deleted',
			title: 'Training Type Deleted',
			message: 'A training type was deleted.'
		});
	}
};
