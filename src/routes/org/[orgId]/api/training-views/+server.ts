import { TrainingViewEntity } from '$lib/server/entities/trainingView';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = entityHandlers(TrainingViewEntity);
