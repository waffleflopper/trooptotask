import { GroupEntity } from '$lib/server/entities/group';
import type { CrudConfig } from './crud';

export const groupCrudConfig: CrudConfig = {
	entity: GroupEntity,
	permission: 'personnel',
	auditResource: 'group'
};
