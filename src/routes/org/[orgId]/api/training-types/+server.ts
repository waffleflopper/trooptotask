import { trainingTypeCrudConfig } from '$lib/server/core/useCases/trainingTypeCrud';
import { crudHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = crudHandlers(trainingTypeCrudConfig);
