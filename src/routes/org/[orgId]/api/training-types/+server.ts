import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';
import { notifyAdminsViaStore } from '$lib/server/core/useCases/notifyAdminsHelper';

export const { POST, PUT, DELETE } = entityHandlers(TrainingTypeEntity, {
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
});
