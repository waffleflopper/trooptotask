import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';

// Note: No PUT handler - availability entries are created/deleted, not updated
export const { POST, DELETE } = AvailabilityEntryEntity.handlers;
