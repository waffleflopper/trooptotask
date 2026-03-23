import { crudHandlers } from '$lib/server/adapters/httpAdapter';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';

// Note: No PUT handler - availability entries are created/deleted, not updated
const handlers = crudHandlers({
	entity: AvailabilityEntryEntity,
	permission: 'calendar',
	auditResource: 'availability'
});

export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
