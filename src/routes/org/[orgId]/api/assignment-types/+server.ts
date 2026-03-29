import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = entityHandlers(AssignmentTypeEntity, {
	afterDelete: async (ctx) => {
		await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
			type: 'config_type_deleted',
			title: 'Assignment Type Deleted',
			message: 'An assignment type was deleted.'
		});
	}
});
