import { groupCrudConfig } from '$lib/server/core/useCases/groupCrud';
import { crudHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = crudHandlers(groupCrudConfig);
