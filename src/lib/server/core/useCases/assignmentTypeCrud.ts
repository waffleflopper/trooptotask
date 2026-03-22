import { AssignmentTypeEntity } from '$lib/server/entities/assignmentType';
import { notifyAdminsViaStore } from './notifyAdminsHelper';
import type { CrudConfig } from './crud';

export const assignmentTypeCrudConfig: CrudConfig = {
	entity: AssignmentTypeEntity,
	permission: 'calendar',
	auditResource: 'assignment_type',
	requireFullEditor: true,
	afterDelete: async (ctx) => {
		await notifyAdminsViaStore(ctx.store, ctx.auth.orgId, ctx.auth.userId, {
			type: 'config_type_deleted',
			title: 'Assignment Type Deleted',
			message: 'An assignment type was deleted.'
		});
	}
};
