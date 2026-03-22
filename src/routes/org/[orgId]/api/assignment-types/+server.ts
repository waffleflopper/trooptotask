import { assignmentTypeCrudConfig } from '$lib/server/core/useCases/assignmentTypeCrud';
import { crudHandlers } from '$lib/server/adapters/httpAdapter';

export const { POST, PUT, DELETE } = crudHandlers(assignmentTypeCrudConfig);
