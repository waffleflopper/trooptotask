import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';
import { notifyAdminsViaStore } from '$lib/server/core/useCases/notifyAdminsHelper';

export const { POST, PUT, DELETE } = entityHandlers(AssignmentTypeEntity, {
	afterDelete: async (ctx) => {
		await notifyAdminsViaStore(ctx.store, ctx.auth.orgId, ctx.auth.userId, {
			type: 'config_type_deleted',
			title: 'Assignment Type Deleted',
			message: 'An assignment type was deleted.'
		});
	}
});
