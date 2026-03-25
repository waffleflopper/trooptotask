import { TrainingViewEntity } from '$lib/server/entities/trainingView';
import type { CrudConfig } from './crud';

export const trainingViewCrudConfig: CrudConfig = {
	entity: TrainingViewEntity,
	permission: 'training',
	auditResource: 'training_view',
	requireFullEditor: true
};
