import { trainingViewCrudConfig } from '$lib/server/core/useCases/trainingViewCrud';
import { crudHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = crudHandlers(trainingViewCrudConfig);
