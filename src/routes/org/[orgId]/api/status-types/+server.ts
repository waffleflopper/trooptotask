import { statusTypeCrudConfig } from '$lib/server/core/useCases/statusTypeCrud';
import { crudHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = crudHandlers(statusTypeCrudConfig);
